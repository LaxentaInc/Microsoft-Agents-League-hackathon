use crate::core::player::download::download_video;
use crate::core::player::manager::stop_video_wallpaper;
use crate::core::player::state::{get_video_wallpaper_state, load_wallpaper_state, VIDEO_WALLPAPER_STATE};
use crate::data::models::*;
use tauri::AppHandle;

// video_ops.rs → set_video_wallpaper delegates to set_video_wallpaper_on_monitors with primary ID
#[tauri::command]
pub async fn set_video_wallpaper(
    app: AppHandle,
    video_url: String,
    referer: Option<String>,
) -> Result<WallpaperResponse, String> {
    // delegate to per-monitor version targeting primary display
    let primary_id = crate::core::ipc::resolve_primary_id();
    set_video_wallpaper_on_monitors(app, video_url, vec![primary_id], referer).await
}

#[tauri::command]
pub async fn stop_video_wallpaper_command(app: AppHandle) -> Result<WallpaperResponse, String> {
    use crate::core::player::state::save_wallpaper_state;
    // use std::collections::HashSet;

    let state_snapshot = get_video_wallpaper_state();
    let mut had_video = false;
    let mut interactive_monitors: Vec<String> = Vec::new();

    if let Some(map) = &state_snapshot.monitor_wallpapers {
        for (mon_id, entry) in map.iter() {
            match entry.kind {
                WallpaperKind::Video => had_video = true,
                WallpaperKind::Interactive => interactive_monitors.push(mon_id.clone()),
            }
        }
    }

    // stop regular video players first
    if had_video || state_snapshot.is_active {
        let _ = stop_video_wallpaper(&app);
    }

    // stop interactive wallpaper players explicitly and clean their state
    #[cfg(target_os = "windows")]
    {
        for mon_id in interactive_monitors {
            crate::platform::windows::interactive::state::clean_interactive_webview(&app, &mon_id);
        }
        // Trigger global cleanup to hunt down any orphaned webview windows
        let _ = crate::platform::windows::interactive::player::stop_all_interactive_wallpapers(&app);
    }

    // force-clear persisted runtime assignment state regardless of prior stop errors
    {
        let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
        state.is_active = false;
        state.video_path = None;
        state.video_url = None;
        state.original_url = None;
        state.active_monitors = None;
        state.monitor_wallpapers = None;
        let _ = save_wallpaper_state(&state);
    }

    crate::core::discord_rpc::clear_presence();
    Ok(WallpaperResponse {
        success: true,
        message: Some("wallpaper processes stopped and state cleared".to_string()),
        error: None,
    })
}

#[tauri::command]
pub fn get_video_wallpaper_status() -> VideoWallpaperState {
    let state = get_video_wallpaper_state();
    let has_runtime_data = state.is_active
        || state.video_path.as_ref().map(|p| !p.is_empty()).unwrap_or(false)
        || state
            .monitor_wallpapers
            .as_ref()
            .map(|m| !m.is_empty())
            .unwrap_or(false);
    if has_runtime_data {
        return state;
    }

    if let Some(saved) = load_wallpaper_state() {
        let mut runtime = VIDEO_WALLPAPER_STATE.lock().unwrap();
        *runtime = saved.clone();
        return saved;
    }

    state
}

/// get per-monitor wallpaper state specifically
#[tauri::command]
pub fn get_monitor_wallpaper_info() -> std::collections::HashMap<String, MonitorWallpaperEntry> {
    let state = get_video_wallpaper_state();
    if let Some(map) = state.monitor_wallpapers {
        if !map.is_empty() {
            return map;
        }
    }

    if let Some(saved) = load_wallpaper_state() {
        if let Some(map) = saved.monitor_wallpapers.clone() {
            if !map.is_empty() {
                let mut runtime = VIDEO_WALLPAPER_STATE.lock().unwrap();
                *runtime = saved;
                return map;
            }
        }
    }

    std::collections::HashMap::new()
}

