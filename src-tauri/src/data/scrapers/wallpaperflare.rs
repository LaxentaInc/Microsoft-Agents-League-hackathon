// DEPRECATED - we have our own wallpaper archive
use crate::data::models::WallpaperItem;
use scraper::{Html, Selector};
use std::collections::HashSet;
use super::utils::{absolute_url, pick_image_source, parse_resolution, build_chrome_client};

// wallpaperflare download resolver
pub async fn resolve_wallpaperflare_download(
    detail_url: &str,
) -> Result<(String, Option<u32>, Option<u32>), String> {

    // Full Chrome Windows user agent for downloading
    // let client = reqwest::Client::builder()
    //     .user_agent(chrome_145_user_agent())
    //     .timeout(std::time::Duration::from_secs(15))
    //     .build()
    //     .map_err(|e| e.to_string())?;
    let client = build_chrome_client()?;


    let absolute = absolute_url(detail_url, "https://www.wallpaperflare.com");
    let download_page_url = format!("{}/download", absolute.trim_end_matches('/'));

    println!("debug: resolving high-res from: {}", download_page_url);

    if let Ok(response) = client
        .get(&download_page_url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header("Referer", &absolute)
        .header("Upgrade-Insecure-Requests", "1")
        .send()
        .await
    {
        if let Ok(html) = response.text().await {
            let document = Html::parse_document(&html);
            
            let show_img_selector = Selector::parse("#show_img").unwrap();
            let content_url_selector = Selector::parse("img[itemprop=\"contentUrl\"]").unwrap();
            
            let high_res_image = document
                .select(&show_img_selector)
                .next()
                .and_then(|el| el.value().attr("src"))
                .or_else(|| {
                    document
                        .select(&content_url_selector)
                        .next()
                        .and_then(|el| el.value().attr("src"))
                });
            
            if let Some(img_url) = high_res_image {
                let width_selector = Selector::parse("span[itemprop=\"width\"] span[itemprop=\"value\"]").unwrap();
                let height_selector = Selector::parse("span[itemprop=\"height\"] span[itemprop=\"value\"]").unwrap();
                
                let width = document
                    .select(&width_selector)
                    .next()
                    .and_then(|el| el.text().collect::<String>().parse::<u32>().ok());
                
                let height = document
                    .select(&height_selector)
                    .next()
                    .and_then(|el| el.text().collect::<String>().parse::<u32>().ok());
                
                let final_url = absolute_url(img_url, "https://www.wallpaperflare.com");
                println!("ok: found high-res image: {}", final_url);
                return Ok((final_url, width, height));
            }
        }
    }

    println!(
        "debug: download page failed, trying detail page: {}",
        absolute
    );

    match client.get(&absolute)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header("Referer", "https://www.wallpaperflare.com/")
        .header("Upgrade-Insecure-Requests", "1")
        .send()
        .await
    {
        Ok(response) => {
            let html = response.text().await.map_err(|e| e.to_string())?;
            let document = Html::parse_document(&html);
            
            let content_url_selector = Selector::parse("img[itemprop=\"contentUrl\"]").unwrap();
            let vimg_selector = Selector::parse("#vimg").unwrap();
            let og_image_selector = Selector::parse("meta[property=\"og:image\"]").unwrap();
            
            let detail_image = document
                .select(&content_url_selector)
                .next()
                .and_then(|el| el.value().attr("src"))
                .map(pick_image_source)
                .or_else(|| {
                    document
                        .select(&vimg_selector)
                        .next()
                        .and_then(|el| el.value().attr("src"))
                        .map(pick_image_source)
                })
                .or_else(|| {
                    document
                        .select(&og_image_selector)
                        .next()
                        .and_then(|el| el.value().attr("content"))
                        .map(pick_image_source)
                });
            
            if let Some(img_url) = detail_image {
                let meta_desc_selector = Selector::parse("meta[itemprop=\"description\"]").unwrap();
                let meta_description = document
                    .select(&meta_desc_selector)
                    .next()
                    .and_then(|el| el.value().attr("content"))
                    .unwrap_or("");
                
                let (width, height) = parse_resolution(meta_description);
                
                let final_url = absolute_url(&img_url, "https://www.wallpaperflare.com");
                println!("ok: found image from detail page: {}", final_url);
                return Ok((final_url, width, height));
            }
            
            Err("no image found on detail page".to_string())
        }
        Err(e) => Err(format!("failed to fetch detail page: {}", e)),
    }
}

// wallpaperflare main scraper (best one i scraped yet ngl, got good wallpapers)
pub async fn scrape_wallpaperflare(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:WALLPAPERFLARE] Starting scrape - query: '{}', page: {}, limit: {}",
        query, page, limit
    );
    
    // Full Chrome Windows user agent with realistic headers for Cloudflare bypass
    // let client = reqwest::Client::builder()
    //     .user_agent(chrome_145_user_agent())
    //     .timeout(std::time::Duration::from_secs(15))
    //     .build()
    //     .map_err(|e| e.to_string())?;
    let client = build_chrome_client()?;

    // wf uh uses &page=2 for pagination
    let url = if page > 1 {
        format!(
            "https://www.wallpaperflare.com/search?wallpaper={}&page={}",
            urlencoding::encode(query),
            page
        )
    } else {
        format!(
            "https://www.wallpaperflare.com/search?wallpaper={}",
            urlencoding::encode(query)
        )
    };

    println!("[SCRAPER:WALLPAPERFLARE] Fetching: {}", url);

