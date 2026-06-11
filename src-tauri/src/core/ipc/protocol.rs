// ipc for wallpaper-player control
// windows named pipes for bidirectional communication
use std::io::Write;
use obfstr::obfstr;

pub fn get_pipe_name() -> String {
    obfstr!(r"\\.\pipe\colorwall_player").to_string()
}

/// get pipe name for a specific monitor
pub fn pipe_name_for_monitor(monitor_id: &str) -> String {
    let clean = super::sanitize_monitor_id(monitor_id);
    format!(r"{}_{}", get_pipe_name(), clean)
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlayerCommand {
    Pause,
    Resume,
    SetAudio(bool),
    SetPauseOnFullscreen(bool),
    Stop,
}

#[allow(clippy::inherent_to_string)]
#[allow(clippy::should_implement_trait)]
impl PlayerCommand {
    pub fn to_string(&self) -> String {
        match self {
            PlayerCommand::Pause => obfstr!("PAUSE").to_string(),
            PlayerCommand::Resume => obfstr!("RESUME").to_string(),
            PlayerCommand::SetAudio(enabled) => {
                format!("{}:{}", obfstr!("AUDIO"), if *enabled { "1" } else { "0" })
            }
            PlayerCommand::SetPauseOnFullscreen(enabled) => {
                format!("{}:{}", obfstr!("AUTO_PAUSE"), if *enabled { "1" } else { "0" })
            }
            PlayerCommand::Stop => obfstr!("STOP").to_string(),
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        let s = s.trim();
        if s == obfstr!("PAUSE") {
            Some(PlayerCommand::Pause)
        } else if s == obfstr!("RESUME") {
            Some(PlayerCommand::Resume)
        } else if s.starts_with(obfstr!("AUDIO:")) {
            let val = s.strip_prefix(obfstr!("AUDIO:"))?;
            Some(PlayerCommand::SetAudio(val == "1"))
        } else if s.starts_with(obfstr!("AUTO_PAUSE:")) {
            let val = s.strip_prefix(obfstr!("AUTO_PAUSE:"))?;
            Some(PlayerCommand::SetPauseOnFullscreen(val == "1"))
        } else if s == obfstr!("STOP") {
            Some(PlayerCommand::Stop)
        } else {
            None
        }
    }
}

/// send a command to a specific monitor's player via named pipe
#[cfg(target_os = "windows")]
pub fn send_command_to_pipe(pipe: &str, cmd: PlayerCommand) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::time::Duration;

    for attempt in 0..5 {
        match OpenOptions::new().read(true).write(true).open(pipe) {
            Ok(mut pipe_handle) => {
                let msg = format!("{}\n", cmd.to_string());
                pipe_handle
                    .write_all(msg.as_bytes())
                    .map_err(|e| format!("Failed to write to pipe: {}", e))?;
                pipe_handle
                    .flush()
                    .map_err(|e| format!("Failed to flush pipe: {}", e))?;
                return Ok(());
            }
            Err(e) => {
                // if the pipe doesn't exist at all, the player isn't running on this monitor.
                // fail fast to avoid 500ms delay and console spam.
                if e.kind() == std::io::ErrorKind::NotFound {
                    return Err(format!("Player pipe not found: {}", pipe));
                }

                if attempt < 4 {
                    std::thread::sleep(Duration::from_millis(100));
                } else {
                    return Err(format!("Failed to connect to pipe {}: {}", pipe, e));
                }
            }
        }
    }
    Err("Failed to send command after retries".to_string())
}

/// send a command to a specific monitor's player
#[cfg(target_os = "windows")]
pub fn send_command_to_monitor(monitor_id: &str, cmd: PlayerCommand) -> Result<(), String> {
    let pipe = pipe_name_for_monitor(monitor_id);
    println!(
        "[ipc] Sending {:?} to monitor {} (pipe: {})",
        cmd, monitor_id, pipe
    );
    send_command_to_pipe(&pipe, cmd)
}

/// send a command to ALL active player processes (legacy compat + broadcast)
#[cfg(target_os = "windows")]
pub fn send_command(cmd: PlayerCommand) -> Result<(), String> {
    let active = super::get_active_monitor_ids();
    println!(
        "[ipc] Broadcasting {:?} to {} active player(s)",
        cmd,
        active.len()
    );

    if active.is_empty() {
        // fallback: try the legacy pipe name
        return send_command_to_pipe(&get_pipe_name(), cmd);
    }

    let mut last_err = None;
    for monitor_id in &active {
        let pipe = format!(r"{}_{}", get_pipe_name(), monitor_id);
        if let Err(e) = send_command_to_pipe(&pipe, cmd) {
            // suppress log spam if it's just a missing pipe
            if !e.contains("not found") {
                println!("[ipc] failed to send to {}: {}", monitor_id, e);
            }
            last_err = Some(e);
        }
    }

    if let Some(e) = last_err {
        // only error if ALL failed
        if active.len() == 1 {
            return Err(e);
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn send_command(_cmd: PlayerCommand) -> Result<(), String> {
    Err("IPC not supported on this platform".to_string())
}
// health check - try to open any player pipe
#[cfg(target_os = "windows")]
pub fn is_player_pipe_available() -> bool {
    use std::fs::OpenOptions;
    // check if any monitor's pipe is available
    let active = super::get_active_monitor_ids();
    for monitor_id in &active {
        let pipe = format!(r"{}_{}", get_pipe_name(), monitor_id);
        if OpenOptions::new()
            .read(true)
            .write(true)
            .open(&pipe)
            .is_ok()
        {
            return true;
        }
    }
    // fallback: check legacy pipe
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(get_pipe_name())
        .is_ok()
}

#[cfg(not(target_os = "windows"))]
pub fn is_player_pipe_available() -> bool {
    false
}
