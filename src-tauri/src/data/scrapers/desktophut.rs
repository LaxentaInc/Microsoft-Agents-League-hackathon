use super::utils::{absolute_url, chrome_145_user_agent, parse_resolution};
use crate::data::models::WallpaperItem;
use scraper::{Html, Selector};
use rand::seq::SliceRandom;

const BASE_URL: &str = "https://www.desktophut.com";

pub async fn scrape_desktophut(
    query: &str,
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:DESKTOPhut] Starting scrape - query: '{}', page: {}, limit: {}",
        query, page, limit
    );

    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    // randomize the page offset when page=1 to avoid always returning the same front-page content
    let page_idx = if page <= 1 {
        let rand_offset: u32 = rand::random::<u32>() % 8;
        // 60% chance to use a random page, 40% chance to use page 1
        if rand_offset > 3 { rand_offset } else { 1 }
    } else {
        page
    };

    // build the url - use ?s= for search queries, plain pagination otherwise
    let trimmed = query.trim();
    let url = if !trimmed.is_empty() {
        if page_idx > 1 {
            format!("{}/?s={}&page={}", BASE_URL, urlencoding::encode(trimmed), page_idx)
        } else {
            format!("{}/?s={}", BASE_URL, urlencoding::encode(trimmed))
        }
    } else if page_idx > 1 {
        format!("{}/?page={}", BASE_URL, page_idx)
    } else {
        BASE_URL.to_string()
    };

    println!("[SCRAPER:DESKTOPhut] Fetching URL: {}", url);

    let response = client.get(&url).send().await.map_err(|e| {
        println!("[SCRAPER:DESKTOPhut] Request error: {}", e);
        e.to_string()
    })?;
    println!(
        "[SCRAPER:DESKTOPhut] HTTP status from desktophut: {}",
        response.status()
    );
    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} from desktophut",
            response.status()
        ));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    let grid_selector = Selector::parse("article.wallpaper-card").unwrap();
    let link_selector = Selector::parse("a.wallpaper-card-link").unwrap();
    let img_selector = Selector::parse("div.wallpaper-thumb img").unwrap();
    let res_selector = Selector::parse("span.thumb-badge").unwrap();
    let title_selector = Selector::parse("h3.wallpaper-title").unwrap();

    let mut items = Vec::new();

    let cards: Vec<_> = document.select(&grid_selector).collect();
    println!(
        "[SCRAPER:DESKTOPhut] Found {} raw wallpaper-card articles",
        cards.len()
    );

    for card in cards.into_iter() {
        if items.len() >= limit {
            break;
        }

        let link = match card.select(&link_selector).next() {
            Some(a) => a,
            None => {
                println!("[SCRAPER:DESKTOPhut] Skipping card: no link");
                continue;
            }
        };

        let href = match link.value().attr("href") {
            Some(h) if !h.is_empty() => h,
            _ => {
                println!("[SCRAPER:DESKTOPhut] Skipping card: empty href");
                continue;
            }
        };

        let detail_url = absolute_url(href, BASE_URL);

        let img = match card.select(&img_selector).next() {
            Some(i) => i,
            None => {
                println!("[SCRAPER:DESKTOPhut] Skipping card: no img");
                continue;
            }
        };

        let thumb_src = match img.value().attr("src") {
            Some(s) if !s.is_empty() => s,
            _ => {
                println!("[SCRAPER:DESKTOPhut] Skipping card: empty img src");
                continue;
            }
        };

        let thumbnail_url = absolute_url(thumb_src, BASE_URL);

        let title = if let Some(t) = link.value().attr("title") {
            t.to_string()
        } else if let Some(h) = card.select(&title_selector).next() {
            h.text().collect::<String>().trim().to_string()
        } else {
            "DesktopHut Live Wallpaper".to_string()
        };

        let res_text = card
            .select(&res_selector)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let (width, height) = parse_resolution(&res_text);

        let slug = href
            .trim_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("unknown")
            .to_string();

        if slug.is_empty() {
            println!("[SCRAPER:DESKTOPhut] Skipping card: empty slug from href {}", href);
            continue;
        }

        items.push(WallpaperItem {
            id: format!("desktophut-{}", slug),
            source: "desktophut".to_string(),
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
        println!("[SCRAPER:DESKTOPhut] No items found");
        return Err("desktophut returned no results".to_string());
    }

    // shuffle the results so repeated loads feel fresh
    let mut rng = rand::thread_rng();
    items.shuffle(&mut rng);

    println!("[SCRAPER:DESKTOPhut] Found {} items (shuffled)", items.len());
    Ok(items)
}

pub async fn scrape_desktophut_detail(
    detail_url: &str,
) -> Result<(String, String, Option<u32>, Option<u32>), String> {
    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    println!("[SCRAPER:DESKTOPhut] Resolving detail: {}", detail_url);

    let response = client.get(detail_url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} from desktophut detail",
            response.status()
        ));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    let video_selector = Selector::parse("div.dh-player-wrap video source[src]").unwrap();
    let download_selector = Selector::parse("a.dh-primary-download[href]").unwrap();
    let badge_selector = Selector::parse("span.thumb-badge").unwrap();

    let preview_url = document
        .select(&video_selector)
        .next()
        .and_then(|s| s.value().attr("src"))
        .map(|s| absolute_url(s, BASE_URL))
        .ok_or_else(|| "preview video url not found".to_string())?;

    let download_url = document
        .select(&download_selector)
        .next()
        .and_then(|a| a.value().attr("href"))
        .map(|s| absolute_url(s, BASE_URL))
        .unwrap_or_else(|| preview_url.clone());

    let res_text = document
        .select(&badge_selector)
        .next()
        .map(|s| s.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let (width, height) = parse_resolution(&res_text);

    Ok((preview_url, download_url, width, height))
}

