use crate::core::player::manager::create_video_wallpaper_on_monitors;
use crate::data::models::*;
use crate::data::storage::*;
use tauri::AppHandle;

#[tauri::command]
pub async fn register_local_wallpaper(file_path: String) -> Result<WallpaperResponse, String> {
    match add_linked_wallpaper(&file_path) {
        Ok(linked) => Ok(WallpaperResponse {
            success: true,
            message: Some(linked.id),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn set_local_wallpaper(file_path: String) -> Result<WallpaperResponse, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("File not found: {}", file_path)),
        });
    }

    match wallpaper::set_from_path(&file_path) {
        Ok(_) => Ok(WallpaperResponse {
            success: true,
            message: Some("Wallpaper set successfully".to_string()),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("failed to set wallpaper: {}", e)),
        }),
    }
}

#[tauri::command]
pub async fn set_local_video_wallpaper(
    app: AppHandle,
    file_path: String,
) -> Result<WallpaperResponse, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("File not found: {}", file_path)),
        });
    }

    // delegate to per-monitor function targeting primary display
    let primary_id = crate::core::ipc::resolve_primary_id();
    match create_video_wallpaper_on_monitors(&app, &file_path, None, &[primary_id]) {
        Ok(_) => Ok(WallpaperResponse {
            success: true,
            message: Some("video wallpaper set from local file".to_string()),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("failed to set video wallpaper: {}", e)),
        }),
    }
}
