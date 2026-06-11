use super::utils::{absolute_url, build_chrome_client, parse_resolution};
use crate::data::models::tags::{Tag, TagType};
use crate::data::models::WallpaperItem;
use crate::data::storage::TagCacheManager;
use rand::Rng;
use regex::Regex;
use scraper::{Html, Selector};

/// Scrape wallpapers from Konachan by parsing HTML directly
pub async fn scrape_konachan(
    query: Option<&str>,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:KONACHAN] Starting scrape - query: {:?}, page: {}, limit: {}",
        query, page, limit
    );

    let client = build_chrome_client()?;

    // Build search URL - use konachan.net (SFW) by default
    let base_url = "https://konachan.net";

    let mut all_items = Vec::new();
    let mut current_page = page;
    let max_pages_to_fetch = 5; // Safety limit
    let mut fetched_pages_count = 0;

    // Regex and selectors (compile once)
    let post_id_re = Regex::new(r"^p(\d+)$").map_err(|e| e.to_string())?;
    let preview_selector = Selector::parse("img.preview").map_err(|e| e.to_string())?;
    let directlink_selector = Selector::parse("a.directlink").map_err(|e| e.to_string())?;
    let resolution_selector = Selector::parse("span.directlink-res").map_err(|e| e.to_string())?;
    let thumb_selector = Selector::parse("a.thumb").map_err(|e| e.to_string())?;
    let post_item_selector = Selector::parse("li[id^='p']")
        .map_err(|e| format!("Failed to parse post item selector: {}", e))?;
    let post_list_selector = Selector::parse("#post-list-posts")
        .map_err(|e| format!("Failed to parse post-list selector: {}", e))?;
    let alt_selector = Selector::parse("ul#post-list-posts, ul.post-list, #post-list").ok();

    while all_items.len() < limit && fetched_pages_count < max_pages_to_fetch {
        let url = if let Some(q) = query {
            if !q.is_empty() {
                // Search with specific tags
                format!(
                    "{}/post?page={}&tags={}",
                    base_url,
                    current_page,
                    urlencoding::encode(q)
                )
            } else {
                // Empty query = random
                format!(
                    "{}/post?page={}&tags=order%3Arandom",
                    base_url, current_page
                )
            }
        } else {
            // No query = random
            format!(
                "{}/post?page={}&tags=order%3Arandom",
                base_url, current_page
            )
        };

        println!("[SCRAPER:KONACHAN] Fetching URL: {}", url);

        let response = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                println!(
                    "[SCRAPER:KONACHAN] Error fetching page {}: {}",
                    current_page, e
                );
                if !all_items.is_empty() {
                    break;
                }
                return Err(e.to_string());
            }
        };

        if !response.status().is_success() {
            println!(
                "[SCRAPER:KONACHAN] Page {} returned status: {}",
                current_page,
                response.status()
            );
            if all_items.is_empty() {
                return Err(format!("Konachan returned status: {}", response.status()));
            }
            break; // Stop fetching if we encounter an error but have some items
        }

        let html = response.text().await.map_err(|e| e.to_string())?;

        // Debug: Log HTML length
        if html.len() < 1000 {
            println!(
                "[SCRAPER:KONACHAN] HTML preview (Page {}): {}",
                current_page,
                &html[..html.len().min(500)]
            );
        }

        let document = Html::parse_document(&html);

        // Find the post list container
        let post_list = document.select(&post_list_selector).next().or_else(|| {
            alt_selector
                .as_ref()
                .and_then(|sel| document.select(sel).next())
        });

        if let Some(post_list_node) = post_list {
            let mut page_items_count = 0;

            for post_element in post_list_node.select(&post_item_selector) {
                if all_items.len() >= limit {
                    break;
                }

                // Extract post ID
                let post_id = match post_element.value().attr("id").and_then(|id| {
                    post_id_re
                        .captures(id)
                        .and_then(|caps| caps.get(1))
                        .map(|m| m.as_str().to_string())
                }) {
                    Some(id) => id,
                    None => continue,
                };

                // Extract preview/thumbnail image URL
                let thumbnail_url = post_element
                    .select(&preview_selector)
                    .next()
                    .and_then(|img| img.value().attr("src"))
                    .map(|src| absolute_url(src, base_url));

                // Extract full resolution image URL
                let image_url = match post_element
                    .select(&directlink_selector)
                    .next()
                    .and_then(|a| a.value().attr("href"))
                    .map(|href| absolute_url(href, base_url))
                {
                    Some(url) => url,
                    None => continue,
                };

                // Extract resolution
                let (width, height) = post_element
                    .select(&resolution_selector)
                    .next()
                    .and_then(|span| span.text().next())
                    .map(parse_resolution)
                    .unwrap_or((None, None));

                // Extract tags
                let tags_str = post_element
                    .select(&preview_selector)
                    .next()
                    .and_then(|img| {
                        img.value()
                            .attr("title")
                            .or_else(|| img.value().attr("alt"))
                    })
                    .unwrap_or("");

                let tags = if tags_str.contains("Tags:") {
                    tags_str
                        .split("Tags:")
                        .nth(1)
                        .and_then(|s| s.split("User:").next())
                        .map(|s| {
                            s.split_whitespace()
                                .map(|t| t.to_string())
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };

                // Detail URL
                let detail_url = post_element
                    .select(&thumb_selector)
                    .next()
                    .and_then(|a| a.value().attr("href"))
                    .map(|href| absolute_url(href, base_url));

                let title = if !tags.is_empty() {
                    Some(tags.join(" "))
                } else {
                    Some(format!("Post {}", post_id))
                };

                all_items.push(WallpaperItem {
                    id: format!("konachan-{}", post_id),
                    source: "konachan".to_string(),
                    title,
                    image_url,
                    thumbnail_url,
                    media_type: Some("image".to_string()),
                    width,
                    height,
                    tags: if tags.is_empty() { None } else { Some(tags) },
                    detail_url,
                    original: None,
                });
                page_items_count += 1;
            }

            println!(
                "[SCRAPER:KONACHAN] Found {} items on page {}",
                page_items_count, current_page
            );

            // If we found no items on this page, likely end of results
            if page_items_count == 0 {
                // Double check if HTML is suspicious
                if !html.contains("post-list-posts") && !html.contains("Post.register_tags") {
                    println!("[SCRAPER:KONACHAN] Warning: Page {} HTML doesn't contain expected patterns", current_page);
                }
                break;
            }
        } else {
            if html.contains("Nobody here but us chickens!") {
                println!("[SCRAPER:KONACHAN] No results found on page {} (Nobody here but us chickens!)", current_page);
                break;
            }

            let preview: String = html.chars().take(500).collect();
            println!(
                "[SCRAPER:KONACHAN] Could not find post list container on page {}\nHTML Preview: {}",
                current_page,
                preview
            );
            // If it's the first page, we should probably error out, otherwise just stop
            if all_items.is_empty() {
                return Err("Could not find #post-list-posts container".to_string());
            }
            break;
        }

        // Extract and cache tags (Original logic preserved)
        let extracted_tags = extract_tags_from_html(&html);
        if !extracted_tags.is_empty() {
            // Cache tags persistently
            match TagCacheManager::new("konachan_tags.json") {
                Ok(cache_manager) => {
                    let _ = cache_manager.add_tags(extracted_tags);
                }
                Err(e) => println!(
                    "[SCRAPER:KONACHAN] Warning: failed to initialize tag cache: {}",
                    e
                ),
            }
        }

        // Randomly skip pages to ensure variety as requested
        let skip = rand::thread_rng().gen_range(1..=3);
        current_page += skip;
        fetched_pages_count += 1;
    }

    if all_items.is_empty() {
        println!("[SCRAPER:KONACHAN] No items found in HTML");
        return Err("Konachan returned no results".to_string());
    }

    println!("[SCRAPER:KONACHAN] Total items found: {}", all_items.len());
    Ok(all_items)
}

