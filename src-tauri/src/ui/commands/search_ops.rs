use crate::data::models::tags::Tag;
use crate::data::models::{SearchResponse, SearchChunk};
// use crate::data::scrapers::utils::{chrome_145_user_agent};
// removed usage of clients or agents from this file, for consistency ykyk, i got confused breh
use crate::data::scrapers::*;
use crate::data::storage::TagCacheManager;
use futures::stream::{FuturesUnordered, StreamExt};
use rand::seq::SliceRandom;
use std::collections::HashSet;
use std::time::Instant;
use tauri::ipc::Channel;

#[tauri::command]
pub async fn search_wallpapers(
    query: String,
    sources: Option<Vec<String>>,
    limit_per_source: Option<usize>,
    randomize: Option<bool>,
    page: Option<u32>,
    purity: Option<String>,
    ai_art: Option<bool>,
    on_event: Channel<SearchChunk>,
) -> Result<(), String> {
    let sources = sources.unwrap_or_else(|| {
        vec![
            "wallhaven".to_string(),
            "moewalls".to_string(),
            "wallpapers".to_string(),
            "wallpaperflare".to_string(),
            "motionbgs".to_string(),
            "wallpaperwaifu".to_string(),
            "konachan".to_string(),
            "wallpaper_archive".to_string(),
            "wallpaper_archive_laxentainc".to_string(),
        ]
    });
    let limit = limit_per_source.unwrap_or(10);
    let should_randomize = randomize.unwrap_or(true);
    let page_num = page.unwrap_or(1);
    let purity_val = purity.unwrap_or_else(|| "100".to_string());
    let ai_art_enabled = ai_art.unwrap_or(false);

    let start_time = Instant::now();
    println!(
        "[BACKEND:SEARCH] Starting PARALLEL search - query: '{}', page: {}, limit: {}, sources: {}",
        query,
        page_num,
        limit,
        sources.join(",")
    );

    // Create futures for all sources
    let futures: Vec<_> = sources
        .iter()
        .map(|source| {
            let source = source.clone();
            let query = query.clone();
            let purity_val = purity_val.clone();
            async move {
                let scrape_start = Instant::now();
                let result = match source.as_str() {
                    "wallhaven" => {
                        scrape_wallhaven(&query, page_num, ai_art_enabled, &purity_val, limit).await
                    }
                    "moewalls" => scrape_moewalls(Some(&query), limit, false, page_num).await,
                    "wallpapers" => scrape_wallpapers_com(&query, limit, page_num).await,
                    "wallpaperflare" => scrape_wallpaperflare(&query, limit, page_num).await,
                    "motionbgs" => scrape_motionbgs(&query, limit, page_num).await,
                    "wallpaperwaifu" => scrape_wallpaperwaifu(&query, limit, page_num).await,
                    "wallpapersclan" => scrape_wallpapersclan(&query, limit, page_num).await,
                    "desktophut" => scrape_desktophut(&query, limit, page_num).await,
                    "wallpaper_archive" => scrape_wallpaper_archive(&query, limit, page_num).await,
                    "wallpaper_archive_laxentainc" => scrape_wallpaper_archive_laxentainc(&query, limit, page_num).await,
                    "konachan" => {
                        // For empty queries or generic defaults, use random (which contains Post.register_tags)
                        // Random pages support pagination, so we can get more results | needs fix
                        let query_trimmed = query.trim();
                        if query_trimmed.is_empty() || 
                            query_trimmed.eq_ignore_ascii_case("anime") || 
                            query_trimmed.eq_ignore_ascii_case("random") {
                            // Use random for empty/default queries to get tags from Post.register_tags
                            // Increase limit for random pages since they support pagination
                            let random_limit = limit.max(50); // Get more results from random pages
                            println!(
                                "[BACKEND:SEARCH] Konachan using random (query: '{}', limit: {}, page: {})",
                                query, random_limit, page_num
                            );
                            scrape_konachan(None, random_limit, page_num).await
                        } else {
                            // Expand generic search terms using cached tags with fuzzy matching
                            let expanded_queries = match konachan::expand_search_terms_with_cache(&query) {
                                Ok(expanded) => expanded,
                                Err(e) => {
                                    println!(
                                        "[BACKEND:SEARCH] Konachan tag expansion failed: {}, using original query",
                                        e
                                    );
                                    vec![query.clone()]
                                }
                            };
                            
                            println!("[BACKEND:SEARCH] Konachan will search multiple tags: {:?}", expanded_queries);
                            
                            let mut konachan_futures = Vec::new();
                            // If we have multiple queries, we can lower the limit per query to avoid fetching too many
                            let limit_per_query = if expanded_queries.len() > 1 { limit.max(20) } else { limit };
                            
                            for tag in expanded_queries {
                                let tag_clone = tag.clone();
                                konachan_futures.push(async move {
                                    scrape_konachan(Some(&tag_clone), limit_per_query, page_num).await
                                });
                            }
                            
                            let konachan_results = futures::future::join_all(konachan_futures).await;
                            let mut all_konachan_items = Vec::new();
                            let mut last_err = None;
                            
                            for res in konachan_results {
                                match res {
                                    Ok(items) => all_konachan_items.extend(items),
                                    Err(e) => last_err = Some(e),
                                }
                            }
                            
                            // Remove duplicates within Konachan results just in case
                            let mut seen_k = std::collections::HashSet::new();
                            all_konachan_items.retain(|item| seen_k.insert(item.id.clone()));
                            
                            if all_konachan_items.is_empty() && last_err.is_some() {
                                Err(last_err.unwrap())
                            } else {
                                Ok(all_konachan_items)
                            }
                        }
                    }
                    _ => return (source, Err("Unknown source".to_string()), 0),
                };
                let elapsed = scrape_start.elapsed().as_millis() as u64;
                (source, result, elapsed)
            }
        })
        .collect();

    // Execute all futures as a stream in the background
    tauri::async_runtime::spawn(async move {
        let mut stream = FuturesUnordered::new();
        for f in futures {
            stream.push(f);
        }

        let mut seen = HashSet::new();

        while let Some((source, result, elapsed_ms)) = stream.next().await {
            let mut chunk = SearchChunk {
                source: source.clone(),
                items: Vec::new(),
                error: None,
                is_complete: false,
            };

            match result {
                Ok(mut items) => {
                    let count = items.len();
                    println!(
                        "[BACKEND:SCRAPE] {} - {} items in {}ms",
                        source, count, elapsed_ms
                    );
                    
                    // Deduplicate
                    items.retain(|item| seen.insert(item.id.clone()));
                    
                    if should_randomize {
                        let mut rng = rand::thread_rng();
                        items.shuffle(&mut rng);
                    }
                    chunk.items = items;
                }
                Err(e) => {
                    println!(
                        "[BACKEND:SCRAPE] {} - ERROR in {}ms: {}",
                        source, elapsed_ms, e
                    );
                    chunk.error = Some(e);
                }
            }

            if let Err(e) = on_event.send(chunk) {
                println!("[BACKEND:SEARCH] Failed to send chunk over IPC: {}", e);
                break;
            }
        }

        let total_elapsed = start_time.elapsed().as_millis();
        println!(
            "[BACKEND:SEARCH] Streaming complete (fetched in {}ms)",
            total_elapsed
        );

        // Send final completion marker
        let _ = on_event.send(SearchChunk {
            source: "system".to_string(),
            items: Vec::new(),
            error: None,
            is_complete: true,
        });
    });

    Ok(())
}

