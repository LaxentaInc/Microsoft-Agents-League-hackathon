use crate::data::models::VideoWallpaperState;
use crate::data::storage::get_app_data_dir;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

lazy_static::lazy_static! {
    pub static ref VIDEO_WALLPAPER_STATE: Arc<Mutex<VideoWallpaperState>> = Arc::new(Mutex::new(VideoWallpaperState {
        is_active: false,
        video_path: None,
        video_url: None,
        original_url: None,
        set_at: None,
        active_monitors: None,
        monitor_wallpapers: None,
    }));
}

/// wallpaper storage directory (in appdata, persists across restarts)
pub fn get_wallpaper_dir() -> Result<PathBuf, String> {
    let base = get_app_data_dir()?;
    let dir = base.join("wallpapers");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create wallpaper directory: {}", e))?;
    Ok(dir)
}

/// persistent state file location (in appdata, survives cache clears)
pub fn get_state_file() -> Result<PathBuf, String> {
    let dir = get_app_data_dir()?;
    Ok(dir.join("wallpaper_state.json"))
}

pub fn save_wallpaper_state(state: &VideoWallpaperState) -> Result<(), String> {
    let state_file = get_state_file()?;
    let backup_file = state_file.with_extension("bak");
    let temp_file = state_file.with_extension("tmp");

    // backup current state if it exists
    if state_file.exists() {
        let _ = fs::copy(&state_file, &backup_file);
    }

    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("failed to serialize state: {}", e))?;

    use std::io::Write;
    let mut file = fs::File::create(&temp_file)
        .map_err(|e| format!("failed to create temp state file: {}", e))?;
    file.write_all(json.as_bytes())
        .map_err(|e| format!("failed to write temp state file: {}", e))?;

    // force flush to disk before rename (prevents power-cut corruption)
    file.sync_all()
        .map_err(|e| format!("failed to sync temp state file to disk: {}", e))?;
    drop(file);

    fs::rename(&temp_file, &state_file)
        .map_err(|e| format!("failed to rename state file: {}", e))?;

    Ok(())
}

pub fn load_wallpaper_state() -> Option<VideoWallpaperState> {
    let state_file = get_state_file().ok()?;
    let backup_file = state_file.with_extension("bak");

    if state_file.exists() {
        if let Ok(content) = fs::read_to_string(&state_file) {
            if let Ok(state) = serde_json::from_str(&content) {
                return Some(state);
            }
            println!("[state] Failed to parse state, trying backup");
        }
    }
    // i think there is no backup file, since we only save original url as backup for restore
    // ok nvm there is, i keep misreading things, will be named wallpaper_state.json.test_backup in %APPDATA%
    if backup_file.exists() {
        if let Ok(content) = fs::read_to_string(&backup_file) {
            if let Ok(state) = serde_json::from_str(&content) {
                println!("[state] Recovered from backup");
                let _ = fs::copy(&backup_file, &state_file);
                return Some(state);
            }
        }
    }

    None
}

pub fn get_video_wallpaper_state() -> VideoWallpaperState {
    VIDEO_WALLPAPER_STATE.lock().unwrap().clone()
}

pub fn periodic_state_save() {
    let state = VIDEO_WALLPAPER_STATE.lock().unwrap();
    if state.is_active {
        if let Err(e) = save_wallpaper_state(&state) {
            println!("[state] Failed to save periodic state: {}", e);
        }
    }
}
