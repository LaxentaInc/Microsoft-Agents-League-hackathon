// ACTUAL scrapers made from reading site html lol, used by the search.rs command, provides for three tier loading for video and thumbnails.
// will add more video sites soon! i have found a few that i like a lot
use regex::Regex;

// url normalization
pub fn absolute_url(href: &str, base: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else if href.starts_with("//") {
        format!("https:{}", href)
    } else if href.starts_with('/') {
        format!("{}{}", base.trim_end_matches('/'), href)
    } else {
        format!("{}/{}", base.trim_end_matches('/'), href)
    }
}

// srcset/cdn parsing
pub fn pick_image_source(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    let first_segment = value.split(',').next().unwrap_or("").trim();
    first_segment
        .trim_start_matches("url(\"")
        .trim_start_matches("url('")
        .trim_start_matches("url(")
        .trim_end_matches("\")")
        .trim_end_matches("')")
        .trim_end_matches(")")
        .to_string()
}

// regex parse for WxH
pub fn parse_resolution(text: &str) -> (Option<u32>, Option<u32>) {
    let re = Regex::new(r"(\d{3,5})\s*[x×]\s*(\d{3,5})").unwrap();

    if let Some(caps) = re.captures(text) {
        let width = caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok());
        let height = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
        return (width, height);
    }

    (None, None)
}

/// we keep its name whatever is it for now, cz yea it's a pain to change all implementations
pub fn chrome_145_user_agent() -> &'static str {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
}

/// a reqwest client with modern Chrome 145 headers and Client Hints to bypass Akamai WAF
pub fn build_chrome_client() -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();

    // client hints for chrome 148
    headers.insert(
        "sec-ch-ua",
        reqwest::header::HeaderValue::from_static(
            r#""Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99""#,
        ),
    );
    headers.insert(
        "sec-ch-ua-mobile",
        reqwest::header::HeaderValue::from_static("?0"),
    );
    headers.insert(
        "sec-ch-ua-platform",
        reqwest::header::HeaderValue::from_static(r#""Windows""#),
    );
    headers.insert(
        "sec-fetch-dest",
        reqwest::header::HeaderValue::from_static("document"),
    );
    headers.insert(
        "sec-fetch-mode",
        reqwest::header::HeaderValue::from_static("navigate"),
    );
    headers.insert(
        "sec-fetch-site",
        reqwest::header::HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "sec-fetch-user",
        reqwest::header::HeaderValue::from_static("?1"),
    );
    headers.insert(
        "accept",
        reqwest::header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
        ),
    );
    headers.insert(
        "accept-encoding",
        reqwest::header::HeaderValue::from_static("gzip, deflate, br, zstd"),
    );
    headers.insert(
        "accept-language",
        reqwest::header::HeaderValue::from_static("en-US,en;q=0.9,hi;q=0.8,de;q=0.7,ja;q=0.6"),
    );
    headers.insert(
        "upgrade-insecure-requests",
        reqwest::header::HeaderValue::from_static("1"),
    );
    headers.insert(
        "cache-control",
        reqwest::header::HeaderValue::from_static("max-age=0"),
    );
    headers.insert(
        "priority",
        reqwest::header::HeaderValue::from_static("u=0, i"),
    );

    reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}
