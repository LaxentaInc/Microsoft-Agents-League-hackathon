use super::utils::{absolute_url, chrome_145_user_agent};
use crate::data::models::WallpaperItem;
use scraper::{Html, Selector};

// slugify for motionbgs
// def by homepage now too
fn motionbgs_tag_slug(query: &str) -> String {
    let sanitized = query
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>();

    sanitized
        .split_whitespace()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// motionbgs main scraper
pub async fn scrape_motionbgs(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:MOTIONBGS] Starting scrape - query: '{}', page: {}, limit: {}",
        query, page, limit
    );
    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let page_index = page.max(1);

    let url = if query.trim().is_empty() {
        if page_index <= 1 {
            "https://motionbgs.com/".to_string()
        } else {
            format!("https://motionbgs.com/{}/", page_index)
        }
    } else {
        let slug = {
            let slugged = motionbgs_tag_slug(query);
            if slugged.is_empty() {
                "featured".to_string()
            } else {
                slugged
            }
        };

        if page_index <= 1 {
            format!("https://motionbgs.com/tag:{}/", slug)
        } else {
            format!("https://motionbgs.com/tag:{}/{}/", slug, page_index)
        }
    };

    println!("info: fetching motionbgs: {}", url);

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let tmb_selector = Selector::parse("div.tmb a[href]").unwrap();
    let img_selector = Selector::parse("img").unwrap();
    let title_selector = Selector::parse("span.ttl").unwrap();
    let format_selector = Selector::parse("span.frm").unwrap();

    let mut items = Vec::new();

    for element in document.select(&tmb_selector) {
        let detail_url = element.value().attr("href").unwrap_or("");

        if detail_url.is_empty() || detail_url.starts_with("http") {
            continue;
        }

        let img = element.select(&img_selector).next();
        if img.is_none() {
            continue;
        }

        let img_elem = img.unwrap();
        let thumbnail = img_elem.value().attr("src").unwrap_or("");

        if thumbnail.is_empty() {
            continue;
        }

        let title = element
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| "MotionBGs Live Wallpaper".to_string());

        let format = element
            .select(&format_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| "".to_string());

        let id = detail_url
            .trim_start_matches('/')
            .trim_end_matches('/')
            .to_string();

        let thumbnail_url = absolute_url(thumbnail, "https://motionbgs.com");
        let full_detail_url = absolute_url(detail_url, "https://motionbgs.com");

        let (width, height) = if format.contains("4K") {
            (Some(3840), Some(2160))
        } else if format.contains("1080p") || format.contains("FHD") {
            (Some(1920), Some(1080))
        } else {
            (None, None)
        };

        items.push(WallpaperItem {
            id: format!("motionbgs-{}", id),
            source: "motionbgs".to_string(),
            title: Some(title),
            image_url: thumbnail_url.clone(),
            thumbnail_url: Some(thumbnail_url),
            media_type: Some("video".to_string()),
            width,
            height,
            tags: None,
            detail_url: Some(full_detail_url),
            original: None,
        });

        if items.len() >= limit {
            break;
        }
    }

    if items.is_empty() {
        println!("[SCRAPER:MOTIONBGS] No items found");
        return Err("motionbgs returned no results".to_string());
    }

    println!("[SCRAPER:MOTIONBGS] Found {} items", items.len());
    Ok(items)
}

// motionbgs detail extractor - fixed lol
pub async fn scrape_motionbgs_detail(detail_url: &str) -> Result<(String, Option<String>), String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    println!("info: fetching motionbgs detail: {}", detail_url);

    let response = client
        .get(detail_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);

    // Extract preview video from <video><source src="..."> tag
    let video_selector = Selector::parse("video source[src]").unwrap();
    let preview_url = document
        .select(&video_selector)
        .next()
        .and_then(|source| source.value().attr("src"))
        .map(|src| absolute_url(src, "https://motionbgs.com"))
        .ok_or_else(|| "preview video url not found in video tag".to_string())?;

    println!("[info] found preview video url: {}", preview_url);
    let download_selector = Selector::parse("div.download a[href*='/dl/4k/']").unwrap(); // done OK got the link
    let download_4k_url = document
        .select(&download_selector)
        .next()
        .and_then(|link| link.value().attr("href"))
        .map(|href| absolute_url(href, "https://motionbgs.com"));

    if let Some(ref url) = download_4k_url {
        println!("[success] found 4k download url: {}", url);
    } else {
        println!("[warn: Critical] Sadly 4k download link not found, using preview url");
    }

    Ok((preview_url, download_4k_url))
}
