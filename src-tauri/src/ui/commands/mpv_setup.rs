use crate::data::storage::paths::get_app_data_dir;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const MPV_DOWNLOAD_URL: &str = "https://github.com/Colorwall/Colorwall-Site/releases/download/mpv.exe/mpv.exe";

#[derive(Serialize)]
pub struct MpvSetupResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn check_mpv_installed() -> MpvSetupResponse {
    match get_app_data_dir() {
        Ok(dir) => {
            let mpv_path = dir.join("mpv").join("mpv.exe");
            if mpv_path.exists() {
                MpvSetupResponse {
                    success: true,
                    path: Some(mpv_path.to_string_lossy().to_string()),
                    error: None,
                }
            } else {
                MpvSetupResponse {
                    success: false,
                    path: None,
                    error: None,
                }
            }
        }
        Err(e) => MpvSetupResponse {
            success: false,
            path: None,
            error: Some(format!("cannot get app data dir: {}", e)),
        },
    }
}

#[tauri::command]
pub async fn download_and_setup_mpv(app: AppHandle) -> MpvSetupResponse {
    println!("[mpv_setup] starting mpv download...");

    let app_data = match get_app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            return MpvSetupResponse {
                success: false,
                path: None,
                error: Some(format!("cannot get app data dir: {}", e)),
            }
        }
    };

    let mpv_dir = app_data.join("mpv");
    if !mpv_dir.exists() {
        let _ = std::fs::create_dir_all(&mpv_dir);
    }

    let mpv_path = mpv_dir.join("mpv.exe");

    let client = reqwest::Client::builder()
        .user_agent("Colorwall-WallpaperEngine/1.0")
        .build()
        .map_err(|e| {
            MpvSetupResponse {
                success: false,
                path: None,
                error: Some(format!("failed to build http client: {}", e)),
            }
        });
        
    let client = match client {
        Ok(c) => c,
        Err(e) => return e,
    };

    let response = match client.get(MPV_DOWNLOAD_URL).send().await {
        Ok(r) => r,
        Err(e) => {
            return MpvSetupResponse {
                success: false,
                path: None,
                error: Some(format!("failed to download mpv: {}", e)),
            }
        }
    };

    if !response.status().is_success() {
        return MpvSetupResponse {
            success: false,
            path: None,
            error: Some(format!("server returned: {}", response.status())),
        };
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("[mpv_setup] downloading {} bytes...", total_size);

    let mut stream = response.bytes_stream();
    let mut file = match std::fs::File::create(&mpv_path) {
        Ok(f) => f,
        Err(e) => {
            return MpvSetupResponse {
                success: false,
                path: None,
                error: Some(format!("failed to create file: {}", e)),
            }
        }
    };

    let mut downloaded: u64 = 0;
    let progress_interval = if total_size > 0 {
        std::cmp::max(102400, total_size / 50)
    } else {
        102400
    };
    let mut last_progress_emit = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&mpv_path);
                return MpvSetupResponse {
                    success: false,
                    path: None,
                    error: Some(format!("download interrupted: {}", e)),
                };
            }
        };

        use std::io::Write;
        if let Err(e) = file.write_all(&chunk) {
            let _ = std::fs::remove_file(&mpv_path);
            return MpvSetupResponse {
                success: false,
                path: None,
                error: Some(format!("write failed: {}", e)),
            };
        }

        downloaded += chunk.len() as u64;

        if downloaded - last_progress_emit >= progress_interval
            || (total_size > 0 && downloaded >= total_size)
        {
            last_progress_emit = downloaded;
            let percentage = if total_size > 0 {
                ((downloaded as f64 / total_size as f64) * 100.0).round()
            } else {
                0.0
            };

            let _ = app.emit(
                "mpv-download-progress",
                serde_json::json!({
                    "downloaded": downloaded,
                    "total": total_size,
                    "percentage": percentage,
                }),
            );
        }
    }

    println!(
        "[mpv_setup] mpv downloaded to: {}",
        mpv_path.to_string_lossy()
    );

    let path_str = mpv_path.to_string_lossy().to_string();
    if let Err(e) = update_mpv_path_in_settings(&path_str) {
        println!("[mpv_setup] warning: couldn't auto-update settings: {}", e);
    }

    MpvSetupResponse {
        success: true,
        path: Some(path_str),
        error: None,
    }
}

fn update_mpv_path_in_settings(path: &str) -> Result<(), String> {
    let app_data = get_app_data_dir()?;
    let settings_path = app_data.join("settings.json");

    if !settings_path.exists() {
        return Ok(());
    }

    let content =
        std::fs::read_to_string(&settings_path).map_err(|e| format!("read error: {}", e))?;

    let mut settings: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("parse error: {}", e))?;

    if let Some(obj) = settings.as_object_mut() {
        obj.insert(
            "mpv_path".to_string(),
            serde_json::Value::String(path.to_string()),
        );
    }

    let updated =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("serialize error: {}", e))?;
    std::fs::write(&settings_path, updated).map_err(|e| format!("write error: {}", e))?;

    println!("[mpv_setup] settings updated with mpv path: {}", path);
    Ok(())
}
