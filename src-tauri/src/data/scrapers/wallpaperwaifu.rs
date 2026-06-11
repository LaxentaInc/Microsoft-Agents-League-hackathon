use super::utils::{absolute_url, chrome_145_user_agent, parse_resolution};
use crate::data::models::WallpaperItem;
use rand::Rng;
use regex::Regex;
use scraper::{Html, Selector};

// wallpaperwaifu main scraper
// def by homepage now
pub async fn scrape_wallpaperwaifu(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    // For auto/base searches (empty query), we randomize the page to explore more content
    let (target_query, target_page) = if query.is_empty() {
        let mut rng = rand::thread_rng();
        let random_page = rng.gen_range(1..=100);
        println!(
            "[SCRAPER:WALLPAPERWAIFU] Empty query - randomizing page to: {}",
            random_page
        );
        (query, random_page)
    } else {
        (query, page)
    };

    println!(
        "[SCRAPER:WALLPAPERWAIFU] Starting scrape - query: '{}', page: {}, limit: {}",
        target_query, target_page, limit
    );
    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let url = if target_page > 1 {
        format!(
            "https://wallpaperwaifu.com/page/{}/?s={}",
            target_page,
            urlencoding::encode(target_query)
        )
    } else {
        format!(
            "https://wallpaperwaifu.com/?s={}",
            urlencoding::encode(target_query)
        )
    };

    println!("[SCRAPER:WALLPAPERWAIFU] Fetching: {}", url);

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let item_selector = Selector::parse("div.wall-grid article.wall-grid-item").unwrap();
    let anchor_selector = Selector::parse("a[href]").unwrap();
    let img_selector = Selector::parse("img").unwrap();
    let res_selector = Selector::parse("div.wall-res a").unwrap();
    let caption_selector = Selector::parse("div.wall-caption").unwrap();

    let mut items = Vec::new();

    for element in document.select(&item_selector) {
        if items.len() >= limit {
            break;
        }

        let detail_url = element
            .select(&anchor_selector)
            .next()
            .and_then(|a| a.value().attr("href"))
            .map(|href| absolute_url(href, "https://wallpaperwaifu.com"));

        let detail_url = match detail_url {
            Some(url) => url,
            None => continue,
        };

        let thumbnail = element
            .select(&img_selector)
            .next()
            .and_then(|img| {
                img.value()
                    .attr("data-src")
                    .or_else(|| img.value().attr("src"))
            })
            .map(|src| absolute_url(src, "https://wallpaperwaifu.com"));

        let thumbnail_url = match thumbnail {
            Some(url) => url,
            None => continue,
        };

        let resolution_text = element
            .select(&res_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let (width, height) = parse_resolution(&resolution_text);

        let title = element
            .select(&caption_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| "WallpaperWaifu Wallpaper".to_string());

        let id_slug = detail_url
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("")
            .to_string();

        if id_slug.is_empty() {
            continue;
        }

        items.push(WallpaperItem {
            id: format!("wallpaperwaifu-{}", id_slug),
            source: "wallpaperwaifu".to_string(),
            title: Some(title),
            image_url: thumbnail_url.clone(),
            thumbnail_url: Some(thumbnail_url),
            media_type: Some("video".to_string()),
            width,
            height,
            tags: None,
            detail_url: Some(detail_url),
            original: None,
        });
    }

    if items.is_empty() {
        println!("[SCRAPER:WALLPAPERWAIFU] No items found");
        return Err("wallpaperwaifu returned no results".to_string());
    }

    println!("[SCRAPER:WALLPAPERWAIFU] Found {} items", items.len());
    Ok(items)
}

// wallpaperwaifu detail extractor - preview video
pub async fn scrape_wallpaperwaifu_detail(detail_url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    println!("[SCRAPER:WALLPAPERWAIFU] Fetching detail: {}", detail_url);

    let response = client
        .get(detail_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let preview_regex = Regex::new(r#""src":\s*"([^"]+preview\.(webm|mp4))""#).unwrap();

    if let Some(caps) = preview_regex.captures(&html) {
        if let Some(preview_url) = caps.get(1) {
            let url = preview_url.as_str().replace(r"\/", "/");
            println!("[SCRAPER:WALLPAPERWAIFU] Found preview video url: {}", url);
            return Ok(url);
        }
    }

    println!("[SCRAPER:WALLPAPERWAIFU] Preview video url not found");
    Err("preview video url not found".to_string())
}

// wallpaperwaifu download resolver - full quality
pub async fn scrape_wallpaperwaifu_download(detail_url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    println!(
        "[SCRAPER:WALLPAPERWAIFU] Fetching download URL: {}",
        detail_url
    );

    let response = client
        .get(detail_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let download_selector = Selector::parse("button#wf-download[data-url]").unwrap();

    let data_url = document
        .select(&download_selector)
        .next()
        .and_then(|button| button.value().attr("data-url"))
        .ok_or_else(|| "download button not found".to_string())?;

    let download_url = format!("https://wallpaperwaifu.com/download.php?video={}", data_url);
    println!(
        "[SCRAPER:WALLPAPERWAIFU] Constructed download URL: {}",
        download_url
    );

    // TODO: DONE aaaghhh:
    // .header("Referer", detail_url)
    // otherwise the server will redirect to homepage instead of returning the video file.
    // The download.php endpoint checks the Referer header and returns the actual MP4 file
    // when the Referer matches the detail page URL.

    Ok(download_url)
}
