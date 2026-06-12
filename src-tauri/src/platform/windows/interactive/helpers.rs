// shared utility functions for interactive wallpaper subsystem
// extracted from player.rs to keep things modular and reusable

use windows::Win32::Foundation::HWND;

/// fix window appearance — disable rounded corners, remove border styles, kill shadow
/// used by both interactive player and widget host to get a clean borderless window
pub fn fix_window_appearance(window: &tauri::WebviewWindow) -> Result<(), String> {
    let raw_hwnd = window
        .hwnd()
        .map_err(|e| format!("failed to get hwnd: {}", e))?
        .0;
    let hwnd = HWND(raw_hwnd as _);

    unsafe {
        // disable rounded corners (windows 11)
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
        };
        let preference = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &preference as *const _ as *const _,
            std::mem::size_of::<u32>() as u32,
        );

        // remove extended window styles that cause white borders
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_CLIENTEDGE,
            WS_EX_DLGMODALFRAME, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE,
        };
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let cleaned = ex_style
            & !(WS_EX_CLIENTEDGE.0 as isize)
            & !(WS_EX_DLGMODALFRAME.0 as isize)
            & !(WS_EX_STATICEDGE.0 as isize)
            & !(WS_EX_WINDOWEDGE.0 as isize);
        if cleaned != ex_style {
            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, cleaned);
        }

        // force repaint without border artifacts
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        };
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
        );
    }
    let _ = window.set_shadow(false);

    println!("[helpers] window appearance fixed (no corners, no borders, no shadow)");
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "window appearance modified to borderless");
    Ok(())
}

/// get monitor bounds for positioning a fullscreen wallpaper/overlay window
/// returns (x, y, width, height) using the virtual screen dimensions
pub fn get_monitor_bounds(monitor_id: &str) -> (i32, i32, i32, i32) {
    if let Some(bounds) = crate::platform::windows::os::monitors::get_bounds_for_monitor(monitor_id) {
        println!(
            "[helpers] monitor {} bounds resolved via os/monitors: ({},{}) {}x{}",
            monitor_id, bounds.x, bounds.y, bounds.width, bounds.height
        );
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(monitor_id, &format!("monitor bounds fetched via os/monitors: ({},{}) {}x{}", bounds.x, bounds.y, bounds.width, bounds.height));
        return (bounds.x, bounds.y, bounds.width, bounds.height);
    }

    // fallback to virtual screen if specific monitor not found
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        println!(
            "[helpers] monitor {} not found, using virtual screen bounds: ({},{}) {}x{}",
            monitor_id, x, y, w, h
        );
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(monitor_id, &format!("monitor not found, using virtual screen bounds: ({},{}) {}x{}", x, y, w, h));
        (x, y, w, h)
    }
}

/// recursively copy a directory tree
pub fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}
