
use crate::data::models::*;
use crate::data::storage::get_settings_file;

#[tauri::command]
pub async fn get_settings() -> Result<SettingsResponse, String> {
    let settings_file = get_settings_file()?;

    if !settings_file.exists() {
        let default_settings = AppSettings {
            audio_enabled: false,
            live_wallpaper_enabled: true,
            video_player: "wmf".to_string(),
            mpv_path: None,
            mpv_preset: "Performance".to_string(),

            discord_rpc_enabled: true,
            discord_custom_status: None,
            discord_custom_details: None,
            display_name: None,
            taskbar_effect: "Default".to_string(),
            taskbar_opacity: 0.5,
            taskbar_color: "#000000".to_string(),
            window_vibrancy: false,
            pause_on_fullscreen: true,
            perf_mode: false,
            perf_blur_enabled: true,
            perf_animations_enabled: true,
            perf_homepage_video_enabled: true,
            perf_shadows_enabled: true,
        };
        return Ok(SettingsResponse {
            success: true,
            settings: Some(default_settings),
            error: None,
        });
    }

    match std::fs::read_to_string(&settings_file) {
        Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
            Ok(settings) => Ok(SettingsResponse {
                success: true,
                settings: Some(settings),
                error: None,
            }),
            Err(e) => Ok(SettingsResponse {
                success: false,
                settings: None,
                error: Some(format!("failed to parse settings: {}", e)),
            }),
        },
        Err(e) => Ok(SettingsResponse {
            success: false,
            settings: None,
            error: Some(format!("failed to read settings: {}", e)),
        }),
    }
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<SettingsResponse, String> {
    let settings_file = get_settings_file()?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("failed to serialize settings: {}", e))?;

    std::fs::write(&settings_file, json).map_err(|e| format!("failed to write settings: {}", e))?;

    // apply discord rpc preferences immediately
    crate::core::discord_rpc::apply_settings(
        settings.discord_rpc_enabled,
        settings.discord_custom_status.clone(),
        settings.discord_custom_details.clone(),
    );
    // apply taskbar settings
    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows::os::taskbar::{set_taskbar_effect, TaskbarEffect};

        let effect = match settings.taskbar_effect.as_str() {
            "Transparent" => TaskbarEffect::Transparent,
            "Blur" => TaskbarEffect::Blur,
            "Acrylic" => TaskbarEffect::Acrylic,
            _ => TaskbarEffect::Default,
        };

        let color_hex = u32::from_str_radix(settings.taskbar_color.trim_start_matches('#'), 16)
            .unwrap_or(0x000000);

        if let Err(e) = set_taskbar_effect(effect, settings.taskbar_opacity, color_hex) {
            println!("[settings_ops] Failed to set taskbar effect: {}", e);
        }
    }

    // apply live changes to running player via IPC
    use crate::core::ipc::{is_player_pipe_available, send_command, PlayerCommand};

    // only attempt IPC if pipe exists
    // this avoids 500ms timeout delay if player is not running
    if is_player_pipe_available() {
        println!("[settings_ops] Sending live updates to player...");

        // 1st-> update audio
        let _ = send_command(PlayerCommand::SetAudio(settings.audio_enabled))
            .map_err(|e| println!("[settings_ops] Failed to set audio: {}", e));

        // update playback state
        if settings.live_wallpaper_enabled {
            let _ = send_command(PlayerCommand::Resume)
                .map_err(|e| println!("[settings_ops] Failed to resume: {}", e));
        } else {
            let _ = send_command(PlayerCommand::Pause)
                .map_err(|e| println!("[settings_ops] Failed to pause: {}", e));
        }
    }

    Ok(SettingsResponse {
        success: true,
        settings: Some(settings),
        error: None,
    })
}
/// BRUH THIS IS UNUSED, we will see what to do with it, cz currently our front end does the verification
#[tauri::command]
pub async fn validate_mpv_path(path: String) -> Result<String, String> {
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    let file_name = path_buf.file_name().and_then(|n| n.to_str()).unwrap_or("");

    // .exe
    #[cfg(target_os = "windows")]
    {
        if !file_name.to_lowercase().ends_with(".exe") {
            return Err("Not an executable file (.exe)".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix, check if file has executable permissions
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&path_buf)
            .map_err(|e| format!("Cannot read file metadata: {}", e))?;

        if metadata.permissions().mode() & 0o111 == 0 {
            return Err("File is not executable (missing execute permissions)".to_string());
        }
    }

    // FIRST CHECK Does filename contain mpv?
    if !file_name.to_lowercase().contains("mpv") {
        return Err(format!(
            "Please select an MPV executable. Selected: '{}'",
            file_name
        ));
    }

    // SECOND CHECK esp for linux and full verification. It Run --version to verify it's actually MPV
    let mut cmd = Command::new(&path);
    cmd.arg("--version");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to execute: {}", e))?;

    let child_id = child.id();
    let timeout = Duration::from_secs(2);
    let start = std::time::Instant::now();

    let output = loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // finished naturally
                break child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to get output: {}", e))?;
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    // KILL IT
                    let _ = child.kill();
                    let _ = child.wait();

                    // Kill the whole process tree (platform-specific)
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;

                        let _ = Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &child_id.to_string()])
                            .creation_flags(0x08000000)
                            .output();
                    }

                    #[cfg(not(target_os = "windows"))]
                    {
                        // On Unix, send SIGKILL to process group
                        let _ = Command::new("kill")
                            .args(&["-9", &child_id.to_string()])
                            .output();
                    }

                    return Err(
                        "Executable took too long to respond (real MPV responds instantly)"
                            .to_string(),
                    );
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Error running executable: {}", e));
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout, stderr);

    if stdout.to_lowercase().contains("mpv") || stderr.to_lowercase().contains("mpv") {
        Ok(format!(
            "✓ Valid MPV executable verified!\n{}",
            combined.trim()
        ))
    } else {
        Err(format!(
            "File is named '{}' but --version output doesn't confirm it's MPV:\n{}",
            file_name, combined
        ))
    }
}

// Windows Startup Toggle Commands
#[tauri::command]
pub async fn get_startup_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows::os::windows_startup;
        Ok(windows_startup::is_startup_enabled())
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Non-Windows: startup not supported yet
        Ok(false)
    }
}

#[tauri::command]
pub async fn set_startup_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::platform::windows::os::windows_startup;
        windows_startup::set_startup_enabled(enabled)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Startup toggle not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn get_username() -> Result<String, String> {
    // Check for custom display name in settings first
    let settings_file = get_settings_file()?;

    if settings_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&settings_file) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                if let Some(display_name) = settings.display_name {
                    if !display_name.trim().is_empty() {
                        return Ok(display_name);
                    }
                }
            }
        }
    }

    // Fallback to system username
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .map_err(|_| "Unable to get username".to_string())
}

#[tauri::command]
pub async fn set_discord_rpc_window_focus(focused: bool) -> Result<bool, String> {
    crate::core::discord_rpc::set_window_focus(focused);
    Ok(true)
}