/// set a wallpaper on specific monitors
#[tauri::command]
pub async fn set_video_wallpaper_on_monitors(
    app: AppHandle,
    video_url: String,
    monitor_ids: Vec<String>,
    referer: Option<String>,
) -> Result<WallpaperResponse, String> {
    println!(
        "[video_ops] setting video wallpaper on monitors: {:?} - {}",
        monitor_ids, video_url
    );

    let video_path = if video_url.starts_with("file://") {
        // strip file:// or file:/// and trim leading slash for windows paths
        let raw = video_url
            .trim_start_matches("file://")
            .trim_start_matches('/');
        std::path::PathBuf::from(raw)
    } else {
        // ensure downloaded
        match download_video(&app, &video_url, referer.as_deref()).await {
            Ok(path) => path,
            Err(e) => {
                return Ok(WallpaperResponse {
                    success: false,
                    message: None,
                    error: Some(format!("failed to download video: {}", e)),
                });
            }
        }
    };

    use crate::core::player::manager::create_video_wallpaper_on_monitors;
    match create_video_wallpaper_on_monitors(
        &app,
        &video_path.to_string_lossy(),
        Some(video_url.clone()),
        &monitor_ids,
    ) {
        Ok(_) => {
            let display_title = video_url.split('/').next_back().unwrap_or("Live Wallpaper").split('?').next().unwrap_or("Live Wallpaper").to_string();
            crate::core::discord_rpc::update_presence(display_title, true);

            Ok(WallpaperResponse {
                success: true,
                message: Some("video wallpaper set successfully on monitors".to_string()),
                error: None,
            })
        },
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("failed to set video wallpaper: {}", e)),
        }),
    }
}

