// data models for desktop widgets
// widgets are self-contained dom components injected into scene wallpapers
// each widget is a folder with widget.json + template.html + optional css/js

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::interactive::ColorWallProperty;

/// a widget manifest parsed from widget.json
/// supports both the canonical widget format (id, name, entry) and
/// project.json-style fields (title, file) missing fields are patched at scan time
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetManifest {
    /// unique widget id (folder name or explicit)
    #[serde(default)]
    pub id: String,
    /// display name
    #[serde(default)]
    pub name: String,
    /// fallback name field — project.json uses "title" instead of "name"
    #[serde(default, skip_serializing)]
    pub title: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub preview: Option<String>,

    /// html template filename
    #[serde(default = "default_entry")]
    pub entry: String,
    /// fallback entry field — project.json uses "file" instead of "entry"
    #[serde(default, skip_serializing)]
    pub file: Option<String>,
    /// css filename
    #[serde(default)]
    pub style: Option<String>,
    /// js filename
    #[serde(default)]
    pub script: Option<String>,

    /// default screen position (css values like "50%" or "120px")
    #[serde(default)]
    pub default_position: Option<WidgetPosition>,
    /// whether the user can drag this widget
    #[serde(default = "default_true")]
    pub draggable: bool,

    /// what data streams this widget needs: "time", "date", "media", "audio", "system"
    #[serde(default)]
    pub data_bindings: Vec<String>,

    /// fonts to load (google fonts, local, or url)
    #[serde(default)]
    pub fonts: Vec<WidgetFont>,

    /// user-adjustable tweaks (reuses the same property schema as scenes)
    #[serde(default)]
    pub tweaks: HashMap<String, ColorWallProperty>,

    /// whether this is a builtin widget (set at scan time)
    #[serde(default)]
    pub builtin: bool,
    /// absolute path to the widget folder (set at scan time, not from json)
    #[serde(default)]
    pub folder_path: Option<String>,
}

fn default_entry() -> String {
    "template.html".to_string()
}
fn default_true() -> bool {
    true
}

/// position on screen
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetPosition {
    pub x: String,
    pub y: String,
}

/// font requirement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetFont {
    /// css font-family name
    pub family: String,
    /// "google", "local", or "url"
    #[serde(default = "default_google")]
    pub source: String,
    /// weights to load
    #[serde(default)]
    pub weights: Vec<u32>,
    /// url if source is "url"
    #[serde(default)]
    pub url: Option<String>,
}

fn default_google() -> String {
    "google".to_string()
}

/// a placed widget instance (user's layout per scene)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetInstance {
    /// which widget this is
    pub widget_id: String,
    /// unique instance id (supports multiple of same type)
    pub instance_id: String,
    /// user-dragged position
    #[serde(default)]
    pub position: Option<WidgetPosition>,
    /// user-overridden tweak values
    #[serde(default)]
    pub tweak_overrides: HashMap<String, serde_json::Value>,
    /// whether visible
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// z-index layer
    #[serde(default)]
    pub z_index: Option<i32>,
    /// monitor id
    #[serde(default)]
    pub monitor_id: Option<String>,
}

/// full widget config stored per wallpaper
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SceneWidgetConfig {
    pub widgets: Vec<WidgetInstance>,
}

/// single widget payload sent to the webview for injection
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPayloadItem {
    pub instance_id: String,
    pub widget_id: String,
    pub position: Option<WidgetPosition>,
    pub enabled: bool,
    pub tweaks: HashMap<String, serde_json::Value>,
    pub manifest: WidgetManifest,
    pub html: String,
    pub css: String,
    pub js: String,
    pub fonts: Vec<WidgetFont>,
    pub z_index: Option<i32>,
}

/// full payload for widget injection into webview
#[derive(Debug, Clone, Serialize)]
pub struct WidgetPayload {
    pub widgets: Vec<WidgetPayloadItem>,
}

/// response for listing available widgets
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetListResponse {
    pub success: bool,
    pub widgets: Vec<WidgetManifest>,
    pub error: Option<String>,
}

/// response for widget config operations
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetConfigResponse {
    pub success: bool,
    pub config: Option<SceneWidgetConfig>,
    pub error: Option<String>,
}
