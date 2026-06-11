use crate::data::models::*;
use crate::data::storage::*;

lazy_static::lazy_static! {
    static ref CANCELLED_DOWNLOADS: std::sync::Mutex<std::collections::HashSet<String>> = std::sync::Mutex::new(std::collections::HashSet::new());
}

#[tauri::command]
pub fn cancel_library_download(url: String) {
    if let Ok(mut set) = CANCELLED_DOWNLOADS.lock() {
        set.insert(url);
    }
}

#[tauri::command]
pub async fn list_user_wallpapers() -> Result<UserWallpapersResponse, String> {
    let wallpapers_dir = get_user_wallpapers_dir()?;
    let mut wallpapers = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&wallpapers_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    let path = entry.path();
                    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");

                    if matches!(
                        extension,
                        "mp4"
                            | "mkv"
                            | "webm"
                            | "avi"
                            | "mov"
                            | "wmv"
                            | "jpg"
                            | "jpeg"
                            | "png"
                            | "gif"
                    ) {
                        let name = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        let media_type = if matches!(
                            extension,
                            "mp4" | "mkv" | "webm" | "avi" | "mov" | "wmv"
                        ) {
                            "video"
                        } else {
                            "image"
                        };

                        let added_at = metadata
                            .created()
                            .or_else(|_| metadata.modified())
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);

                        wallpapers.push(UserWallpaper {
                            id: format!("{:x}", md5::compute(&name)),
                            name,
                            path: path.to_string_lossy().to_string(),
                            media_type: media_type.to_string(),
                            thumbnail: None,
                            added_at,
                        });
                    }
                }
            }
        }
    }

    // ADD linked wallpapers from collection [LOCAL]
    let collection = load_collection();
    for linked in collection.linked_wallpapers {
        // verify it still exists
        if std::path::Path::new(&linked.path).exists() {
            let extension = std::path::Path::new(&linked.path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let media_type = if matches!(
                extension.as_str(),
                "mp4" | "mkv" | "webm" | "avi" | "mov" | "wmv"
            ) {
                "video"
            } else {
                "image"
            };

            wallpapers.push(UserWallpaper {
                id: linked.id,
                name: linked.name,
                path: linked.path,
                media_type: media_type.to_string(),
                thumbnail: None,
                added_at: linked.added_at,
            });
        }
    }

    wallpapers.sort_by(|a, b| b.added_at.cmp(&a.added_at));

    Ok(UserWallpapersResponse {
        success: true,
        wallpapers,
    })
}

#[tauri::command]
pub async fn upload_user_wallpaper(source_path: String) -> Result<WallpaperResponse, String> {
    let source = std::path::Path::new(&source_path);

    if !source.exists() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("Source file does not exist".to_string()),
        });
    }

    let dest_dir = get_user_wallpapers_dir()?;
    let file_name = source
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    let dest_path = dest_dir.join(&file_name);

    std::fs::copy(source, &dest_path).map_err(|e| format!("failed to copy file: {}", e))?;

    Ok(WallpaperResponse {
        success: true,
        message: Some(dest_path.to_string_lossy().to_string()),
        error: None,
    })
}

#[tauri::command]
pub async fn delete_user_wallpaper(wallpaper_path: String) -> Result<WallpaperResponse, String> {
    // if it's a linked wallpaper ID (starts with local_)
    if wallpaper_path.starts_with("local_") {
        match remove_linked_wallpaper(&wallpaper_path) {
            Ok(_) => {
                return Ok(WallpaperResponse {
                    success: true,
                    message: Some("Unlinked wallpaper successfully".to_string()),
                    error: None,
                })
            }
            Err(e) => {
                return Ok(WallpaperResponse {
                    success: false,
                    message: None,
                    error: Some(e),
                })
            }
        }
    }

    let path = std::path::Path::new(&wallpaper_path);

    if !path.exists() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("File does not exist".to_string()),
        });
    }

    std::fs::remove_file(path).map_err(|e| format!("failed to delete file: {}", e))?;

    Ok(WallpaperResponse {
        success: true,
        message: Some("File deleted successfully".to_string()),
        error: None,
    })
}

