use tauri::{AppHandle, Manager, WebviewWindow};

/// Apply or remove window vibrancy effect (Mica on Win11, Acrylic on Win10)
#[tauri::command]
pub fn set_window_vibrancy(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or("Could not find main window")?;

        if enabled {
            apply_vibrancy_effect(&window)?;
        } else {
            clear_vibrancy_effect(&window)?;
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, enabled);
        println!("[vibrancy] Window vibrancy is only supported on Windows");
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn apply_vibrancy_effect(window: &WebviewWindow) -> Result<(), String> {
    use window_vibrancy::{apply_acrylic, apply_mica};

    // Try Mica first (Windows 11), fall back to Acrylic (Windows 10)
    match apply_mica(window, Some(true)) {
        Ok(_) => {
            println!("[vibrancy] Mica effect applied successfully");
        }
        Err(_) => {
            // Mica failed (probably Win10), try Acrylic
            // Tint: (R, G, B, Alpha) - black tint with higher opacity to prevent "light" wash
            apply_acrylic(window, Some((0, 0, 0, 100)))
                .map_err(|e| format!("Failed to apply acrylic: {:?}", e))?;
            println!("[vibrancy] Acrylic effect applied (Mica not supported)");
        }
    }
    let _ = apply_rounded_corners(window);

    // disable native shadows
    let _ = window.set_shadow(false);

    Ok(())
}

#[cfg(target_os = "windows")]
fn clear_vibrancy_effect(window: &WebviewWindow) -> Result<(), String> {
    use window_vibrancy::{clear_acrylic, clear_mica};

    let _ = clear_mica(window);
    let _ = clear_acrylic(window);

    println!("[vibrancy] Window vibrancy cleared");
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_rounded_corners(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    let hwnd = HWND(hwnd as _);

    unsafe {
        let preference = DWMWCP_ROUND; // 2 = Round, 3 = Small Round
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );
    }

    Ok(())
}
