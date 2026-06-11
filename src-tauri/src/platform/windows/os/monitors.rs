use std::mem;
use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};
use windows_core::BOOL;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MonitorInfo {
    pub rect: RECT,
    pub work_rect: RECT,
    pub dpi_x: u32,
    pub dpi_y: u32,
    pub is_primary: bool,
    pub name: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub monitors: Vec<MonitorInfo>,
}

/// Returns primary monitor bounds for "default wallpaper target" mode.
///
/// This intentionally does NOT return the full virtual desktop span because
/// stretching one player across all monitors causes black bars/distortion.
/// We only use virtual desktop metrics as a fallback when monitor enumeration
/// fails (rare).
pub fn get_primary_monitor_bounds_or_virtual_fallback() -> ScreenBounds {
    let monitors = enumerate_monitors();

    if monitors.is_empty() {
        println!("[monitors] No monitors found, falling back to virtual screen");
        return get_virtual_desktop_bounds_fallback();
    }

    // use primary monitor only - avoids black bars on multi-monitor setups
    if let Some(primary) = monitors.iter().find(|m| m.is_primary) {
        let r = &primary.rect;
        let w = r.right - r.left;
        let h = r.bottom - r.top;
        println!(
            "[monitors] targeting display: {} (primary) {}x{} at ({}, {}) DPI:{}",
            primary.name, w, h, r.left, r.top, primary.dpi_x
        );
        // log all other monitors so we know what's connected
        for (i, m) in monitors.iter().enumerate() {
            let mr = &m.rect;
            println!(
                "[monitors]   display {}: {} {}x{} at ({},{}) {}",
                i + 1,
                m.name,
                mr.right - mr.left,
                mr.bottom - mr.top,
                mr.left,
                mr.top,
                if m.is_primary {
                    "<-- WALLPAPER HERE"
                } else {
                    ""
                }
            );
        }
        return ScreenBounds {
            x: r.left,
            y: r.top,
            width: w,
            height: h,
            monitors,
        };
    }

    // no primary flag found (shouldn't happen) — fall back to full virtual screen
    println!("[monitors] no primary monitor found, falling back to virtual screen");
    get_virtual_desktop_bounds_fallback()
}

fn enumerate_monitors() -> Vec<MonitorInfo> {
    let mut monitors: Vec<MonitorInfo> = Vec::new();
    let monitors_ptr = &mut monitors as *mut Vec<MonitorInfo>;

    unsafe {
        // Per Microsoft docs: NULL hdc + NULL lprcClip = enumerate ALL display monitors
        let _ = EnumDisplayMonitors(
            None, // NULL = enumerate all monitors
            None, // No clipping rect
            Some(monitor_enum_callback),
            LPARAM(monitors_ptr as isize),
        );
    }

    println!("[monitors] Found {} monitor(s)", monitors.len());
    for (i, m) in monitors.iter().enumerate() {
        println!(
            "[monitors]   #{}: {} {}x{} @ ({},{}) DPI:{}",
            i,
            m.name,
            m.rect.right - m.rect.left,
            m.rect.bottom - m.rect.top,
            m.rect.left,
            m.rect.top,
            m.dpi_x
        );
    }

    monitors
}

unsafe extern "system" fn monitor_enum_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let monitors = &mut *(lparam.0 as *mut Vec<MonitorInfo>);

    let mut info: MONITORINFOEXW = mem::zeroed();
    info.monitorInfo.cbSize = mem::size_of::<MONITORINFOEXW>() as u32;

    if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _).as_bool() {
        let name = String::from_utf16_lossy(
            &info.szDevice[..info.szDevice.iter().position(|&c| c == 0).unwrap_or(32)],
        );

        let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
        let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);

        monitors.push(MonitorInfo {
            rect: info.monitorInfo.rcMonitor,
            work_rect: info.monitorInfo.rcWork,
            dpi_x,
            dpi_y,
            is_primary: (info.monitorInfo.dwFlags & 1) != 0, // MONITORINFOF_PRIMARY
            name,
        });
    }

    BOOL(1) // Continue enumeration
}

fn get_virtual_desktop_bounds_fallback() -> ScreenBounds {
    unsafe {
        ScreenBounds {
            x: GetSystemMetrics(SM_XVIRTUALSCREEN),
            y: GetSystemMetrics(SM_YVIRTUALSCREEN),
            width: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            height: GetSystemMetrics(SM_CYVIRTUALSCREEN),
            monitors: Vec::new(),
        }
    }
}

#[allow(dead_code)]
pub fn get_primary_monitor() -> Option<MonitorInfo> {
    enumerate_monitors().into_iter().find(|m| m.is_primary)
}

#[allow(dead_code)]
pub fn is_multi_monitor() -> bool {
    enumerate_monitors().len() > 1
}

/// look up a specific monitor by its display name and return its bounds
/// monitor_name can be raw like "\\.\DISPLAY1" or sanitized like "DISPLAY1"
pub fn get_bounds_for_monitor(monitor_name: &str) -> Option<ScreenBounds> {
    let monitors = enumerate_monitors();

    // try exact match first, then partial match
    let target = monitors
        .iter()
        .find(|m| m.name == monitor_name || m.name.ends_with(monitor_name));

    if let Some(m) = target {
        let r = &m.rect;
        let w = r.right - r.left;
        let h = r.bottom - r.top;
        println!(
            "[monitors] found target monitor: {} {}x{} at ({},{}) primary={}",
            m.name, w, h, r.left, r.top, m.is_primary
        );
        Some(ScreenBounds {
            x: r.left,
            y: r.top,
            width: w,
            height: h,
            monitors,
        })
    } else {
        println!(
            "[monitors] monitor '{}' not found, available: {:?}",
            monitor_name,
            monitors.iter().map(|m| &m.name).collect::<Vec<_>>()
        );
        None
    }
}
