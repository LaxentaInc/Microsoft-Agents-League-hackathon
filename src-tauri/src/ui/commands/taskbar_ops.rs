use crate::platform::windows::os::taskbar::{set_taskbar_effect, TaskbarEffect};

#[tauri::command]
pub fn configure_taskbar(
    effect: TaskbarEffect,
    opacity: f32,
    color_hex: u32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        set_taskbar_effect(effect, opacity, color_hex)
    }
    #[cfg(not(target_os = "windows"))]
    {
        println!("Taskbar configuration is only supported on Windows");
        Ok(())
    }
}
