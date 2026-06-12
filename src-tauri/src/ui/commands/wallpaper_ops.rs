use crate::data::models::*;
use crate::data::scrapers::utils::chrome_145_user_agent;
use crate::data::storage::*;
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn download_wallpaper(
    app: AppHandle,
    url: String,
    suggested_filename: String,
    referer: Option<String>,
) -> Result<DownloadResponse, String> {
    use futures_util::StreamExt;

    println!("[download_wallpaper] Starting download from: {}", url);

    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(&url);

    if let Some(ref_url) = &referer {
        request = request.header("Referer", ref_url);
        println!("[download] Added Referer header: {}", ref_url);
    }
    request = request.header("Accept", "video/*,image/*,*/*;q=0.8");

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("[download] Total size: {} bytes", total_size);

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut bytes_vec = Vec::new();

    let progress_interval = if total_size > 0 {
        std::cmp::max(51200, total_size / 100)
    } else {
        51200
    };
    let mut last_progress_emit = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        bytes_vec.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if downloaded - last_progress_emit >= progress_interval
            || (total_size > 0 && downloaded >= total_size)
        {
            last_progress_emit = downloaded;
            let percentage = if total_size > 0 {
                ((downloaded as f64 / total_size as f64) * 100.0 * 100.0).round() / 100.0
            } else {
                0.0
            };

            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "downloaded": downloaded,
                    "total": total_size,
                    "percentage": percentage,
                }),
            );
        }
    }

    println!("[download] Downloaded {} bytes", bytes_vec.len());

    let extension = suggested_filename.split('.').next_back().unwrap_or("jpg");

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&suggested_filename)
        .add_filter("Image/Video", &[extension, "jpg", "png", "mp4", "webp"])
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            println!("[download] Saving to: {}", path_str);

            std::fs::write(&path_str, bytes_vec).map_err(|e| e.to_string())?;

            Ok(DownloadResponse {
                success: true,
                path: Some(path_str),
                error: None,
            })
        }
        None => {
            println!("[download] User cancelled save dialog");
            Ok(DownloadResponse {
                success: false,
                path: None,
                error: Some("Save cancelled by user".to_string()),
            })
        }
    }
}

/// download image from url to cache
async fn download_image(url: &str, referer: Option<&str>) -> Result<std::path::PathBuf, String> {
    println!("[download_image] Downloading image from: {}", url);

    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(url);

    if let Some(ref_url) = referer {
        request = request.header("Referer", ref_url);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!(
            "HTTP {}: {}",
            status,
            status.canonical_reason().unwrap_or("Unknown error")
        ));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    println!("[download_image] Downloaded {} bytes", bytes.len());

    let cache_dir = get_cache_dir()?;
    let extension = url
        .split('.')
        .next_back()
        .and_then(|ext| ext.split('?').next())
        .unwrap_or("jpg");

    let file_name = format!(
        "wallpaper_{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        extension
    );
    let file_path = cache_dir.join(file_name);

    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    println!(
        "[download_image] Image saved to cache: {}",
        file_path.display()
    );
    Ok(file_path)
}

#[tauri::command]
pub async fn set_wallpaper(
    image_url: String,
    referer: Option<String>,
) -> Result<WallpaperResponse, String> {
    println!("[set_wallpaper] Setting wallpaper from URL: {}", image_url);

    let file_path = match download_image(&image_url, referer.as_deref()).await {
        Ok(path) => path,
        Err(e) => {
            return Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some(format!("failed to download image: {}", e)),
            });
        }
    };

    match wallpaper::set_from_path(&file_path.to_string_lossy()) {
        Ok(_) => {
            let display_title = image_url.split('/').next_back().unwrap_or("Static Wallpaper").split('?').next().unwrap_or("Static Wallpaper").to_string();
            crate::core::discord_rpc::update_presence(display_title, false);
            
            Ok(WallpaperResponse {
                success: true,
                message: Some("Wallpaper set successfully".to_string()),
                error: None,
            })
        },
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("failed to set wallpaper: {}", e)),
        }),
    }
}

#[tauri::command]
pub async fn get_current_wallpaper() -> Result<WallpaperResponse, String> {
    match wallpaper::get() {
        Ok(path) => Ok(WallpaperResponse {
            success: true,
            message: Some(path),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("failed to get wallpaper: {}", e)),
        }),
    }
}
