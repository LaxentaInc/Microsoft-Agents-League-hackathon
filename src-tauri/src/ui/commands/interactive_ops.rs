use crate::data::models::interactive::*;
use crate::data::models::WallpaperResponse;
use crate::data::storage::paths::get_app_data_dir;
use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const IASSETS_URL: &str = "https://github.com/Colorwall/Colorwall-Site/releases/download/asset/iAssets.zip";

lazy_static::lazy_static! {
    static ref IS_DOWNLOADING_IASSETS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
}

#[tauri::command]
pub async fn check_interactive_assets_downloading() -> bool {
    IS_DOWNLOADING_IASSETS.load(std::sync::atomic::Ordering::SeqCst)
}

/// helper to see if the interactive directory actually has content
fn is_iassets_dir_populated() -> bool {
    match get_app_data_dir() {
        Ok(dir) => {
            let interactive_dir = dir.join("interactive");
            if !interactive_dir.exists() || !interactive_dir.is_dir() {
                return false;
            }
            // check if it has any subdirectories (wallpapers)
            if let Ok(entries) = std::fs::read_dir(interactive_dir) {
                return entries.filter_map(|e| e.ok()).any(|e| e.path().is_dir());
            }
            false
        }
        Err(_) => false,
    }
}

/// check if default interactive assets are already installed
#[tauri::command]
pub async fn check_interactive_assets_installed() -> bool {
    let has_marker = match get_app_data_dir() {
        Ok(dir) => dir.join(".iassets_v1_downloaded").exists(),
        Err(_) => false,
    };
    // must have marker AND actual content
    has_marker && is_iassets_dir_populated()
}

/// download default interactive wallpapers (user-triggered from library page)
#[tauri::command]
pub async fn download_interactive_assets(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = get_app_data_dir()
        .map_err(|e| format!("cannot get app data dir: {}", e))?;

    let interactive_dir = app_data.join("interactive");
    if !interactive_dir.exists() {
        let _ = std::fs::create_dir_all(&interactive_dir);
    }

    let marker_file = app_data.join(".iassets_v1_downloaded");
    
    // if marker exists AND dir is populated, we are good
    if marker_file.exists() && is_iassets_dir_populated() {
        return Ok("already installed".to_string());
    }

    if IS_DOWNLOADING_IASSETS.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok("downloading".to_string());
    }
    
    IS_DOWNLOADING_IASSETS.store(true, std::sync::atomic::Ordering::SeqCst);
    println!("[iassets] starting background download of interactive wallpapers...");

    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;
        let temp_zip = std::env::temp_dir().join("iAssets.tmp.zip");
        
        let curl_output = Command::new("curl")
            .args(["-L", "-o", &temp_zip.to_string_lossy(), IASSETS_URL])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
            
        if let Ok(out) = curl_output {
            if !out.status.success() {
                println!("[iassets] curl download failed: {}", String::from_utf8_lossy(&out.stderr));
                IS_DOWNLOADING_IASSETS.store(false, std::sync::atomic::Ordering::SeqCst);
                let _ = app.emit("iassets-download-complete", serde_json::json!({ "success": false, "error": "Download failed" }));
                return;
            }
        } else {
            IS_DOWNLOADING_IASSETS.store(false, std::sync::atomic::Ordering::SeqCst);
            let _ = app.emit("iassets-download-complete", serde_json::json!({ "success": false, "error": "Curl command failed" }));
            return;
        }

        let tar_output = Command::new("tar")
            .args(["-xf", &temp_zip.to_string_lossy(), "-C", &interactive_dir.to_string_lossy()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let _ = std::fs::remove_file(&temp_zip);

        if let Ok(out) = tar_output {
            if out.status.success() {
                // handle nested iAssets folder if present in the zip
                let nested_dir = interactive_dir.join("iAssets");
                if nested_dir.exists() && nested_dir.is_dir() {
                    println!("[iassets] moving contents from nested iAssets folder...");
                    if let Ok(entries) = std::fs::read_dir(&nested_dir) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let old_path = entry.path();
                            if let Some(name) = old_path.file_name() {
                                let new_path = interactive_dir.join(name);
                                let _ = std::fs::rename(old_path, new_path);
                            }
                        }
                    }
                    let _ = std::fs::remove_dir_all(nested_dir);
                }

                let _ = std::fs::write(&marker_file, "done");
                println!("[iassets] default interactive wallpapers installed successfully.");
                IS_DOWNLOADING_IASSETS.store(false, std::sync::atomic::Ordering::SeqCst);
                let _ = app.emit("iassets-download-complete", serde_json::json!({ "success": true }));
            } else {
                let err = String::from_utf8_lossy(&out.stderr);
                println!("[iassets] extraction failed: {}", err);
                IS_DOWNLOADING_IASSETS.store(false, std::sync::atomic::Ordering::SeqCst);
                let _ = app.emit("iassets-download-complete", serde_json::json!({ "success": false, "error": err.to_string() }));
            }
        } else {
            IS_DOWNLOADING_IASSETS.store(false, std::sync::atomic::Ordering::SeqCst);
            let _ = app.emit("iassets-download-complete", serde_json::json!({ "success": false, "error": "Extraction failed" }));
        }
    });

    Ok("started".to_string())
}

