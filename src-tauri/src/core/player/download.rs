use crate::core::player::state::get_wallpaper_dir;
use crate::data::scrapers::utils::build_chrome_client;
use futures_util::StreamExt;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

pub async fn download_video(
    app: &AppHandle,
    url: &str,
    referer: Option<&str>,
) -> Result<PathBuf, String> {
    let client = build_chrome_client()?;

    let mut request = client.get(url);
    if let Some(ref_url) = referer {
        request = request.header("Referer", ref_url);
        println!("[download] Using utils.rs build client + Added Referer header: {}", ref_url);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("failed to download video: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned error: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("[download] downloading {} bytes...", total_size);
    let wallpaper_dir = get_wallpaper_dir()?;
    let extension = if url.contains(".mkv") { "mkv" } else { "mp4" };
    let file_name = format!(
        "wallpaper_{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        extension
    );
    let file_path = wallpaper_dir.join(file_name);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("failed to create video file: {}", e))?;

    // emit progress roughly every 1% or every 50kb, whichever is smaller
    let progress_interval = if total_size > 0 {
        std::cmp::max(51200, total_size / 100)
    } else {
        51200
    };
    let mut last_progress_emit = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk)
            .map_err(|e| format!("failed to write to file: {}", e))?;
        downloaded += chunk.len() as u64;

        if downloaded - last_progress_emit >= progress_interval
            || (total_size > 0 && downloaded >= total_size)
        {
            last_progress_emit = downloaded;
            let percentage = if total_size > 0 {
                // use f64 for decimal precision
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
    println!("[download] downloaded to: {:?}", file_path);

    cleanup_old_wallpapers(&wallpaper_dir, &file_path);

    Ok(file_path)
}

fn cleanup_old_wallpapers(wallpaper_dir: &PathBuf, current_file: &PathBuf) {
    if let Ok(entries) = std::fs::read_dir(wallpaper_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path != *current_file {
                if let Some(name) = path.file_name() {
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("wallpaper_")
                        && (name_str.ends_with(".mp4") || name_str.ends_with(".mkv"))
                    {
                        println!("[download] Removing old wallpaper: {:?}", path);
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }
}