#[tauri::command]
pub async fn fetch_live2d(query: Option<String>) -> Result<SearchResponse, String> {
    match scrape_moewalls(query.as_deref(), 50, true, 1).await {
        Ok(items) => Ok(SearchResponse {
            success: true,
            items,
            errors: None,
        }),
        Err(e) => Ok(SearchResponse {
            success: false,
            items: Vec::new(),
            errors: Some(vec![e]),
        }),
    }
}

#[tauri::command]
pub async fn resolve_wallpaperflare_highres(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("info: resolving high-res for: {}", detail_url);

    match resolve_wallpaperflare_download(&detail_url).await {
        Ok((high_res_url, _, _)) => {
            println!("OK resolved to: {}", high_res_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(high_res_url),
                url4k: None,
                error: None,
            })
        }
        Err(e) => {
            println!("error: failed to resolve: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

#[tauri::command]
pub async fn resolve_motionbgs_video(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("info: RESOLVING motionBg video: {}", detail_url);

    match scrape_motionbgs_detail(&detail_url).await {
        Ok((video_url, video_url_4k)) => {
            println!("ok: found video url: {}", video_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(video_url),
                url4k: video_url_4k,
                error: None,
            })
        }
        Err(e) => {
            println!("error: failed to resolve: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

#[tauri::command]
pub async fn resolve_wallpaperwaifu_video(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("info: RESOLVING wallpaperwaifu video: {}", detail_url);

    let preview_result = scrape_wallpaperwaifu_detail(&detail_url).await;
    let download_result = scrape_wallpaperwaifu_download(&detail_url).await;

    match (preview_result, download_result) {
        (Ok(preview_url), Ok(download_url)) => {
            println!("ok: found preview url: {}", preview_url);
            println!("ok: found download url: {}", download_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(preview_url),
                url4k: Some(download_url),
                error: None,
            })
        }
        (Ok(preview_url), Err(_)) => {
            println!("warn: found preview but download failed, using preview");
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(preview_url),
                url4k: None,
                error: None,
            })
        }
        (Err(e), _) => {
            println!("error: failed to resolve preview: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

#[tauri::command]
pub async fn resolve_wallpapersclan_highres(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("info: RESOLVING wallpapersclan download: {}", detail_url);

    match resolve_wallpapersclan_download(&detail_url).await {
        Ok(download_url) => {
            println!("ok: found download url: {}", download_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(download_url),
                url4k: None,
                error: None,
            })
        }
        Err(e) => {
            println!("error: failed to resolve: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

#[tauri::command]
pub async fn resolve_desktophut_video(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("info: RESOLVING desktophut video: {}", detail_url);

    match scrape_desktophut_detail(&detail_url).await {
        Ok((preview_url, download_url, _, _)) => {
            println!("ok: desktophut preview: {}", preview_url);
            println!("ok: desktophut download: {}", download_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(preview_url),
                url4k: Some(download_url),
                error: None,
            })
        }
        Err(e) => {
            println!("error: failed to resolve desktophut: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

/// Resolve high-resolution image URL for Konachan
/// Fetches the detail page and extracts the high-res URL from the "View larger version" link
#[tauri::command]
pub async fn resolve_konachan_highres(
    detail_url: String,
) -> Result<crate::data::models::ResolveHighResResponse, String> {
    println!("[RESOLVE:KONACHAN] Resolving high-res for: {}", detail_url);

    match konachan::resolve_konachan_highres_url(&detail_url).await {
        Ok(high_res_url) => {
            println!("[RESOLVE:KONACHAN] Found high-res URL: {}", high_res_url);
            Ok(crate::data::models::ResolveHighResResponse {
                success: true,
                url: Some(high_res_url),
                url4k: None,
                error: None,
            })
        }
        Err(e) => {
            println!("[RESOLVE:KONACHAN] Failed to resolve: {}", e);
            Ok(crate::data::models::ResolveHighResResponse {
                success: false,
                url: None,
                url4k: None,
                error: Some(e),
            })
        }
    }
}

/// Tag autocomplete - searches local cache first, fetches from Konachan if needed
/// Accumulates tags over time for faster future autocomplete (nsfw unused ;3)
#[tauri::command]
pub async fn autocomplete_tags(query: String, _is_nsfw: bool) -> Result<Vec<Tag>, String> {
    let cache_manager = TagCacheManager::new("tags.json")?;
    let cached_results = cache_manager.search(&query, 15)?;

    println!(
        "[AUTOCOMPLETE] Query '{}' - {} cached results",
        query,
        cached_results.len()
    );

    if cached_results.len() >= 5 {
        return Ok(cached_results);
    }

    match konachan::fetch_konachan_tags(&query, 20).await {
        Ok(new_tags) => {
            println!(
                "[AUTOCOMPLETE] Fetched {} new tags from Konachan",
                new_tags.len()
            );

            if let Err(e) = cache_manager.add_tags(new_tags.clone()) {
                println!("[AUTOCOMPLETE] Warning: failed to cache tags: {}", e);
            }

            let mut combined = cached_results;
            for tag in new_tags {
                if !combined.iter().any(|t| t.name == tag.name) {
                    combined.push(tag);
                }
            }

            combined.sort_by(|a, b| b.count.unwrap_or(0).cmp(&a.count.unwrap_or(0)));
            combined.truncate(15);

            Ok(combined)
        }
        Err(e) => {
            println!(
                "[AUTOCOMPLETE] Konachan fetch failed: {}, using cache only",
                e
            );
            Ok(cached_results)
        }
    }
}

#[tauri::command]
pub async fn get_cached_tag_count() -> Result<usize, String> {
    let cache_manager = TagCacheManager::new("tags.json")?;
    cache_manager.get_tag_count()
}
