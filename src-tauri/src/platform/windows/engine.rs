use crate::core::ipc::{spawn_player, stop_player, stop_player_for_monitor};
use crate::data::models::AppSettings;
use crate::data::storage::get_settings_file;
use crate::platform::windows::desktop::WALLPAPER_SEMAPHORE;
use tauri::AppHandle;

pub fn create_wallpaper(app: &AppHandle, video_path: &str) -> Result<(), String> {
    create_wallpaper_on_monitor(app, video_path, None)
}

pub fn create_wallpaper_on_monitor(
    app: &AppHandle,
    video_path: &str,
    monitor_id: Option<&str>,
) -> Result<(), String> {
    let _permit = WALLPAPER_SEMAPHORE.try_acquire().ok();
    let monitor_label = monitor_id.unwrap_or("primary");
    println!(
        "[win_engine] create_wallpaper_on_monitor: cleaning up '{}' before video wallpaper setup",
        monitor_label
    );

    println!("[win_engine] step 1/3: stopping interactive wallpaper on '{}'", monitor_label);
    crate::platform::windows::interactive::state::clean_interactive_webview(
        app,
        monitor_id.unwrap_or(""),
    );


    println!("[win_engine] step 3/3: spawning video player on '{}'", monitor_label);

    let video_path_abs = std::fs::canonicalize(video_path)
        .map_err(|e| format!("Failed to resolve video path: {}", e))?;

    let video_path_str = video_path_abs.display().to_string();
    let video_path_str = if let Some(stripped) = video_path_str.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        video_path_str
    };

    println!(
        "[win_engine] Setting up video wallpaper on {} via separate process",
        monitor_label
    );
    println!("[win_engine] Cleaned video path: {}", video_path_str);

    // load settings
    let (backend, mpv_path, mpv_preset, audio_enabled, paused, pause_on_fullscreen) = load_player_settings();

    if backend == "mpv" {
        println!(
            "[win_engine] Using backend: {} preset: {} (Audio: {}, Paused: {}, AutoPause: {})",
            backend, mpv_preset, audio_enabled, paused, pause_on_fullscreen
        );
    } else {
        println!(
            "[win_engine] Using backend: {} (Audio: {}, Paused: {}, AutoPause: {})",
            backend, audio_enabled, paused, pause_on_fullscreen
        );
    }

    spawn_player(
        app,
        &video_path_str,
        &backend,
        mpv_path.as_deref(),
        &mpv_preset,
        audio_enabled,
        paused,
        pause_on_fullscreen,
        monitor_id.unwrap_or(""),
    )?;

    println!(
        "[win_engine] Player spawned for {} injection handled by player process",
        monitor_label
    );

    Ok(())
}

pub fn stop_wallpaper() -> Result<(), String> {
    println!("[win_engine] Stopping all wallpaper player processes");
    stop_player()?;
    Ok(())
}

pub fn stop_wallpaper_on_monitor(monitor_id: &str) -> Result<(), String> {
    println!("[win_engine] Stopping wallpaper on monitor {}", monitor_id);
    stop_player_for_monitor(monitor_id)?;
    Ok(())
}

fn load_player_settings() -> (String, Option<String>, String, bool, bool, bool) {
    match get_settings_file() {
        Ok(path) => {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                        Ok(settings) => (
                            settings.video_player,
                            settings.mpv_path,
                            settings.mpv_preset,
                            settings.audio_enabled,
                            !settings.live_wallpaper_enabled, // paused if disabled
                            settings.pause_on_fullscreen,
                        ),
                        Err(_) => ("wmf".to_string(), None, "Performance".to_string(), false, false, true),
                    },
                    Err(_) => ("wmf".to_string(), None, "Performance".to_string(), false, false, true),
                }
            } else {
                ("wmf".to_string(), None, "Performance".to_string(), false, false, true)
            }
        }
        Err(_) => ("wmf".to_string(), None, "Performance".to_string(), false, false, true),
    }
}