/// Extract tags from the Post.register_tags() JavaScript block in Konachan HTML
/// Format: Post.register_tags({"tag_name": "type", ...});
/// Example: Post.register_tags({"loli": "general", "petenshi_(dr._vermilion)": "artist", ...});
pub fn extract_tags_from_html(html: &str) -> Vec<Tag> {
    let mut tags = Vec::new();

    // Find Post.register_tags({...}) block
    // First, find the start position
    if let Some(start_pos) = html.find("Post.register_tags(") {
        // Find the opening brace after the function name
        if let Some(open_brace_pos) = html[start_pos..].find('{') {
            let content_start = start_pos + open_brace_pos + 1;

            // Find matching closing brace (handle nested structures)
            let mut brace_count = 1;
            let mut content_end = content_start;
            for (idx, ch) in html[content_start..].char_indices() {
                match ch {
                    '{' => brace_count += 1,
                    '}' => {
                        brace_count -= 1;
                        if brace_count == 0 {
                            content_end = content_start + idx;
                            break;
                        }
                    }
                    _ => {}
                }
            }

            if brace_count == 0 {
                let tag_content = &html[content_start..content_end];

                // Parse "tag_name": "type" pairs (type is a string)
                // Handle multiline content with (?s) flag
                let tag_re = Regex::new(r#"(?s)"([^"]+)":\s*"([^"]+)""#).ok();
                if let Some(tag_regex) = tag_re {
                    for cap in tag_regex.captures_iter(tag_content) {
                        if let (Some(name), Some(type_str)) = (cap.get(1), cap.get(2)) {
                            let tag_type = TagType::from_konachan_type(type_str.as_str());
                            tags.push(Tag {
                                name: name.as_str().to_string(),
                                tag_type,
                                count: None,
                            });
                        }
                    }
                }
            }
        }
    }

    tags
}

/// Fetch tag suggestions from Konachan's tag.json API
/// is_nsfw: true = konachan.com, false = konachan.net
pub async fn fetch_konachan_tags(query: &str, limit: usize) -> Result<Vec<Tag>, String> {
    let base_url = "https://konachan.net";

    // Konachan tag API endpoint
    let url = format!(
        "{}/tag.json?name={}*&order=count&limit={}",
        base_url,
        urlencoding::encode(query),
        limit
    );

    println!("[SCRAPER:KONACHAN] Fetching tags from: {}", url);

    let client = build_chrome_client()?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Konachan tag API returned status: {}",
            response.status()
        ));
    }

    let body = response.text().await.map_err(|e| e.to_string())?;

    // Parse JSON array of tag objects
    // Format: [{"id":123,"name":"tag_name","type":0,"count":1234}, ...]
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    let mut tags = Vec::new();

    if let Some(arr) = json.as_array() {
        for item in arr {
            if let (Some(name), Some(tag_type), count) = (
                item.get("name").and_then(|v| v.as_str()),
                item.get("type").and_then(|v| v.as_u64()),
                item.get("count").and_then(|v| v.as_u64()),
            ) {
                let tag_type = match tag_type {
                    0 => TagType::General,
                    1 => TagType::Artist,
                    3 => TagType::Copyright,
                    4 => TagType::Character,
                    2 => TagType::Circle,
                    5 => TagType::Style,
                    _ => TagType::General,
                };
                tags.push(Tag {
                    name: name.to_string(),
                    tag_type,
                    count: count.map(|c| c as u32),
                });
            }
        }
    }

    println!("[SCRAPER:KONACHAN] Fetched {} tags from API", tags.len());
    Ok(tags)
}

