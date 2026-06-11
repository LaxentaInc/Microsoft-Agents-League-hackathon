use crate::data::models::WallpaperItem;
use rand::Rng;
use regex::Regex;

// raw readme url for the wallpaper archive repo
const ARCHIVE_README_URL: &str =
    "https://raw.githubusercontent.com/LaxentaInc/Wallpaper-Archive/main/README.md";

// items per "page" when paginating the archive
const PAGE_SIZE: usize = 30;

// represents a single parsed entry from the readme table
#[derive(Debug, Clone)]
struct ArchiveEntry {
    title: String,
    image_url: String,
    tags: Vec<String>,
}

// parse the readme markdown table into archive entries
fn parse_readme_table(markdown: &str) -> Vec<ArchiveEntry> {
    // matches table rows like:
    // | <img src="URL" width="200"> | **Title**<br>[Download](DOWNLOAD_URL) | Tags |
    let row_regex = Regex::new(
        r#"(?m)^\|\s*<img\s+src="([^"]+)"[^>]*>\s*\|\s*\*\*([^*]+)\*\*(?:<br>)?\[Download\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|"#,
    )
    .unwrap();

    let mut entries = Vec::new();

    for caps in row_regex.captures_iter(markdown) {
        let thumbnail_url = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        let title = caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        let download_url = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
        let tags_raw = caps.get(4).map(|m| m.as_str().trim().to_string()).unwrap_or_default();

        // use the download url as the image url since it's the direct raw file link
        // fall back to thumbnail if download is empty
        let image_url = if !download_url.is_empty() {
            download_url
        } else {
            thumbnail_url
        };

        if image_url.is_empty() || title.is_empty() {
            continue;
        }

        let tags: Vec<String> = tags_raw
            .split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();

        entries.push(ArchiveEntry {
            title,
            image_url,
            tags,
        });
    }

    entries
}

// wallpaper archive scraper - fetches static wallpapers from the github readme
pub async fn scrape_wallpaper_archive(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    // for empty queries, randomize the page to explore more content
    let target_page = if query.is_empty() {
        let mut rng = rand::thread_rng();
        let random_page = rng.gen_range(1..=20);
        println!(
            "[SCRAPER:WALLPAPER_ARCHIVE] empty query - randomizing page to: {}",
            random_page
        );
        random_page
    } else {
        page
    };

    println!(
        "[SCRAPER:WALLPAPER_ARCHIVE] starting scrape - query: '{}', page: {}, limit: {}",
        query, target_page, limit
    );

    // fetch the raw readme from github
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(ARCHIVE_README_URL)
        .send()
        .await
        .map_err(|e| format!("failed to fetch wallpaper archive readme: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "wallpaper archive returned status: {}",
            response.status()
        ));
    }

    let markdown = response.text().await.map_err(|e| e.to_string())?;

    println!(
        "[SCRAPER:WALLPAPER_ARCHIVE] fetched readme ({} bytes)",
        markdown.len()
    );

    // parse all entries from the markdown table
    let all_entries = parse_readme_table(&markdown);

    println!(
        "[SCRAPER:WALLPAPER_ARCHIVE] parsed {} total entries from readme",
        all_entries.len()
    );

    // Extract and cache tags
    use std::collections::HashMap;
    use crate::data::models::tags::{Tag, TagType};
    use crate::data::storage::TagCacheManager;

    let mut tag_counts: HashMap<String, u32> = HashMap::new();
    for entry in &all_entries {
        for tag in &entry.tags {
            let tag_lower = tag.to_lowercase();
            *tag_counts.entry(tag_lower).or_insert(0) += 1;
        }
    }

    let api_tags: Vec<Tag> = tag_counts.into_iter().map(|(name, count)| {
        Tag {
            name,
            tag_type: TagType::General,
            count: Some(count),
        }
    }).collect();

    if !api_tags.is_empty() {
        match TagCacheManager::new("tags.json") {
            Ok(cache) => {
                if let Err(e) = cache.add_tags(api_tags) {
                    println!("[SCRAPER:WALLPAPER_ARCHIVE] Failed to cache tags: {}", e);
                }
            }
            Err(e) => println!("[SCRAPER:WALLPAPER_ARCHIVE] Failed to init tag cache: {}", e),
        }
    }


    // filter entries by query if provided
    let filtered: Vec<&ArchiveEntry> = if query.is_empty() {
        all_entries.iter().collect()
    } else {
        let query_lower = query.to_lowercase();
        let query_terms: Vec<&str> = query_lower.split_whitespace().collect();

        all_entries
            .iter()
            .filter(|entry| {
                let title_lower = entry.title.to_lowercase();
                let tags_lower: Vec<String> =
                    entry.tags.iter().map(|t| t.to_lowercase()).collect();
                let tags_joined = tags_lower.join(" ");

                // all query terms must match somewhere in title or tags
                query_terms.iter().all(|term| {
                    title_lower.contains(term) || tags_joined.contains(term)
                })
            })
            .collect()
    };

    println!(
        "[SCRAPER:WALLPAPER_ARCHIVE] {} entries match query '{}'",
        filtered.len(),
        query
    );

    // paginate: skip to the right page and take up to limit items
    let start_idx = ((target_page - 1) as usize) * PAGE_SIZE;
    let page_entries: Vec<&ArchiveEntry> = filtered
        .into_iter()
        .skip(start_idx)
        .take(limit)
        .collect();

    // convert to wallpaper items
    let items: Vec<WallpaperItem> = page_entries
        .iter()
        .enumerate()
        .map(|(i, entry)| {
            // generate a stable id from the image url slug
            let id_slug = entry
                .image_url
                .split('/')
                .next_back()
                .unwrap_or("")
                .trim_end_matches(".jpg")
                .trim_end_matches(".png")
                .trim_end_matches(".jpeg")
                .trim_end_matches(".webp")
                .to_string();

            let id = if id_slug.is_empty() {
                format!("archive-{}-{}", target_page, i)
            } else {
                format!("archive-{}", id_slug)
            };

            // use wsrv.nl image proxy to create a small webp thumbnail (~20-50kb)
            // instead of loading the full-res image (~2-5mb) in the grid
            let thumbnail = format!(
                "https://wsrv.nl/?url={}&w=400&h=300&fit=cover&output=webp&q=75",
                urlencoding::encode(&entry.image_url)
            );

            WallpaperItem {
                id,
                source: "wallpaper_archive".to_string(),
                title: Some(entry.title.clone()),
                image_url: entry.image_url.clone(),
                thumbnail_url: Some(thumbnail),
                media_type: Some("image".to_string()),
                width: None,
                height: None,
                tags: if entry.tags.is_empty() {
                    None
                } else {
                    Some(entry.tags.clone())
                },
                detail_url: None,
                original: None,
            }
        })
        .collect();


    if items.is_empty() {
        println!("[SCRAPER:WALLPAPER_ARCHIVE] no items found");
        return Err("wallpaper archive returned no results".to_string());
    }

    println!(
        "[SCRAPER:WALLPAPER_ARCHIVE] returning {} items",
        items.len()
    );
    Ok(items)
}
