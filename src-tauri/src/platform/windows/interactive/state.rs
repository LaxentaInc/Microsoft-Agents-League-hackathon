// state persistence, saves and removes interactive wallpaper assignments
// from the unified monitor_wallpapers map so they survive app restarts

use std::collections::HashMap;

/// save an interactive wallpaper assignment to persistent state
/// uses the unified monitor_wallpapers map with WallpaperKind::Interactive
pub fn save_interactive_to_state(monitor_id: &str, folder_path: &str) {
    use crate::core::player::state::{save_wallpaper_state, VIDEO_WALLPAPER_STATE};
    use crate::data::models::{MonitorWallpaperEntry, WallpaperKind};

    let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
    state.is_active = true;
    let map = state.monitor_wallpapers.get_or_insert_with(HashMap::new);
    map.insert(
        monitor_id.to_string(),
        MonitorWallpaperEntry {
            kind: WallpaperKind::Interactive,
            path: folder_path.to_string(),
            video_url: None,
            original_url: None,
            enabled: true,
        },
    );
    let _ = save_wallpaper_state(&state);
    println!(
        "[interactive] saved to state: {} -> {}",
        monitor_id, folder_path
    );
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(
        monitor_id,
        &format!("saved to state: {}", folder_path),
    );
}

/// stop and clean the webview for an interactive wallpaper (without purging its config state)
pub fn clean_interactive_webview(app: &tauri::AppHandle, monitor_id: &str) {
    use tauri::Manager;

    let resolved_id = if monitor_id.is_empty() {
        crate::core::ipc::resolve_primary_id()
    } else {
        monitor_id.to_string()
    };
    let clean_id = crate::core::ipc::sanitize_monitor_id(&resolved_id);
    let label = format!("iw_{}", clean_id);

    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(
        &clean_id,
        &format!("stopping web wallpaper on {} (label: {})", clean_id, label),
    );
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
        let _ = window.destroy();
    }

    // clean up in-memory maps tracking this window
    {
        let mut labels = crate::platform::windows::interactive::player::WEB_PLAYER_LABELS.lock().unwrap();
        let _ = labels.remove(&clean_id);
        let mut injected = crate::platform::windows::interactive::player::WIDGET_INJECTED.lock().unwrap();
        injected.remove(&label);
    }
    
    println!("[interactive] cleaned webview: {}", clean_id);
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(
        &clean_id,
        &format!("cleaned webview for: {}", clean_id),
    );
    // free the diagnostics logger to release its file handle and memory
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::cleanup_for_monitor(&clean_id);
}