/// Expand generic search terms using cached tags with fuzzy matching
/// Returns up to 3 best matching tag names if found, otherwise returns original query
pub fn expand_search_terms_with_cache(query: &str) -> Result<Vec<String>, String> {
    let cache_manager = TagCacheManager::new("konachan_tags.json")?;
    let query_lower = query.trim().to_lowercase();

    if query_lower.is_empty() {
        return Ok(vec![query.to_string()]);
    }

    println!("[TAG_MATCH] Expanding query '{}' using cached tags", query);

    // Load all cached tags for fuzzy matching
    let cache = cache_manager.load()?;
    let cache_size = cache.tags.len();
    println!(
        "[TAG_MATCH] Loaded {} cached tags from persistent storage",
        cache_size
    );

    if cache_size == 0 {
        println!("[TAG_MATCH] No cached tags available, returning original query");
        return Ok(vec![query.to_string()]);
    }

    // Calculate similarity scores for all tags
    let mut scored_tags: Vec<(f32, &Tag)> = cache
        .tags
        .values()
        .map(|tag| {
            let tag_lower = tag.name.to_lowercase();

            // Calculate similarity score
            let score = if tag_lower == query_lower {
                200.0 // Exact match gets supreme score
            } else if tag_lower.starts_with(&query_lower) {
                // Exact prefix match gets highest score
                100.0 + (tag_lower.len() as f32 * 0.1)
            } else if tag_lower.contains(&query_lower) {
                // Contains match gets medium score
                50.0 + (tag_lower.len() as f32 * 0.05)
            } else {
                // Fuzzy match: count common characters
                let common_chars = query_lower
                    .chars()
                    .filter(|c| tag_lower.contains(*c))
                    .count();
                
                (common_chars as f32 / query_lower.len().max(1) as f32) * 30.0
            };

            // Boost score for copyright/character tags
            let type_boost = match tag.tag_type {
                TagType::Copyright | TagType::Character => 10.0,
                TagType::Artist => 5.0,
                _ => 0.0,
            };

            // Boost score for tags with higher counts
            let count_boost = (tag.count.unwrap_or(0) as f32).min(1000.0) / 100.0;

            (score + type_boost + count_boost, tag)
        })
        .collect();

    // Sort by score (highest first)
    scored_tags.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut best_matches = Vec::new();

    // Take top matches above threshold
    for (score, tag) in scored_tags.iter() {
        if *score > 30.0 {
            best_matches.push(tag.name.clone());
            if best_matches.len() >= 3 {
                break;
            }
        }
    }

    if !best_matches.is_empty() {
        println!(
            "[TAG_MATCH] Best matches for '{}' -> {:?}",
            query, best_matches
        );
        return Ok(best_matches);
    }

    // Fallback: try prefix search
    let prefix_matches = cache_manager.search(&query_lower, 10)?;
    if !prefix_matches.is_empty() {
        // Prefer copyright/character tags over general tags
        let mut sorted = prefix_matches;
        sorted.sort_by(|a, b| {
            let a_priority = match a.tag_type {
                TagType::Copyright | TagType::Character => 0,
                TagType::Artist => 1,
                _ => 2,
            };
            let b_priority = match b.tag_type {
                TagType::Copyright | TagType::Character => 0,
                TagType::Artist => 1,
                _ => 2,
            };

            match a_priority.cmp(&b_priority) {
                std::cmp::Ordering::Equal => b.count.unwrap_or(0).cmp(&a.count.unwrap_or(0)),
                other => other,
            }
        });
        
        for tag in sorted.iter().take(3) {
            best_matches.push(tag.name.clone());
        }
        
        println!(
            "[TAG_MATCH] Prefix matches found: '{}' -> {:?}",
            query, best_matches
        );
        return Ok(best_matches);
    }

    // No good match found, return original
    println!(
        "[TAG_MATCH] No good match found for '{}', returning original query",
        query
    );
    Ok(vec![query.to_string()])
}

