// process manager for wallpaper-player sidecar
// manages one player process per monitor for multi-display support
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

lazy_static::lazy_static! {
    /// keyed by monitor id (e.g. "DISPLAY1", "DISPLAY2")
    pub static ref PLAYER_PROCESSES: Arc<Mutex<HashMap<String, Child>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// sanitize monitor id for use in pipe names and log files
/// "\\.\DISPLAY1" -> "DISPLAY1"
pub fn sanitize_monitor_id(raw: &str) -> String {
    raw.replace(r"\\.\", "")
        .replace(r"\\", "")
        .replace(r"\", "")
        .replace(".", "")
}

/// get the path to the wallpaper-player executable
/// downloads it from the github release if not found locally
fn get_player_binary_path(_app: &AppHandle) -> Result<std::path::PathBuf, String> {
    crate::core::plugins::ensure_plugin_binary("wallpaper-player.exe")
}


#[allow(clippy::too_many_arguments)]
pub fn spawn_player(
    app: &AppHandle,
    video_path: &str,
    backend: &str,
    mpv_path: Option<&str>,
    mpv_preset: &str,
    audio_enabled: bool,
    paused: bool,
    pause_on_fullscreen: bool,
    monitor_id: &str,
) -> Result<(), String> {
    // resolve empty monitor_id to the primary display name
    // this way the backend always knows which physical display the player is on
    let resolved_id = if monitor_id.is_empty() {
        resolve_primary_monitor_id()
    } else {
        monitor_id.to_string()
    };
    let clean_id = sanitize_monitor_id(&resolved_id);

    println!(
        "[process_manager] monitor_id='{}' -> resolved='{}' -> clean='{}'",
        monitor_id, resolved_id, clean_id
    );

    
    // only stop the existing player on THIS monitor, not others
    println!(
        "[process_manager] stopping existing player on {} before respawn",
        clean_id
    );
    stop_player_for_monitor(&clean_id)?;

    let player_path = get_player_binary_path(app)?;

    println!(
        "[process_manager] Spawning player for monitor {} : {:?}",
        clean_id, player_path
    );

    let mut cmd = Command::new(&player_path);
    cmd.args([
        video_path,
        backend,
        mpv_path.unwrap_or(""),
        if audio_enabled { "1" } else { "0" },
        if paused { "1" } else { "0" },
        if pause_on_fullscreen { "1" } else { "0" },
        &resolved_id, // pass resolved monitor id so player can look up its own bounds
        mpv_preset,
    ]);

    // redirect player stdout/stderr to a log file on the desktop
    // in prod builds there's no console, so println! output goes nowhere without this
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let log_name = format!("wallpaper-player-{}-log.txt", clean_id);
        let log_path = std::path::PathBuf::from(&profile)
            .join("Desktop")
            .join(&log_name);
        match std::fs::File::create(&log_path) {
            Ok(file) => {
                println!("[process_manager] player log file: {}", log_path.display());
                if let Ok(err_file) = file.try_clone() {
                    cmd.stdout(file);
                    cmd.stderr(err_file);
                }
            }
            Err(e) => {
                println!("[process_manager] couldn't create log file: {}", e);
            }
        }
    }

    let child = cmd.spawn().map_err(|e| {
        let err = format!(
            "Failed to spawn player process: {}. Path: {:?}",
            e, player_path
        );
                err
    })?;

    let pid = child.id();
    println!(
        "[process_manager] Player for {} spawned with PID: {}",
        clean_id, pid
    );

    


    PLAYER_PROCESSES.lock().unwrap().insert(clean_id, child);

    Ok(())
}

/// stop the player on a specific monitor
pub fn stop_player_for_monitor(monitor_id: &str) -> Result<(), String> {
    let clean_id = sanitize_monitor_id(monitor_id);
    let mut players = PLAYER_PROCESSES.lock().unwrap();

    println!(
        "[process_manager] stop_player_for_monitor called for '{}' (clean: '{}') | tracked_players: {:?}",
        monitor_id,
        clean_id,
        players.keys().collect::<Vec<_>>()
    );

    if let Some(mut child) = players.remove(&clean_id) {
        let pid = child.id();
        println!(
            "[process_manager] found player for {} (PID: {}), sending STOP via ipc",
            clean_id, pid
        );
        
        // gracefully ask the player to stop via IPC before brutally terminating
        // this allows it to drop D3D resources and un-inject safely without GPU driver hiccups
        let pipe_name = format!("{}_{}", obfstr::obfstr!(r"\\.\pipe\colorwall_player"), clean_id);
        if let Ok(mut file) = std::fs::OpenOptions::new().write(true).open(&pipe_name) {
            use std::io::Write;
            let _ = file.write_all(format!("{}\n", obfstr::obfstr!("STOP")).as_bytes());
            // wait up to 1 second for graceful exit
            for _ in 0..10 {
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }

        let _ = child.kill();
        std::thread::sleep(std::time::Duration::from_millis(200));
        println!("[process_manager] player for {} stopped and cleaned up", clean_id);
    } else {
        println!("[process_manager] no active player found for '{}', nothing to stop", clean_id);
    }

    Ok(())
}

/// stop ALL player processes (used on quit/shutdown)
pub fn stop_all_players() -> Result<(), String> {
    let mut players = PLAYER_PROCESSES.lock().unwrap();

    for (monitor_id, mut child) in players.drain() {
        let pid = child.id();
        println!(
            "[process_manager] Stopping player for {} (PID: {})",
            monitor_id, pid
        );
        
        let pipe_name = format!("{}_{}", obfstr::obfstr!(r"\\.\pipe\colorwall_player"), monitor_id);
        if let Ok(mut file) = std::fs::OpenOptions::new().write(true).open(&pipe_name) {
            use std::io::Write;
            let _ = file.write_all(format!("{}\n", obfstr::obfstr!("STOP")).as_bytes());
            for _ in 0..10 {
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }

        let _ = child.kill();
    }

    std::thread::sleep(std::time::Duration::from_millis(200));

    println!("[process_manager] All players stopped");

    Ok(())
}

/// legacy compat - stop all players (called by existing stop_player callsites)
pub fn stop_player() -> Result<(), String> {
    stop_all_players()
}

/// get list of monitor IDs that have active players
pub fn get_active_monitor_ids() -> Vec<String> {
    let mut players = PLAYER_PROCESSES.lock().unwrap();
    // clean up dead processes while we're at it
    players.retain(|id, child| match child.try_wait() {
        Ok(Some(_)) => {
            println!("[process_manager] player for {} has exited", id);
            false
        }
        _ => true,
    });
    players.keys().cloned().collect()
}

/// check if a specific monitor has an active player
pub fn is_monitor_active(monitor_id: &str) -> bool {
    let clean_id = sanitize_monitor_id(monitor_id);
    let mut players = PLAYER_PROCESSES.lock().unwrap();
    if let Some(child) = players.get_mut(&clean_id) {
        match child.try_wait() {
            Ok(Some(_)) => {
                players.remove(&clean_id);
                false
            }
            _ => true,
        }
    } else {
        false
    }
}

/// resolve the primary monitor's display name for when no monitor_id is specified
/// returns something like "\\.\DISPLAY1"
fn resolve_primary_monitor_id() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::mem;
        use windows::Win32::Foundation::{LPARAM, RECT};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
        };
        use windows_core::BOOL;

        struct PrimaryFinder {
            name: Option<String>,
        }

        unsafe extern "system" fn cb(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let finder = &mut *(lparam.0 as *mut PrimaryFinder);
            if finder.name.is_some() {
                return BOOL(1); // already found
            }

            let mut info: MONITORINFOEXW = mem::zeroed();
            info.monitorInfo.cbSize = mem::size_of::<MONITORINFOEXW>() as u32;

            if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _).as_bool() {
                let is_primary = (info.monitorInfo.dwFlags & 1) != 0;
                if is_primary {
                    let name = String::from_utf16_lossy(
                        &info.szDevice[..info.szDevice.iter().position(|&c| c == 0).unwrap_or(32)],
                    );
                    finder.name = Some(name);
                }
            }
            BOOL(1)
        }

        let mut finder = PrimaryFinder { name: None };
        unsafe {
            let _ = EnumDisplayMonitors(
                None,
                None,
                Some(cb),
                LPARAM(&mut finder as *mut PrimaryFinder as isize),
            );
        }

        if let Some(name) = finder.name {
            println!("[process_manager] resolved primary monitor: {}", name);
            return name;
        }
    }

    // fallback
    println!("[process_manager] couldn't resolve primary monitor, defaulting to DISPLAY1");
    r"\\.\DISPLAY1".to_string()
}

/// public wrapper for other modules to resolve the primary monitor id
pub fn resolve_primary_id() -> String {
    resolve_primary_monitor_id()
}