/// resync
#[tauri::command]
pub async fn resync_interactive_assets(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = get_app_data_dir()
        .map_err(|e| format!("cannot get app data dir: {}", e))?;

    let marker_file = app_data.join(".iassets_v1_downloaded");
    if marker_file.exists() {
        let _ = std::fs::remove_file(&marker_file);
    }

    let interactive_dir = app_data.join("interactive");
    if interactive_dir.exists() {
        let _ = std::fs::remove_dir_all(&interactive_dir);
    }

    download_interactive_assets(app).await
}

#[cfg(target_os = "windows")]
use crate::platform::windows::interactive::{import, player, scanner};

/// list all interactive wallpapers in the library
#[tauri::command]
pub async fn list_interactive_wallpapers() -> Result<InteractiveWallpapersResponse, String> {
    #[cfg(target_os = "windows")]
    {
        match scanner::scan_interactive_library() {
            Ok(wallpapers) => Ok(InteractiveWallpapersResponse {
                success: true,
                wallpapers,
                error: None,
            }),
            Err(e) => Ok(InteractiveWallpapersResponse {
                success: false,
                wallpapers: Vec::new(),
                error: Some(e),
            }),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(InteractiveWallpapersResponse {
            success: false,
            wallpapers: Vec::new(),
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// import an interactive wallpaper folder into the library
#[tauri::command]
pub async fn import_interactive_wallpaper(
    folder_path: String,
) -> Result<WallpaperResponse, String> {
    #[cfg(target_os = "windows")]
    {
        match import::import_interactive_folder(&folder_path) {
            Ok(dest) => Ok(WallpaperResponse {
                success: true,
                message: Some(dest),
                error: None,
            }),
            Err(e) => Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some(e),
            }),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = folder_path;
        Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// set an interactive wallpaper on specified monitors
#[tauri::command]
pub async fn set_interactive_wallpaper(
    app: tauri::AppHandle,
    folder_path: String,
    monitor_ids: Vec<String>,
) -> Result<WallpaperResponse, String> {
    #[cfg(target_os = "windows")]
    {
        let mut last_err: Option<String> = None;

        for mid in &monitor_ids {
            match player::start_interactive_wallpaper(&app, &folder_path, Some(mid)) {
                Ok(_) => println!("[interactive_ops] wallpaper set on {}", mid),
                Err(e) => {
                    println!("[interactive_ops] failed on {}: {}", mid, e);
                    last_err = Some(e);
                }
            }
        }

        if let Some(e) = last_err {
            Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some(format!("some monitors failed: {}", e)),
            })
        } else {
            Ok(WallpaperResponse {
                success: true,
                message: Some("interactive wallpaper set".to_string()),
                error: None,
            })
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, folder_path, monitor_ids);
        Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// stop all interactive wallpapers
#[tauri::command]
pub async fn stop_interactive_wallpaper(
    app: tauri::AppHandle,
) -> Result<WallpaperResponse, String> {
    #[cfg(target_os = "windows")]
    {
        match player::stop_all_interactive_wallpapers(&app) {
            Ok(_) => Ok(WallpaperResponse {
                success: true,
                message: Some("interactive wallpapers stopped".to_string()),
                error: None,
            }),
            Err(e) => Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some(e),
            }),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// stop the interactive wallpaper on a specific monitor
#[tauri::command]
pub async fn stop_interactive_wallpaper_on_monitor(
    app: tauri::AppHandle,
    monitor_id: String,
) -> Result<WallpaperResponse, String> {
    #[cfg(target_os = "windows")]
    {
        crate::platform::windows::interactive::state::clean_interactive_webview(&app, &monitor_id);
        Ok(WallpaperResponse {
            success: true,
            message: Some(format!("interactive wallpaper stopped on {}", monitor_id)),
            error: None,
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, monitor_id);
        Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// query which monitors have active interactive wallpapers
#[tauri::command]
pub async fn get_active_interactive_monitors() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        player::get_active_interactive_monitors()
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

/// get properties for a specific interactive wallpaper
#[tauri::command]
pub async fn get_interactive_properties(
    folder_path: String,
) -> Result<InteractivePropertiesResponse, String> {
    #[cfg(target_os = "windows")]
    {
        let path = std::path::Path::new(&folder_path);
        if let Some(info) = scanner::scan_folder(path) {
            Ok(InteractivePropertiesResponse {
                success: true,
                properties: info.properties,
                error: None,
            })
        } else {
            Ok(InteractivePropertiesResponse {
                success: false,
                properties: None,
                error: Some("folder not recognized as interactive wallpaper".to_string()),
            })
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = folder_path;
        Ok(InteractivePropertiesResponse {
            success: false,
            properties: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// send a live property update to a running interactive wallpaper
#[tauri::command]
pub async fn update_interactive_property(
    app: tauri::AppHandle,
    monitor_id: String,
    property_name: String,
    value: serde_json::Value,
) -> Result<WallpaperResponse, String> {
    #[cfg(target_os = "windows")]
    {
        match player::send_property_update(&app, &monitor_id, &property_name, &value) {
            Ok(_) => Ok(WallpaperResponse {
                success: true,
                message: Some("property updated".to_string()),
                error: None,
            }),
            Err(e) => Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some(e),
            }),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, monitor_id, property_name, value);
        Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("interactive wallpapers only supported on windows".to_string()),
        })
    }
}

/// delete an interactive wallpaper from the library
#[tauri::command]
pub async fn delete_interactive_wallpaper(
    folder_path: String,
) -> Result<WallpaperResponse, String> {
    let path = std::path::Path::new(&folder_path);

    if !path.exists() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("folder does not exist".to_string()),
        });
    }

    if !path.is_dir() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some("path is not a directory".to_string()),
        });
    }

    // make sure we're only deleting from our interactive directory
    #[cfg(target_os = "windows")]
    {
        let interactive_dir = scanner::get_interactive_dir()?;
        let canonical_path =
            std::fs::canonicalize(path).map_err(|e| format!("failed to resolve path: {}", e))?;
        let canonical_dir = std::fs::canonicalize(&interactive_dir)
            .map_err(|e| format!("failed to resolve interactive dir: {}", e))?;

        if !canonical_path.starts_with(&canonical_dir) {
            return Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some("can only delete wallpapers from the interactive library".to_string()),
            });
        }
    }

    std::fs::remove_dir_all(path).map_err(|e| format!("failed to delete folder: {}", e))?;

    Ok(WallpaperResponse {
        success: true,
        message: Some("deleted successfully".to_string()),
        error: None,
    })
}