/// Resolve high-resolution image URL from Konachan detail page
/// Fetches the detail page and extracts the high-res URL from the "View larger version" link
pub async fn resolve_konachan_highres_url(detail_url: &str) -> Result<String, String> {
    println!("[RESOLVE:KONACHAN] Fetching detail page: {}", detail_url);

    let client = build_chrome_client()?;

    // Ensure URL is absolute
    let url = if detail_url.starts_with("http://") || detail_url.starts_with("https://") {
        detail_url.to_string()
    } else {
        format!("https://konachan.net{}", detail_url)
    };

    println!("[RESOLVE:KONACHAN] Requesting URL: {}", url);

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Konachan detail page returned status: {}",
            response.status()
        ));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    // Try to find the high-res link - multiple selectors
    // Prefer JPEG links over image/PNG links
    // 1. Link with id="highres-show" (View larger version) - usually JPEG
    // 2. Link with id="highres" (Download larger version) - usually JPEG
    // 3. Link with class="highres-show"
    // 4. Link with class="original-file-changed"
    let highres_selectors = vec![
        Selector::parse("#highres-show").ok(),
        Selector::parse("#highres").ok(),
        Selector::parse("a.highres-show").ok(),
        Selector::parse("a.original-file-changed").ok(),
    ];

    let mut found_urls = Vec::new();

    for selector in highres_selectors.into_iter().flatten() {
        for link in document.select(&selector) {
            if let Some(href) = link.value().attr("href") {
                let high_res_url = absolute_url(href, "https://konachan.net");
                found_urls.push(high_res_url);
            }
        }
    }

    // Prefer JPEG URLs over image/PNG URLs
    if let Some(jpeg_url) = found_urls.iter().find(|url| url.contains("/jpeg/")) {
        println!("[RESOLVE:KONACHAN] Found JPEG high-res URL: {}", jpeg_url);
        return Ok(jpeg_url.clone());
    }

    // If no JPEG found, try to convert image/ URL to jpeg/
    if let Some(image_url) = found_urls.first() {
        if image_url.contains("/image/") {
            // Convert /image/ to /jpeg/ and .png to .jpg if needed
            let jpeg_url = image_url
                .replace("/image/", "/jpeg/")
                .replace(".png", ".jpg");
            println!(
                "[RESOLVE:KONACHAN] Converted image URL to JPEG: {}",
                jpeg_url
            );
            return Ok(jpeg_url);
        }
        println!(
            "[RESOLVE:KONACHAN] Using found URL (not JPEG): {}",
            image_url
        );
        return Ok(image_url.clone());
    }

    // Fallback: try to extract from og:image meta tag (but this is usually sample, not full res)
    let og_image_selector = Selector::parse(r#"meta[property="og:image"]"#).ok();
    if let Some(selector) = og_image_selector {
        if let Some(meta) = document.select(&selector).next() {
            if let Some(content) = meta.value().attr("content") {
                // Return the sample URL directly without conversion
                // This ensures we have a valid image URL even if the full high-res is tricky to predict
                let high_res_url = content.to_string();
                println!(
                    "[RESOLVE:KONACHAN] Extracted from og:image (using sample): {}",
                    high_res_url
                );
                return Ok(high_res_url);
            }
        }
    }

    Err("Could not find high-resolution image URL on detail page".to_string())
}

/// Scrape tags from a Konachan search results page (extracts from HTML)
#[allow(dead_code)]
pub async fn scrape_konachan_page_tags(query: &str, is_nsfw: bool) -> Result<Vec<Tag>, String> {
    let base_url = if is_nsfw {
        "https://konachan.com"
    } else {
        "https://konachan.net"
    };

    let url = format!("{}/post?tags={}", base_url, urlencoding::encode(query));

    println!("[SCRAPER:KONACHAN] Scraping tags from page: {}", url);

    let client = build_chrome_client()?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let tags = extract_tags_from_html(&html);
    println!("[SCRAPER:KONACHAN] Extracted {} tags from page", tags.len());

    Ok(tags)
}
