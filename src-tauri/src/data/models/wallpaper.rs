use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// basically constants we use
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperItem {
    pub id: String,
    pub source: String,
    pub title: Option<String>,
    pub image_url: String,
    pub thumbnail_url: Option<String>,
    #[serde(rename = "type")]
    pub media_type: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub tags: Option<Vec<String>>,
    pub detail_url: Option<String>,
    pub original: Option<serde_json::Value>,
}

/// what kind of wallpaper is running on a monitor
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WallpaperKind {
    Video,
    Interactive,
}

/// default to video for backward compatibility with old state files
fn default_wallpaper_kind() -> WallpaperKind {
    WallpaperKind::Video
}

fn default_enabled() -> bool {
    true
}

/// per-monitor wallpaper assignment entry — unified for all wallpaper types
/// a single map of these tells us exactly what's running on every monitor
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorWallpaperEntry {
    /// what type of wallpaper is active (defaults to Video for old state files)
    #[serde(default = "default_wallpaper_kind")]
    pub kind: WallpaperKind,
    /// path to the content — video file path or interactive folder path
    /// reads old "videoPath" keys via alias for backward compat
    #[serde(alias = "videoPath")]
    pub path: String,
    /// video-specific: streaming/preview url
    pub video_url: Option<String>,
    /// video-specific: original source url (for re-download fallback)
    pub original_url: Option<String>,
    /// whether this entry is currently active/playing
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoWallpaperState {
    pub is_active: bool,
    pub video_path: Option<String>,
    pub video_url: Option<String>,
    /// original url from which the video was downloaded (for re-download if file is missing)
    pub original_url: Option<String>,
    /// timestamp when wallpaper was set (for restoration tracking)
    pub set_at: Option<i64>,
    /// which monitors have the wallpaper (e.g. ["\\\\.\\DISPLAY1", "\\\\.\\DISPLAY3"])
    /// defaults to empty which means primary monitor
    #[serde(default)]
    pub active_monitors: Option<Vec<String>>,
    /// per-monitor wallpaper assignments (monitor_id -> entry)
    /// unified: stores BOTH video and interactive wallpapers
    #[serde(default)]
    pub monitor_wallpapers: Option<HashMap<String, MonitorWallpaperEntry>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserWallpaper {
    pub id: String,
    pub name: String,
    pub path: String,
    pub media_type: String,
    pub thumbnail: Option<String>,
    pub added_at: i64,
}
