use lazy_static::lazy_static;
use std::ffi::c_void;
use std::sync::Mutex;
use std::time::Duration;
use windows::core::{s, BOOL};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::FindWindowA;

type SetWindowCompositionAttribute =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttributeData) -> BOOL;

#[repr(C)]
struct WindowCompositionAttributeData {
    attribute: u32,
    data: *mut c_void,
    size_of_data: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct AccentPolicy {
    accent_state: u32,
    accent_flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

const WCA_ACCENT_POLICY: u32 = 19;

// ACCENT_* constants
const ACCENT_DISABLED: u32 = 0;
#[allow(dead_code)]
const ACCENT_ENABLE_GRADIENT: u32 = 1;
const ACCENT_ENABLE_TRANSPARENTGRADIENT: u32 = 2;
const ACCENT_ENABLE_BLURBEHIND: u32 = 3;
const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4; // Requires Windows 10 1803+

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Copy, PartialEq)]
pub enum TaskbarEffect {
    Default,
    Transparent,
    Blur,
    Acrylic,
}

// Stored state: (effect, opacity, color_hex)
// color_hex is in ABGR format for Windows, but we accept RGB hex from frontend
lazy_static! {
    static ref TARGET_STATE: Mutex<(TaskbarEffect, f32, u32)> =
        Mutex::new((TaskbarEffect::Default, 0.0, 0x000000));
}

/// Start the background thread that keeps the taskbar styled.
/// Windows often resets the taskbar style (explorer restarts, tray interactions, etc.)
/// so we need to periodically re-apply it.
pub fn init_taskbar_keeper() {
    // Attempt to load settings from file immediately to restore state
    if let Some(config_dir) = dirs::config_dir() {
        let settings_path = config_dir.join("ColorWall").join("settings.json");
        if settings_path.exists() {
            if let Ok(content) = std::fs::read_to_string(settings_path) {
                if let Ok(settings) =
                    serde_json::from_str::<crate::data::models::AppSettings>(&content)
                {
                    let effect = match settings.taskbar_effect.as_str() {
                        "Transparent" => TaskbarEffect::Transparent,
                        "Blur" => TaskbarEffect::Blur,
                        "Acrylic" => TaskbarEffect::Acrylic,
                        _ => TaskbarEffect::Default,
                    };
                    
                    let color_hex =
                        u32::from_str_radix(settings.taskbar_color.trim_start_matches('#'), 16)
                            .unwrap_or(0x000000);

                    // Update state and apply immediately
                    if let Ok(mut lock) = TARGET_STATE.lock() {
                        *lock = (effect, settings.taskbar_opacity, color_hex);
                    }
                    let _ = apply_effect_internal(effect, settings.taskbar_opacity, color_hex);
                    println!("[taskbar] Restored saved state: {:?}", effect);
                }
            }
        }
    }

    std::thread::spawn(|| {
        loop {
            std::thread::sleep(Duration::from_millis(150));

            let (effect, opacity, color) = {
                let lock = TARGET_STATE.lock().unwrap();
                *lock
            };

            if effect != TaskbarEffect::Default {
                // Ignore errors in the loop to avoid spamming logs
                let _ = apply_effect_internal(effect, opacity, color);
            }
        }
    });
}

/// Set taskbar effect with optional tint color
/// color_hex: RGB hex (e.g., 0xFF0000 for red). We convert to ABGR internally.
pub fn set_taskbar_effect(
    effect: TaskbarEffect,
    opacity: f32,
    color_hex: u32,
) -> Result<(), String> {
    {
        let mut lock = TARGET_STATE.lock().map_err(|e| e.to_string())?;
        *lock = (effect, opacity, color_hex);
    }

    apply_effect_internal(effect, opacity, color_hex)
}

/// RGB hex to ABGR format for Windows
fn rgb_to_abgr(rgb: u32, alpha: u8) -> u32 {
    let r = (rgb >> 16) & 0xFF;
    let g = (rgb >> 8) & 0xFF;
    let b = rgb & 0xFF;
    // ABGR format: Alpha | Blue | Green | Red
    ((alpha as u32) << 24) | (b << 16) | (g << 8) | r
}

fn apply_effect_internal(
    effect: TaskbarEffect,
    opacity: f32,
    color_hex: u32,
) -> Result<(), String> {
    unsafe {
        let taskbar_hwnd = get_taskbar_window().map_err(|e| e.to_string())?;
        if taskbar_hwnd.0.is_null() {
            return Err("Could not find taskbar window".to_string());
        }

        let user32 = s!("user32.dll");
        let h_module = windows::Win32::System::LibraryLoader::LoadLibraryA(user32)
            .map_err(|e| e.to_string())?;

        let func_name = s!("SetWindowCompositionAttribute");
        let far_proc = windows::Win32::System::LibraryLoader::GetProcAddress(h_module, func_name);

        if let Some(proc) = far_proc {
            let set_wca: SetWindowCompositionAttribute = std::mem::transmute(proc);

            let mut policy = AccentPolicy {
                accent_state: ACCENT_DISABLED,
                accent_flags: 0,
                gradient_color: 0,
                animation_id: 0,
            };

            match effect {
                TaskbarEffect::Default => {
                    policy.accent_state = ACCENT_DISABLED;
                    policy.accent_flags = 0;
                }
                TaskbarEffect::Transparent => {
                    policy.accent_state = ACCENT_ENABLE_TRANSPARENTGRADIENT;
                    policy.accent_flags = 2;
                    policy.gradient_color = rgb_to_abgr(color_hex, 1);
                }
                TaskbarEffect::Blur => {
                    policy.accent_state = ACCENT_ENABLE_BLURBEHIND;
                    policy.accent_flags = 2;
                    let alpha = ((opacity * 0.5) * 255.0) as u8;
                    policy.gradient_color = rgb_to_abgr(color_hex, alpha);
                }
                TaskbarEffect::Acrylic => {
                    policy.accent_state = ACCENT_ENABLE_ACRYLICBLURBEHIND;
                    policy.accent_flags = 2;
                    let alpha = (opacity * 255.0) as u8;
                    policy.gradient_color = rgb_to_abgr(color_hex, alpha);
                }
            }

            let mut data = WindowCompositionAttributeData {
                attribute: WCA_ACCENT_POLICY,
                data: &mut policy as *mut _ as *mut c_void,
                size_of_data: std::mem::size_of::<AccentPolicy>() as u32,
            };

            let _ = set_wca(taskbar_hwnd, &mut data);
        }

        Ok(())
    }
}

unsafe fn get_taskbar_window() -> windows::core::Result<HWND> {
    let hwnd = FindWindowA(s!("Shell_TrayWnd"), None)?;
    Ok(hwnd)
}