#[tauri::command]
pub async fn get_wallpaper_storage_path() -> Result<PathResponse, String> {
    match get_user_wallpapers_dir() {
        Ok(path) => Ok(PathResponse {
            success: true,
            path: Some(path.to_string_lossy().to_string()),
            error: None,
        }),
        Err(e) => Ok(PathResponse {
            success: false,
            path: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn download_to_library(
    app: tauri::AppHandle,
    url: String,
    title: String,
    referer: Option<String>,
) -> Result<WallpaperResponse, String> {
    use crate::data::scrapers::utils::chrome_145_user_agent;
    use futures_util::StreamExt;
    use tauri::Emitter;

    println!("[library] downloading: {} ({})", title, url);

    let app_dir = get_app_data_dir()?;
    let downloads_dir = app_dir.join("downloads");

    if !downloads_dir.exists() {
        std::fs::create_dir_all(&downloads_dir)
            .map_err(|e| format!("failed to create downloads folder: {}", e))?;
    }

    let safe_title: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let extension = {
        let url_path = url.split('?').next().unwrap_or(&url);
        let last_segment = url_path.split('/').next_back().unwrap_or("");

        if let Some(dot_pos) = last_segment.rfind('.') {
            let ext = &last_segment[dot_pos + 1..];
            if matches!(
                ext.to_lowercase().as_str(),
                "mp4"
                    | "webm"
                    | "mkv"
                    | "avi"
                    | "mov"
                    | "wmv"
                    | "jpg"
                    | "jpeg"
                    | "png"
                    | "gif"
                    | "webp"
            ) {
                ext.to_lowercase()
            } else {
                "mp4".to_string()
            }
        } else {
            "mp4".to_string()
        }
    };

    let mut final_filename = format!("{}.{}", safe_title, extension);
    let mut final_dest_path = downloads_dir.join(&final_filename);
    let mut counter = 1;

    while final_dest_path.exists() || downloads_dir.join(format!("{}.part", final_filename)).exists() {
        final_filename = format!("{}_{}.{}", safe_title, counter, extension);
        final_dest_path = downloads_dir.join(&final_filename);
        counter += 1;
    }

    let dest_path = downloads_dir.join(format!("{}.part", final_filename));
    println!("[library] saving to temporary path: {}", dest_path.display());

    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(&url);
    if let Some(ref_url) = &referer {
        request = request.header("Referer", ref_url);
    }
    request = request.header("Accept", "video/*,image/*,*/*;q=0.8");

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Server returned HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;

    let progress_interval = if total_size > 0 {
        std::cmp::max(51200, total_size / 100)
    } else {
        51200
    };
    let mut last_progress_emit = 0u64;

    while let Some(chunk_result) = stream.next().await {
        if let Ok(mut set) = CANCELLED_DOWNLOADS.lock() {
            if set.contains(&url) {
                set.remove(&url);
                drop(file);
                let _ = std::fs::remove_file(&dest_path);
                println!("[library] download cancelled: {}", url);
                return Err("cancelled".to_string());
            }
        }

        let chunk = chunk_result.map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
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

    if let Err(e) = std::fs::rename(&dest_path, &final_dest_path) {
        let _ = std::fs::remove_file(&dest_path);
        return Err(format!("failed to finalize download (rename): {}", e));
    }

    println!("[library] download complete: {}", final_dest_path.display());

    // link it to the library using existing function
    let path_str = final_dest_path.to_string_lossy().to_string();
    match add_linked_wallpaper(&path_str) {
        Ok(linked) => {
            println!("[library] linked wallpaper: {}", linked.id);
            Ok(WallpaperResponse {
                success: true,
                message: Some(linked.id),
                error: None,
            })
        }
        Err(e) => {
            // file downloaded but linking failed - still partially success
            println!("[library] linking failed: {}", e);
            Ok(WallpaperResponse {
                success: true,
                message: Some(path_str),
                error: Some(format!("downloaded but linking failed: {}", e)),
            })
        }
    }
}

#[tauri::command]
pub fn is_in_library(title: String) -> bool {
    let safe_title: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let collection = load_collection();

    for wp in &collection.linked_wallpapers {
        let wp_base = wp.name.split('.').next().unwrap_or("");
        if wp_base.contains(&safe_title) || safe_title.contains(wp_base) {
            return true;
        }
    }

    if let Ok(app_dir) = get_app_data_dir() {
        let downloads_dir = app_dir.join("downloads");
        if downloads_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&downloads_dir) {
                for entry in entries.flatten() {
                    if let Ok(metadata) = entry.metadata() {
                        if metadata.is_file() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.starts_with(&safe_title) && !name.ends_with(".part") {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }

    false
}
