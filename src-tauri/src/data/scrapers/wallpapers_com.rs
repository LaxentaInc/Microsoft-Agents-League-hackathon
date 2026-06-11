// DEPRECATED
use super::utils::absolute_url;
use super::utils::build_chrome_client;
use crate::data::models::WallpaperItem;
use scraper::{Html, Selector};
// wallpapers.com main scraper
pub async fn scrape_wallpapers_com(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:WALLPAPERS] Starting scrape - query: '{}', page: {}, limit: {}",
        query, page, limit
    );
    let client = build_chrome_client()?;
    // again doesnt rlly matter x64 or x84 lol [i wrote this ages ago, x84 doesnt exist dumfuck]
    // .user_agent(chrome_145_user_agent())
    // .build()
    // .map_err(|e| e.to_string())?;

    // wallpapers.com uses ?p=2 ooops
    let url = if page > 1 {
        format!(
            "https://wallpapers.com/search/{}?p={}",
            urlencoding::encode(query),
            page
        )
    } else {
        format!(
            "https://wallpapers.com/search/{}",
            urlencoding::encode(query)
        )
    };

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let html = response.text().await.map_err(|e| e.to_string())?;

    let document = Html::parse_document(&html);
    let item_selector = Selector::parse(".tab-content ul.kw-contents li").unwrap();
    let figure_selector = Selector::parse("figure").unwrap();
    let img_selector = Selector::parse("img").unwrap();

    let mut items = Vec::new();

    for element in document.select(&item_selector).take(limit) {
        if let Some(figure) = element.select(&figure_selector).next() {
            let title = figure
                .value()
                .attr("data-title")
                .unwrap_or("Wallpapers.com");
            let key = figure.value().attr("data-key").unwrap_or("");

            if key.is_empty() {
                continue;
            }

            let thumb_src = element
                .select(&img_selector)
                .next()
                .and_then(|img| {
                    img.value()
                        .attr("data-src")
                        .or_else(|| img.value().attr("src"))
                })
                .unwrap_or("");

            let thumbnail_url = if !thumb_src.is_empty() {
                absolute_url(thumb_src, "https://wallpapers.com")
            } else {
                String::new()
            };

            items.push(WallpaperItem {
                id: format!("wallpapers-{}", key),
                source: "wallpapers".to_string(),
                title: Some(title.to_string()),
                image_url: thumbnail_url.clone(),
                thumbnail_url: Some(thumbnail_url),
                media_type: Some("image".to_string()),
                width: None,
                height: None,
                tags: None,
                detail_url: None,
                original: None,
            });
        }
    }

    if items.is_empty() {
        println!("[SCRAPER:WALLPAPERS] No items found");
        return Err("wallpapers.com returned no results".to_string());
    }

    println!("[SCRAPER:WALLPAPERS] Found {} items", items.len());
    Ok(items)
}