let response = client
    .get(&url)
    .header("Referer", "https://www.wallpaperflare.com/")
    .header("Sec-Fetch-Site", "same-origin")
    .send()
    .await
    .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        // Response might be binary/compressed, handle safely
        let body_bytes = response.bytes().await.unwrap_or_default();
        let body_str = String::from_utf8_lossy(&body_bytes);
        // Safely truncate at char boundary
        let preview: String = body_str.chars().take(200).collect();
        if !preview.is_empty() {
            println!("[SCRAPER:WALLPAPERFLARE] HTTP {} - Body preview: {}", status, preview);
        } else {
            println!("[SCRAPER:WALLPAPERFLARE] HTTP {} - Response was binary/empty", status);
        }
        return Err(format!("HTTP {} - possibly Cloudflare blocked", status));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    
    // Check for Cloudflare challenge page
    if html.contains("cf-browser-verification") || html.contains("Checking your browser") {
        println!("[SCRAPER:WALLPAPERFLARE] Cloudflare challenge detected!");
        return Err("Cloudflare challenge - browser verification required".to_string());
    }

    #[derive(Clone)]
    struct TempItem {
        id: String,
        title: String,
        thumbnail_url: String,
        detail_url: String,
    }

    let mut temp_items = Vec::new();
    let mut seen_ids = HashSet::new();

    {
        let document = Html::parse_document(&html);
        let link_selector = Selector::parse("a[href]").unwrap();
        let img_selector = Selector::parse("img").unwrap();

        for link_element in document.select(&link_selector) {
            if temp_items.len() >= limit {
                break;
            }

            let href = link_element.value().attr("href").unwrap_or("");
            if href.is_empty()
                || href.starts_with('#')
                || href.starts_with("/search")
                || href.starts_with("/tag")
                || href.starts_with("/page")
                || href == "/"
                || !href.contains("wallpaper")
            {
                continue;
            }

            let normalized_href = absolute_url(href, "https://www.wallpaperflare.com");
            if !normalized_href.to_lowercase().contains("wallpaper") {
                continue;
            }

            let media = link_element.select(&img_selector).next();
            if media.is_none() {
                continue;
            }

            let media_elem = media.unwrap();
            let thumb = media_elem
                .value()
                .attr("data-src")
                .or_else(|| media_elem.value().attr("data-original"))
                .or_else(|| media_elem.value().attr("data-srcset"))
                .or_else(|| media_elem.value().attr("srcset"))
                .or_else(|| media_elem.value().attr("src"))
                .map(pick_image_source)
                .unwrap_or_default();

            if thumb.is_empty() {
                continue;
            }

            let id = href
                .trim_start_matches('/')
                .split('-')
                .next_back()
                .unwrap_or("")
                .to_string();

            if id.is_empty() || id.len() < 3 || seen_ids.contains(&id) {
                continue;
            }
            seen_ids.insert(id.clone());

            let thumbnail_url = absolute_url(&thumb, "https://www.wallpaperflare.com");
            let title = media_elem
                .value()
                .attr("alt")
                .or_else(|| media_elem.value().attr("title"))
                .unwrap_or("WallpaperFlare Wallpaper")
                .to_string();

            temp_items.push(TempItem {
                id: id.clone(),
                title,
                thumbnail_url: thumbnail_url.clone(),
                detail_url: normalized_href,
            });
        }
    }

    if temp_items.is_empty() {
        println!("[SCRAPER:WALLPAPERFLARE] No items found");
        return Err("wallpaperflare returned no results".to_string());
    }

    println!(
        "[SCRAPER:WALLPAPERFLARE] Found {} temp items, converting...",
        temp_items.len()
    );
    let items: Vec<WallpaperItem> = temp_items
        .into_iter()
        .map(|temp_item| WallpaperItem {
            id: format!("wallpaperflare-{}", temp_item.id),
            source: "wallpaperflare".to_string(),
            title: Some(temp_item.title),
            image_url: temp_item.thumbnail_url.clone(),
            thumbnail_url: Some(temp_item.thumbnail_url),
            media_type: Some("image".to_string()),
            width: None,
            height: None,
            tags: None,
            detail_url: Some(temp_item.detail_url),
            original: None,
        })
        .collect();

    println!("[SCRAPER:WALLPAPERFLARE] Returning {} items", items.len());
    Ok(items)
}
