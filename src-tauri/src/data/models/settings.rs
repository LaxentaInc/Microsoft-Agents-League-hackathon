use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub audio_enabled: bool,
    pub live_wallpaper_enabled: bool,
    #[serde(default = "default_player")]
    pub video_player: String,
    #[serde(default)]
    pub mpv_path: Option<String>,
    /// mpv rendering preset: "Performance", "High", or "Ultra"
    #[serde(default = "default_mpv_preset")]
    pub mpv_preset: String,
    /// Enable Discord Rich Presence integration
    #[serde(default = "default_true")]
    pub discord_rpc_enabled: bool,
    /// Optional custom top line shown in Discord presence details
    #[serde(default)]
    pub discord_custom_status: Option<String>,
    /// Optional custom second line shown in Discord presence state
    #[serde(default)]
    pub discord_custom_details: Option<String>,
    // username for greetings :p
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default = "default_taskbar_effect")]
    pub taskbar_effect: String,
    #[serde(default = "default_taskbar_opacity")]
    pub taskbar_opacity: f32,
    /// Taskbar tint color as hex string (e.g., "#FF0000" for red)
    #[serde(default = "default_taskbar_color")]
    pub taskbar_color: String,
    /// Enable Mica/Acrylic effect on app window (may cause lag on some systems)
    #[serde(default)]
    pub window_vibrancy: bool,
    /// Automatically pause when another app is fullscreen
    #[serde(default = "default_pause_on_fullscreen")]
    pub pause_on_fullscreen: bool,
    /// performance mode master toggle
    #[serde(default)]
    pub perf_mode: bool,
    /// individual effect toggles (true = effect is enabled)
    #[serde(default = "default_true")]
    pub perf_blur_enabled: bool,
    #[serde(default = "default_true")]
    pub perf_animations_enabled: bool,
    #[serde(default = "default_true")]
    pub perf_homepage_video_enabled: bool,
    #[serde(default = "default_true")]
    pub perf_shadows_enabled: bool,
}

fn default_pause_on_fullscreen() -> bool {
    true
}

fn default_true() -> bool {
    true
}


fn default_taskbar_effect() -> String {
    "Default".to_string()
}

fn default_taskbar_opacity() -> f32 {
    0.5
}

fn default_taskbar_color() -> String {
    "#000000".to_string()
}

fn default_player() -> String {
    "wmf".to_string()
}

fn default_mpv_preset() -> String {
    "Performance".to_string()
}



#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub success: bool,
    pub settings: Option<AppSettings>,
    pub error: Option<String>,
}
