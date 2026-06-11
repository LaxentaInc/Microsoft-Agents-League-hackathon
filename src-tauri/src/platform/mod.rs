#[cfg(target_os = "windows")]
pub mod windows;


use tauri::AppHandle;

pub fn create_platform_wallpaper(app: &AppHandle, video_path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::engine::create_wallpaper(app, video_path)
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (app, video_path);
        Err("Video wallpapers not supported on this platform".into())
    }
}

pub fn stop_platform_wallpaper() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::engine::stop_wallpaper()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err("Video wallpapers not supported on this platform".into())
    }
}
