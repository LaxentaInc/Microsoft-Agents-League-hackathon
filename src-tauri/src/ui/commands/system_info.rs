use serde::{Deserialize, Serialize};
use sysinfo::{Disks, System};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub screen_width: u32,
    pub screen_height: u32,
    pub total_memory_gb: f64,
    pub used_memory_gb: f64,
    pub cpu_name: String,
    pub cpu_usage: f32,
    pub gpu_name: String,
    pub gpu_usage: f32,
    pub os_name: String,
    pub os_version: String,
    pub disk_total_gb: f64,
    pub disk_used_gb: f64,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    // get screen dimensions
    let (screen_width, screen_height) = get_screen_dimensions();

    // system info
    let mut sys = System::new_all();
    sys.refresh_all();

    // memory
    let total_memory = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0); // convert to gb
    let used_memory = sys.used_memory() as f64 / (1024.0 * 1024.0 * 1024.0);

    // cpu - in sysinfo 0.32, use cpus() to get cpu list
    let cpus = sys.cpus();
    let cpu_name = if let Some(cpu) = cpus.first() {
        cpu.brand().to_string()
    } else {
        "Unknown CPU".to_string()
    };

    // calculate average cpu usage across all cores
    let cpu_usage = if !cpus.is_empty() {
        cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32
    } else {
        0.0
    };

    // gpu info (we'll try to get it from wmi on windows)
    let (gpu_name, gpu_usage) = get_gpu_info();

    // os info
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    // disk info
    let disks = Disks::new_with_refreshed_list();
    let (disk_total, disk_used) = disks.iter().fold((0.0, 0.0), |(total, used), disk| {
        let total_bytes = disk.total_space() as f64 / (1024.0 * 1024.0 * 1024.0);
        let available = disk.available_space() as f64 / (1024.0 * 1024.0 * 1024.0);
        let used_bytes = total_bytes - available;
        (total + total_bytes, used + used_bytes)
    });

    Ok(SystemInfo {
        screen_width,
        screen_height,
        total_memory_gb: total_memory,
        used_memory_gb: used_memory,
        cpu_name,
        cpu_usage,
        gpu_name,
        gpu_usage,
        os_name,
        os_version,
        disk_total_gb: disk_total,
        disk_used_gb: disk_used,
    })
}

#[cfg(target_os = "windows")]
fn get_screen_dimensions() -> (u32, u32) {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN) as u32;
        let height = GetSystemMetrics(SM_CYSCREEN) as u32;
        (width, height)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_screen_dimensions() -> (u32, u32) {
    // placeholder for other platforms
    (1920, 1080)
}

#[cfg(target_os = "windows")]
fn get_gpu_info() -> (String, f32) {
    use serde::Deserialize;
    use wmi::{COMLibrary, WMIConnection};

    #[derive(Deserialize, Debug)]
    #[serde(rename = "Win32_VideoController")]
    #[serde(rename_all = "PascalCase")]
    struct VideoController {
        name: String,
    }

    if let Ok(com_con) = COMLibrary::new() {
        if let Ok(wmi_con) = WMIConnection::new(com_con) {
            if let Ok(results) = wmi_con.query::<VideoController>() {
                if let Some(gpu) = results.into_iter().next() {
                    // we can't easily get gpu usage on windows without specific drivers
                    // so we'll return 0.0 for now
                    return (gpu.name, 0.0);
                }
            }
        }
    }

    ("Unknown GPU".to_string(), 0.0)
}

#[cfg(not(target_os = "windows"))]
fn get_gpu_info() -> (String, f32) {
    ("Unknown GPU".to_string(), 0.0)
}

// monitor info for the frontend display layout editor
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfoResponse {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_primary: bool,
    pub dpi: u32,
}

#[tauri::command]
pub async fn get_monitors() -> Result<Vec<MonitorInfoResponse>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::mem;
        use windows::Win32::Foundation::{LPARAM, RECT};
        use windows::Win32::Graphics::Gdi::{
            EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
        };
        use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
        use windows_core::BOOL;

        struct MonitorCollector {
            monitors: Vec<MonitorInfoResponse>,
        }

        unsafe extern "system" fn callback(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let collector = &mut *(lparam.0 as *mut MonitorCollector);

            let mut info: MONITORINFOEXW = mem::zeroed();
            info.monitorInfo.cbSize = mem::size_of::<MONITORINFOEXW>() as u32;

            if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _).as_bool() {
                let name = String::from_utf16_lossy(
                    &info.szDevice[..info.szDevice.iter().position(|&c| c == 0).unwrap_or(32)],
                );

                let r = info.monitorInfo.rcMonitor;
                let is_primary = (info.monitorInfo.dwFlags & 1) != 0;

                let (mut dpi_x, mut _dpi_y) = (96u32, 96u32);
                let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut _dpi_y);

                collector.monitors.push(MonitorInfoResponse {
                    id: name,
                    x: r.left,
                    y: r.top,
                    width: r.right - r.left,
                    height: r.bottom - r.top,
                    is_primary,
                    dpi: dpi_x,
                });
            }

            BOOL(1)
        }

        let mut collector = MonitorCollector {
            monitors: Vec::new(),
        };

        unsafe {
            let _ = EnumDisplayMonitors(
                None,
                None,
                Some(callback),
                LPARAM(&mut collector as *mut MonitorCollector as isize),
            );
        }

        Ok(collector.monitors)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // fallback for non-windows platforms
        Ok(vec![MonitorInfoResponse {
            id: "PRIMARY".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
            dpi: 96,
        }])
    }
}
