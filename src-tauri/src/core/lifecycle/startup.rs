use crate::core::player::download::download_video;
use crate::core::player::manager::{
    create_video_wallpaper_window_internal, create_video_wallpaper_window_on_monitor,
};
use crate::core::player::state::{
    load_wallpaper_state, save_wallpaper_state, VIDEO_WALLPAPER_STATE,
};
use crate::models::MonitorWallpaperEntry;
use tauri::AppHandle;
pub async fn restore_wallpaper_on_startup(app: &AppHandle) -> Result<(), String> {
    println!("[startup] Attempting to restore wallpaper");
    
    let saved_state = match load_wallpaper_state() {
        Some(state) => {
                        state
        }
        None => {
            println!("[startup] No saved wallpaper state found");
                        return Ok(());
        }
    };

    if !saved_state.is_active {
        println!("[startup] Saved state indicates wallpaper is not active");
                return Ok(());
    }

    // try to restore from per-monitor state first
    if let Some(ref monitor_map) = saved_state.monitor_wallpapers {
        println!(
            "[startup] Restoring {} per-monitor wallpapers",
            monitor_map.len()
        );
        
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

        // clone the map to pass to the blocking thread
        let map_clone = monitor_map.clone();
        let app_clone = app.clone();
        let saved_state_clone = saved_state.clone();

        let result = tauri::async_runtime::spawn_blocking(move || {
            
            let mut last_result = Ok(());
            for (mid, entry) in &map_clone {
                if !std::path::Path::new(&entry.path).exists() {
                    println!(
                        "[startup] Skipped {}: path missing {}",
                        mid, entry.path
                    );
                    continue;
                }

                if !entry.enabled {
                    println!("[startup] Skipped {}: wallpaper is disabled via UI lock", mid);
                    continue;
                }

                match entry.kind {
                    crate::data::models::WallpaperKind::Video => {
                        println!(
                            "[startup] Restoring video on {}: {}",
                            mid, entry.path
                        );
                        last_result = create_video_wallpaper_window_on_monitor(
                            &app_clone,
                            &entry.path,
                            Some(mid),
                        );
                        if let Err(ref e) = last_result {
                            println!("[startup] Failed to restore video on {}: {}", mid, e);
                        }
                    }
                    crate::data::models::WallpaperKind::Interactive => {
                        println!(
                            "[startup] Restoring interactive on {}: {}",
                            mid, entry.path
                        );
                        #[cfg(target_os = "windows")]
                        {
                            use crate::platform::windows::interactive::player::start_interactive_wallpaper;
                            if let Err(e) = start_interactive_wallpaper(&app_clone, &entry.path, Some(mid)) {
                                println!("[startup] Failed to restore interactive on {}: {}", mid, e);
                            }
                        }
                    }
                }
            }
            last_result
        })
        .await
        .map_err(|e| {
            let err_msg = format!("Task join error: {}", e);
                        err_msg
        })?;

        match result {
            Ok(_) => {
                let title_to_use = saved_state_clone.original_url.as_ref()
                    .map(|u| u.split('/').next_back().unwrap_or("Live Wallpaper").split('?').next().unwrap_or("Live Wallpaper").to_string())
                    .unwrap_or_else(|| "Live Wallpaper".to_string());
                crate::core::discord_rpc::update_presence(title_to_use, true);

                let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                *state = saved_state_clone;
                state.is_active = true;
                let _ = save_wallpaper_state(&state);
                drop(state);

                println!("[startup] Wallpapers restored from per-monitor saved paths");
                return Ok(());
            }
            Err(e) => {
                println!(
                    "[startup] Failed to restore from per-monitor saved paths: {}",
                    e
                );
            }
        }
    }
    // fallback: try to restore from legacy single video path
    else if let Some(ref video_path) = saved_state.video_path {
        if std::path::Path::new(video_path).exists() {
            println!("[startup] Found video file at saved path: {}", video_path);
            
            // NON-BLOCKING DELAY
            tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

            let video_path_clone = video_path.clone();
            let app_clone = app.clone();

            // run blocking window creation on a separate thread
            // spawn on all saved monitors (or primary if none saved)
            let saved_monitors = saved_state.active_monitors.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                                match saved_monitors {
                    Some(ref monitors) if !monitors.is_empty() => {
                        println!(
                            "[startup] Restoring on {} monitor(s): {:?}",
                            monitors.len(),
                            monitors
                        );
                        let mut last_result = Ok(());
                        for mid in monitors {
                            println!("[startup] Restoring on monitor: {}", mid);
                            last_result = create_video_wallpaper_window_on_monitor(
                                &app_clone,
                                &video_path_clone,
                                Some(mid),
                            );
                            if let Err(ref e) = last_result {
                                println!("[startup] Failed to restore on {}: {}", mid, e);
                            }
                        }
                        last_result
                    }
                    _ => create_video_wallpaper_window_internal(&app_clone, &video_path_clone),
                }
            })
            .await
            .map_err(|e| {
                let err_msg = format!("Task join error: {}", e);
                                err_msg
            })?;

            match result {
                Ok(_) => {
                    // restore full state including original_url
                    let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                    *state = saved_state.clone();
                    state.is_active = true;
                    // also initialize the monitor map for the active monitors so future
                    // actions treat them as properly tracked per-monitor
                    let primary_id = crate::core::ipc::resolve_primary_id();
                    let mut map = std::collections::HashMap::new();
                    let entry = MonitorWallpaperEntry {
                        kind: crate::data::models::WallpaperKind::Video,
                        path: video_path.clone(),
                        video_url: state.video_url.clone(),
                        original_url: state.original_url.clone(),
                        enabled: true,
                    };
                    if let Some(ref monitors) = state.active_monitors {
                        for mid in monitors {
                            map.insert(mid.clone(), entry.clone());
                        }
                    } else {
                        map.insert(primary_id.clone(), entry.clone());
                        state.active_monitors = Some(vec![primary_id]);
                    }
                    state.monitor_wallpapers = Some(map);

                    let _ = save_wallpaper_state(&state);
                    drop(state);

                    let title_to_use = saved_state.original_url.as_ref()
                        .map(|u| u.split('/').next_back().unwrap_or("Live Wallpaper").split('?').next().unwrap_or("Live Wallpaper").to_string())
                        .unwrap_or_else(|| "Live Wallpaper".to_string());
                    crate::core::discord_rpc::update_presence(title_to_use, true);

                    println!("[startup] Wallpaper restored from saved path");
                                        return Ok(());
                }
                Err(e) => {
                    println!("[startup] Failed to restore from saved path: {}", e);
                                    }
            }
        } else {
            println!(
                "[startup] Video file not found at saved path: {}",
                video_path
            );
                    }
    }

    // if saved path doesn't work, try to re-download from original URL
    if let Some(ref original_url) = saved_state.original_url {
        println!(
            "[startup] Attempting to re-download from original URL: {}",
            original_url
        );
        
        // tokio runtime for async download
        let app_clone = app.clone();
        let url_clone: String = original_url.clone();

        // spawn async task for re-download
        tauri::async_runtime::spawn(async move {
            match download_video(&app_clone, &url_clone, None).await {
                Ok(new_video_path) => {
                    println!("[startup] Re-downloaded video to: {:?}", new_video_path);
                    
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;

                    let path_str = new_video_path.to_string_lossy().to_string();
                    let app_for_thread = app_clone.clone();

                    let result = tauri::async_runtime::spawn_blocking(move || {
                        create_video_wallpaper_window_internal(&app_for_thread, &path_str)
                    })
                    .await;

                    // Handle inner result
                    let inner_result = match result {
                        Ok(res) => res,
                        Err(e) => {
                            let err_msg = format!("Task join error: {}", e);
                                                        Err(err_msg)
                        }
                    };

                    match inner_result {
                        Ok(_) => {
                            // update state with new path
                            let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                            state.is_active = true;
                            state.video_path = Some(new_video_path.to_string_lossy().to_string());
                            state.video_url =
                                Some(format!("file://{}", new_video_path.to_string_lossy()));
                            // keep original_url and set_at
                            let _ = save_wallpaper_state(&state);
                            drop(state);

                            println!("[startup] Wallpaper restored from re-download");
                                                    }
                        Err(e) => {
                            eprintln!("[startup] Failed to set re-downloaded wallpaper: {}", e);
                            
                            let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                            state.is_active = false;
                            state.video_path = None;
                            state.video_url = None;
                            let _ = save_wallpaper_state(&state);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[startup] Failed to re-download video: {}", e);
                    
                    // clear state if re-download fails
                    let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
                    state.is_active = false;
                    state.video_path = None;
                    state.video_url = None;
                    let _ = save_wallpaper_state(&state);
                }
            }
        });

        // Return OK immediately, restoration happens in background
        return Ok(());
    }

    // if we get here, no valid path or URL to restore from, so clear state
    println!("[startup] No valid video path or original URL to restore from");
    
    let mut state = VIDEO_WALLPAPER_STATE.lock().unwrap();
    state.is_active = false;
    state.video_path = None;
    state.video_url = None;
    let _ = save_wallpaper_state(&state);
    Ok(())
}

