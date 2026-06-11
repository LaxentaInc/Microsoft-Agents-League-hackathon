use super::utils::{chrome_145_user_agent, parse_resolution};
use crate::data::models::WallpaperItem;
use scraper::{Html, Selector};

// wallhaven main scraper
pub async fn scrape_wallhaven(
    query: &str,
    page: u32,
    ai_art: bool,
    purity: &str,
    limit: usize,
) -> Result<Vec<WallpaperItem>, String> {
    println!("[SCRAPER:WALLHAVEN] Starting scrape - query: '{}', page: {}, limit: {}, purity: {}, ai_art: {}", query, page, limit, purity, ai_art);
    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let ai_filter = if ai_art { "0" } else { "1" };
    let url = format!(
        "https://wallhaven.cc/search?q={}&page={}&purity={}&ai_art_filter={}",
        urlencoding::encode(query),
        page,
        purity,
        ai_filter
    );

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let thumb_selector = Selector::parse(".thumb-listing-page ul li .thumb").unwrap();
    let preview_selector = Selector::parse(".preview").unwrap();
    let thumb_info_selector = Selector::parse(".thumb-info .png span").unwrap();
    let wall_res_selector = Selector::parse(".wall-res").unwrap();
    let img_selector = Selector::parse("img").unwrap();

    let mut items = Vec::new();

    for element in document.select(&thumb_selector).take(limit) {
        if let Some(preview) = element.select(&preview_selector).next() {
            if let Some(preview_url) = preview.value().attr("href") {
                if let Some(id) = preview_url.split('/').next_back() {
                    let is_png = element.select(&thumb_info_selector).next().is_some();
                    let ext = if is_png { ".png" } else { ".jpg" };
                    let short = &id[..2.min(id.len())];
                    let image_url = format!(
                        "https://w.wallhaven.cc/full/{}/wallhaven-{}{}",
                        short, id, ext
                    );

                    let thumbnail_url = element
                        .select(&img_selector)
                        .next()
                        .and_then(|img| {
                            img.value()
                                .attr("data-src")
                                .or_else(|| img.value().attr("src"))
                        })
                        .map(String::from);

                    let resolution_text = element
                        .select(&wall_res_selector)
                        .next()
                        .map(|el| el.text().collect::<String>())
                        .unwrap_or_default();

                    let (width, height) = parse_resolution(&resolution_text);

                    items.push(WallpaperItem {
                        id: format!("wallhaven-{}", id),
                        source: "wallhaven".to_string(),
                        title: Some(id.to_string()),
                        image_url,
                        thumbnail_url,
                        media_type: Some("image".to_string()),
                        width,
                        height,
                        tags: None,
                        detail_url: None,
                        original: None,
                    });
                }
            }
        }
    }

    if items.is_empty() {
        println!("[SCRAPER:WALLHAVEN] No items found");
        return Err("wallhaven returned no results".to_string());
    }

    println!("[SCRAPER:WALLHAVEN] Found {} items", items.len());
    Ok(items)
}
