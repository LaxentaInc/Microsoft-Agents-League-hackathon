// renderer watchdog. monitors wallpaper-player child processes and auto-restarts
// them if they crash unexpectedly. runs on a background thread inside the main
// tauri process so it has direct access to PLAYER_PROCESSES and VIDEO_WALLPAPER_STATE.

use crate::core::ipc::{sanitize_monitor_id, spawn_player, PLAYER_PROCESSES};
use crate::core::player::state::VIDEO_WALLPAPER_STATE;
use crate::data::models::AppSettings;
use crate::data::storage::get_settings_file;
use std::collections::HashMap;
use tauri::AppHandle;
const MAX_CRASH_RETRIES: u32 = 5;
const STABILITY_THRESHOLD_SECS: u64 = 30;
const POLL_INTERVAL_SECS: u64 = 3;

struct MonitorCrashInfo {
    count: u32,
    last_respawn: std::time::Instant,
}

pub fn start_renderer_watchdog(app: AppHandle) {
    std::thread::spawn(move || {
        println!("[watchdog] renderer watchdog started");

        // per-monitor crash counters (keyed by sanitized monitor id)
        let mut crash_info: HashMap<String, MonitorCrashInfo> = HashMap::new();

        loop {
            std::thread::sleep(std::time::Duration::from_secs(POLL_INTERVAL_SECS));

            // check if wallpaper is supposed to be active
            let state = VIDEO_WALLPAPER_STATE.lock().unwrap().clone();
            if !state.is_active {
                crash_info.clear();
                continue;
            }

            let monitor_wallpapers = match &state.monitor_wallpapers {
                Some(mw) if !mw.is_empty() => mw.clone(),
                _ => continue,
            };

            // check each expected monitor for a dead player
            // important: state stores raw ids like "\\.\DISPLAY1" but PLAYER_PROCESSES
            // stores sanitized ids like "DISPLAY1". we must sanitize before lookup.
            let mut dead_monitors: Vec<(String, String)> = Vec::new();

            {
                let mut players = PLAYER_PROCESSES.lock().unwrap();

                for (raw_monitor_id, entry) in &monitor_wallpapers {
                    let clean_id = sanitize_monitor_id(raw_monitor_id);

                    if let Some(info) = crash_info.get(&clean_id) {
                        if info.count >= MAX_CRASH_RETRIES {
                            continue;
                        }
                    }

                    if let Some(child) = players.get_mut(&clean_id) {
                        match child.try_wait() {
                            Ok(Some(exit_status)) => {
                                println!(
                                    "[watchdog] player on {} exited with status: {:?}",
                                    clean_id, exit_status
                                );
                                players.remove(&clean_id);
                                dead_monitors.push((clean_id.clone(), entry.path.clone()));
                            }
                            Ok(None) => {
                                if let Some(info) = crash_info.get_mut(&clean_id) {
                                    if info.last_respawn.elapsed().as_secs()
                                        >= STABILITY_THRESHOLD_SECS
                                        && info.count > 0
                                    {
                                        println!(
                                            "[watchdog] player on {} stable for {}s, resetting crash counter",
                                            clean_id, STABILITY_THRESHOLD_SECS
                                        );
                                        info.count = 0;
                                    }
                                }
                            }
                            Err(e) => {
                                println!(
                                    "[watchdog] try_wait error on {}: {}, treating as dead",
                                    clean_id, e
                                );
                                players.remove(&clean_id);
                                dead_monitors.push((clean_id.clone(), entry.path.clone()));
                            }
                        }
                    }
                    // note: if there's no entry in PLAYER_PROCESSES at all, we do NOT
                    // treat it as a crash. this happens during startup before restoration,
                    // and we don't want false positives. the watchdog only acts on processes
                    // that it *saw* die via try_wait().
                }
            } // drop PLAYER_PROCESSES lock before respawning

            // respawn dead players
            for (clean_id, video_path) in dead_monitors {
                let info = crash_info
                    .entry(clean_id.clone())
                    .or_insert(MonitorCrashInfo {
                        count: 0,
                        last_respawn: std::time::Instant::now(),
                    });

                info.count += 1;

                if info.count > MAX_CRASH_RETRIES {
                    println!(
                        "[watchdog] player on {} crashed {} times in a row, giving up",
                        clean_id, info.count
                    );
                    continue;
                }

                println!(
                    "[watchdog] respawning player on {} (attempt {}/{})",
                    clean_id, info.count, MAX_CRASH_RETRIES
                );

                // load current settings for backend type, mpv path, etc.
                let (backend, mpv_path, mpv_preset, audio_enabled, paused, pause_on_fullscreen) =
                    load_player_settings();

                match spawn_player(
                    &app,
                    &video_path,
                    &backend,
                    mpv_path.as_deref(),
                    &mpv_preset,
                    audio_enabled,
                    paused,
                    pause_on_fullscreen,
                    &clean_id,
                ) {
                    Ok(_) => {
                        println!("[watchdog] successfully respawned player on {}", clean_id);
                        info.last_respawn = std::time::Instant::now();
                    }
                    Err(e) => {
                        println!("[watchdog] failed to respawn player on {}: {}", clean_id, e);
                    }
                }

                // small delay between respawns to avoid hammering the system
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
    });
}

/// load player settings (same logic as engine.rs)
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
                            !settings.live_wallpaper_enabled,
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

