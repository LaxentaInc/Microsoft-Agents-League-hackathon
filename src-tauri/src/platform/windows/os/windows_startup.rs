/// Windows startup toggle using registry (CurrentUser\Run)
/// Based on Lively's WindowsStartup implementation
// use std::path::Path;
use winreg::enums::*;
use winreg::RegKey;

const APP_NAME: &str = "Colorwall";

/// Check if app is set to run at Windows startup
pub fn is_startup_enabled() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run") {
        Ok(key) => key.get_value::<String, _>(APP_NAME).is_ok(),
        Err(_) => false,
    }
}

/// enable or disable Windows startup
/// returns Ok(true) if operation succeeded, Ok(false) if registry couldn't be accessed
pub fn set_startup_enabled(enabled: bool) -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        )
        .map_err(|e| format!("Failed to open registry key: {}", e))?;

    if enabled {
        // get the current executable path
        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        // make sure the path exists and is valid
        if !exe_path.exists() {
            return Err("Executable path does not exist".to_string());
        }

        // format with quotes for paths with spaces, add --autostart flag to start minimized to tray
        let value = format!("\"{}\" --autostart", exe_path.display());

        key.set_value(APP_NAME, &value)
            .map_err(|e| format!("Failed to set registry value: {}", e))?;

        println!("[startup] Enabled Windows startup: {}", value);
    } else {
        // delete the value (ignore if it doesn't exist)
        match key.delete_value(APP_NAME) {
            Ok(_) => println!("[startup] Disabled Windows startup"),
            Err(e) => {
                // it's okay if the value doesn't exist
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!("Failed to delete registry value: {}", e));
                }
            }
        }
    }

    Ok(true)
}
