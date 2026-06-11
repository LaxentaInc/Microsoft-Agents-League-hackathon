use crate::data::models::WallpaperItem;
use regex::Regex;
use scraper::{Html, Selector};

// moewalls main scraper
pub async fn scrape_moewalls(
    query: Option<&str>,
    limit: usize,
    include_videos: bool,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:MOEWALLS] Starting scrape - query: {:?}, page: {}, limit: {}",
        query, page, limit
    );
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    // meowwalls uses /page/2/ for pagination
    let url = if let Some(q) = query {
        if page > 1 {
            format!(
                "https://moewalls.com/page/{}/?s={}",
                page,
                urlencoding::encode(q)
            )
        } else {
            format!("https://moewalls.com/?s={}", urlencoding::encode(q))
        }
    } else if page > 1 {
        format!("https://moewalls.com/page/{}/", page)
    } else {
        "https://moewalls.com/".to_string()
    };

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let item_selector = Selector::parse("#primary ul li").unwrap();
    let anchor_selector = Selector::parse("a").unwrap();
    let img_selector = Selector::parse("img").unwrap();

    let mut items = Vec::new();
    let video_regex = Regex::new(r"/(\d{4})/\d{2}/([a-z0-9-]+)-thumb").unwrap();

    for element in document.select(&item_selector).take(limit) {
        if let Some(anchor) = element.select(&anchor_selector).next() {
            let title = anchor
                .value()
                .attr("title")
                .unwrap_or("Moewalls Live2D")
                .to_string();

            if let Some(img) = element.select(&img_selector).next() {
                if let Some(thumbnail) = img.value().attr("src") {
                    let thumbnail_owned = thumbnail.to_string();

                    let video_url = video_regex.captures(&thumbnail_owned).map(|caps| format!(
                            "https://static.moewalls.com/videos/preview/{}/{}-preview.mp4",
                            &caps[1], &caps[2]
                        ));

                    let high_res_image =
                        thumbnail_owned.replace("-thumb", "").replace("-poster", "");

                    let (media_type, image_url) = if include_videos && video_url.is_some() {
                        ("video", video_url.clone().unwrap())
                    } else {
                        ("image", high_res_image.clone())
                    };

                    let title_slug = title.replace(" ", "-").to_lowercase();
                    let id_slug = video_url
                        .as_ref()
                        .and_then(|v| v.split('/').next_back())
                        .and_then(|s| s.strip_suffix("-preview.mp4"))
                        .unwrap_or(&title_slug);

                    items.push(WallpaperItem {
                        id: format!("moewalls-{}", id_slug),
                        source: "moewalls".to_string(),
                        title: Some(title),
                        image_url,
                        thumbnail_url: Some(thumbnail_owned),
                        media_type: Some(media_type.to_string()),
                        width: None,
                        height: None,
                        tags: None,
                        detail_url: None,
                        original: None,
                    });
                }
            }
        }
    }

    if items.is_empty() {
        println!("[SCRAPER:MOEWALLS] No items found");
        return Err("moewalls returned no results".to_string());
    }

    println!("[SCRAPER:MOEWALLS] Found {} items", items.len());
    Ok(items)
}
