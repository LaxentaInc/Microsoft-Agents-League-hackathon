// DEPRECATED - we have our own wallpaper archive
use super::utils::build_chrome_client;
use crate::data::models::WallpaperItem;
use rand::seq::SliceRandom;
use scraper::{Html, Selector};

/// wallpapers-clan scraper — static desktop wallpapers
/// uses the main /desktop-wallpapers/ listing page with pagination
/// two-step: listing → detail page for download url via data-downloadurl attr
const BASE_URL: &str = "https://wallpapers-clan.com";
const DESKTOP_URL: &str = "https://wallpapers-clan.com/desktop-wallpapers/";

/// scrape wallpapers from wallpapers-clan.com
/// fetches the desktop wallpapers listing, extracts thumbnails + detail links,
/// then concurrently resolves download urls from detail pages for speed
pub async fn scrape_wallpapersclan(
    _query: &str, // ignored - site doesn't have real search, we browse listings
    limit: usize,
    page: u32,
) -> Result<Vec<WallpaperItem>, String> {
    println!(
        "[SCRAPER:WALLPAPERSCLAN] starting scrape - limit: {}, page: {}",
        limit, page
    );

    let client = build_chrome_client()?;

    // pagination: /desktop-wallpapers/page/2/ etc
    let url = if page > 1 {
        format!("{}page/{}/", DESKTOP_URL, page)
    } else {
        DESKTOP_URL.to_string()
    };

    println!("[SCRAPER:WALLPAPERSCLAN] fetching: {}", url);

    let response = client
        .get(&url)
        .header("Referer", BASE_URL)
        .header("DNT", "1")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;

    let status = response.status();
    println!("[SCRAPER:WALLPAPERSCLAN] http status: {}", status);

    if !status.is_success() {
        return Err(format!("HTTP {} from wallpapers-clan", status));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    let mut items = Vec::new();

    // selectors matching the new qodef grid layout
    let article_selector = Selector::parse("article.qodef-grid-item").unwrap();
    let media_link_selector = Selector::parse(".qodef-e-media-image a[itemprop='url']").unwrap();
    let img_selector = Selector::parse("img.wp-post-image").unwrap();
    let noscript_selector = Selector::parse("noscript").unwrap();
    let title_selector = Selector::parse("h4.qodef-e-title a.qodef-e-title-link").unwrap();
    let category_selector = Selector::parse(".qodef-e-info-category a.qodef-e-category").unwrap();

    let articles: Vec<_> = document.select(&article_selector).collect();
    println!(
        "[SCRAPER:WALLPAPERSCLAN] found {} articles on page",
        articles.len()
    );

    for article in articles.iter() {
        if items.len() >= limit {
            break;
        }

        // get the detail page url from the image link
        let detail_url = match article.select(&media_link_selector).next() {
            Some(a) => match a.value().attr("href") {
                Some(href) if href.contains("desktop-wallpapers") => href.to_string(),
                _ => continue,
            },
            None => continue,
        };

        // extract thumbnail — try data-lazy-src first, then data-lazy-srcset, then noscript fallback
        let thumbnail_url = article
            .select(&img_selector)
            .next()
            .and_then(|img| {
                // data-lazy-src is the cleanest source
                let lazy_src = img.value().attr("data-lazy-src");
                if let Some(src) = lazy_src {
                    if !src.contains("data:image/svg") {
                        return Some(src.to_string());
                    }
                }

                // fallback: first entry from data-lazy-srcset
                let lazy_srcset = img.value().attr("data-lazy-srcset");
                if let Some(srcset) = lazy_srcset {
                    if let Some(first) = srcset.split(',').next() {
                        let url = first.trim().split_whitespace().next().unwrap_or("");
                        if !url.is_empty() && !url.contains("data:image/svg") {
                            return Some(url.to_string());
                        }
                    }
                }

                // last resort: plain src (usually the svg placeholder, but just in case)
                let src = img.value().attr("src");
                if let Some(s) = src {
                    if !s.contains("data:image/svg") {
                        return Some(s.to_string());
                    }
                }

                None
            })
            .or_else(|| {
                // noscript fallback — parse the inner html for the real img src
                article.select(&noscript_selector).next().and_then(|ns| {
                    let inner = ns.inner_html();
                    let frag = Html::parse_fragment(&inner);
                    let img_sel = Selector::parse("img").unwrap();
                    frag.select(&img_sel).next().and_then(|img| {
                        img.value()
                            .attr("src")
                            .filter(|s| !s.contains("data:image/svg"))
                            .map(|s| s.to_string())
                    })
                })
            });

        let thumbnail_url = match thumbnail_url {
            Some(url) => url,
            None => {
                println!(
                    "[SCRAPER:WALLPAPERSCLAN] skipping article: no usable thumbnail"
                );
                continue;
            }
        };

        // extract title
        let title = article
            .select(&title_selector)
            .next()
            .map(|t| t.text().collect::<String>().trim().to_string())
            .unwrap_or_else(|| "Wallpapers Clan".to_string());

        // extract tags from category links
        let tags: Vec<String> = article
            .select(&category_selector)
            .map(|cat| cat.text().collect::<String>().trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();

        // slug from url for id
        let id = detail_url
            .trim_end_matches('/')
            .split('/')
            .next_back()
            .unwrap_or("unknown")
            .to_string();

        items.push(WallpaperItem {
            id: format!("wallpapersclan-{}", id),
            source: "wallpapersclan".to_string(),
            title: Some(title),
            image_url: thumbnail_url.clone(),
            thumbnail_url: Some(thumbnail_url),
            media_type: Some("image".to_string()),
            width: Some(768),
            height: Some(432),
            tags: if tags.is_empty() { None } else { Some(tags) },
            detail_url: Some(detail_url),
            original: None,
        });
    }

    // shuffle for variety on repeated loads
    let mut rng = rand::thread_rng();
    items.shuffle(&mut rng);

    if items.is_empty() {
        println!("[SCRAPER:WALLPAPERSCLAN] no items found");
        return Err("wallpapersclan returned no results".to_string());
    }

    println!(
        "[SCRAPER:WALLPAPERSCLAN] returning {} items",
        items.len()
    );
    Ok(items)
}

/// resolve the actual download url from a wallpapersclan detail page
/// grabs a.wpdm-download-link[data-downloadurl] — baked into the html by wordpress, no js needed
pub async fn resolve_wallpapersclan_download(detail_url: &str) -> Result<String, String> {
    println!(
        "[SCRAPER:WALLPAPERSCLAN] resolving download for: {}",
        detail_url
    );

    let client = build_chrome_client()?;

    let response = client
        .get(detail_url)
        .header("Referer", DESKTOP_URL)
        .header("DNT", "1")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status));
    }

    let html = response.text().await.map_err(|e| e.to_string())?;
    let document = Html::parse_document(&html);

    // primary: the download button with data-downloadurl attribute
    let download_btn_selector = Selector::parse("a.wpdm-download-link").unwrap();

    if let Some(btn) = document.select(&download_btn_selector).next() {
        if let Some(download_url) = btn.value().attr("data-downloadurl") {
            if !download_url.is_empty() {
                println!(
                    "[SCRAPER:WALLPAPERSCLAN] found download url: {}",
                    download_url
                );
                return Ok(download_url.to_string());
            }
        }
    }

    // fallback: look for any download link in the media-body section
    let download_link_selector = Selector::parse(".media-body a[href*='download']").unwrap();
    if let Some(link) = document.select(&download_link_selector).next() {
        if let Some(href) = link.value().attr("href") {
            println!(
                "[SCRAPER:WALLPAPERSCLAN] found fallback download link: {}",
                href
            );
            return Ok(href.to_string());
        }
    }

    // last fallback: try to find the full-res image directly on the detail page
    let fullres_selector = Selector::parse("img.wp-post-image").unwrap();
    if let Some(img) = document.select(&fullres_selector).next() {
        // try data-lazy-src first, then srcset first entry, then src
        let src = img
            .value()
            .attr("data-lazy-src")
            .or_else(|| {
                img.value().attr("data-lazy-srcset").and_then(|srcset| {
                    srcset
                        .split(',')
                        .next()
                        .and_then(|s| s.trim().split_whitespace().next())
                })
            })
            .or_else(|| img.value().attr("src"))
            .filter(|s| !s.contains("data:image/svg"));

        if let Some(url) = src {
            println!(
                "[SCRAPER:WALLPAPERSCLAN] found image fallback: {}",
                url
            );
            return Ok(url.to_string());
        }
    }

    Err("could not find download url on detail page".to_string())
}