/// toggle wallpaper on a specific monitor
/// if the monitor already has a player, stop it
/// if not, start the current active wallpaper on that monitor (copying primary or first available)
#[tauri::command]
pub async fn toggle_monitor_wallpaper(
    app: AppHandle,
    monitor_id: String,
) -> Result<WallpaperResponse, String> {
    use crate::core::ipc::sanitize_monitor_id;
    use crate::core::player::state::{save_wallpaper_state, VIDEO_WALLPAPER_STATE};

    println!("[video_ops] toggle wallpaper on monitor: {}", monitor_id);

    let state_snapshot = get_video_wallpaper_state();
    let existing_entry = state_snapshot
        .monitor_wallpapers
        .as_ref()
        .and_then(|map| {
            map.get(&monitor_id).cloned().or_else(|| {
                let clean = sanitize_monitor_id(&monitor_id);
                map.iter()
                    .find(|(mid, _)| sanitize_monitor_id(mid) == clean)
                    .map(|(_, entry)| entry.clone())
            })
        });

    let (mut should_stop, mut entry_to_start) = (false, None);
    if let Some(existing) = existing_entry {
        if existing.enabled {
            should_stop = true;
        } else {
            entry_to_start = Some(existing);
        }
    }

    if should_stop {
        let kind = state_snapshot
            .monitor_wallpapers
            .as_ref()
            .and_then(|map| {
                let clean = sanitize_monitor_id(&monitor_id);
                map.iter().find(|(mid, _)| sanitize_monitor_id(mid) == clean).map(|(_, e)| e.kind.clone())
            })
            .unwrap_or(crate::data::models::WallpaperKind::Video);

        if kind == crate::data::models::WallpaperKind::Interactive {
            // explicit webview and state cleanup for interactive wallpapers
            #[cfg(target_os = "windows")]
            {
                crate::platform::windows::interactive::state::clean_interactive_webview(&app, &monitor_id);
            }
        } else {
            #[cfg(target_os = "windows")]
            {
                use crate::platform::windows::engine::stop_wallpaper_on_monitor;
                let _ = stop_wallpaper_on_monitor(&monitor_id);
            }
        }

        let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
        if let Some(ref mut monitors) = state.active_monitors {
            monitors.retain(|m| sanitize_monitor_id(m) != sanitize_monitor_id(&monitor_id));
            if monitors.is_empty() {
                state.active_monitors = None;
            }
        }
        if let Some(ref mut map) = state.monitor_wallpapers {
            let target_key = map.keys()
                .find(|mid| sanitize_monitor_id(mid) == sanitize_monitor_id(&monitor_id))
                .cloned()
                .unwrap_or_else(|| monitor_id.clone());
            if let Some(entry) = map.get_mut(&target_key) {
                entry.enabled = false;
            }
            state.is_active = map.values().any(|e| e.enabled);
        }
        let _ = save_wallpaper_state(&state);
        drop(state);

        Ok(WallpaperResponse {
            success: true,
            message: Some(format!("wallpaper stopped on {}", monitor_id)),
            error: None,
        })
    } else {
        // start wallpaper on this monitor
        let state = state_snapshot;
        let primary_id = crate::core::ipc::resolve_primary_id();

        let mut entry_to_copy = entry_to_start;
        if entry_to_copy.is_none() {
            if let Some(map) = &state.monitor_wallpapers {
                if let Some(primary_entry) = map.get(&primary_id) {
                    entry_to_copy = Some(primary_entry.clone());
                } else if let Some(first_entry) = map.values().next() {
                    entry_to_copy = Some(first_entry.clone());
                }
            }
        }

        let (wallpaper_kind, wallpaper_path, orig_url, video_url) = match entry_to_copy {
            Some(e) => (e.kind, e.path, e.original_url, e.video_url),
            None => match state.video_path {
                Some(ref p) if !p.is_empty() => {
                    (
                    crate::data::models::WallpaperKind::Video,
                    p.clone(),
                    state.original_url.clone(),
                    state.video_url.clone(),
                )
                },
                _ => {
                    return Ok(WallpaperResponse {
                        success: false,
                        message: None,
                        error: Some("no wallpaper is currently set — set one first".to_string()),
                    });
                }
            },
        };

        #[cfg(target_os = "windows")]
        {
            if wallpaper_kind == crate::data::models::WallpaperKind::Interactive {
                // interactive wallpapers need the webview player, not the video sidecar
                match crate::platform::windows::interactive::player::start_interactive_wallpaper(
                    &app, &wallpaper_path, Some(&monitor_id),
                ) {
                    Ok(()) => {
                        // state is persisted inside start_interactive_wallpaper via save_interactive_to_state
                        Ok(WallpaperResponse {
                            success: true,
                            message: Some(format!("interactive wallpaper started on {}", monitor_id)),
                            error: None,
                        })
                    }
                    Err(e) => Ok(WallpaperResponse {
                        success: false,
                        message: None,
                        error: Some(format!("failed to start interactive wallpaper: {}", e)),
                    }),
                }
            } else {
                use crate::platform::windows::engine::create_wallpaper_on_monitor;
                match create_wallpaper_on_monitor(&app, &wallpaper_path, Some(&monitor_id)) {
                Ok(_) => {
                    // add this monitor to the active list and map
                    let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                    let monitors = state.active_monitors.get_or_insert_with(Vec::new);
                    if !monitors.contains(&monitor_id) {
                        monitors.push(monitor_id.clone());
                    }
                    let map = state
                        .monitor_wallpapers
                        .get_or_insert_with(std::collections::HashMap::new);
                    map.insert(
                        monitor_id.clone(),
                        MonitorWallpaperEntry {
                            kind: crate::data::models::WallpaperKind::Video,
                            path: wallpaper_path.clone(),
                            video_url: video_url.clone(),
                            original_url: orig_url.clone(),
                            enabled: true,
                        },
                    );

                    state.is_active = true;
                    let _ = save_wallpaper_state(&state);
                    drop(state);

                    Ok(WallpaperResponse {
                        success: true,
                        message: Some(format!("wallpaper started on {}", monitor_id)),
                        error: None,
                    })
                }
                Err(e) => Ok(WallpaperResponse {
                    success: false,
                    message: None,
                    error: Some(e),
                }),
            }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (app, wallpaper_path);
            Ok(WallpaperResponse {
                success: false,
                message: None,
                error: Some("not supported on this platform".to_string()),
            })
        }
    }
}

/// returns which monitor ids currently have active wallpaper players
#[tauri::command]
pub fn get_active_monitors() -> Vec<String> {
    crate::core::ipc::get_active_monitor_ids()
}
