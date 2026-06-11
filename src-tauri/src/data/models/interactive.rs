// data models for interactive web-based wallpapers
// supports lively format, plain html, and any folder with an index.html

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// detected format of the interactive wallpaper folder
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum InteractiveFormat {
    /// colorwall wallpaper format (has ColorWallInfo.json + ColorWallProperties.json)
    ColorWall,
    /// plain html wallpaper (just an index.html with optional assets)
    PlainHtml,
    /// unknown format that we'll try to render anyway
    Unknown,
}

/// metadata extracted from a wallpaper folder
/// works regardless of format — fields are optional so we fill what we can
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveWallpaperInfo {
    /// unique id (hash of folder path)
    pub id: String,
    /// display name (from metadata or folder name)
    pub name: String,
    /// absolute path to the wallpaper folder
    pub folder_path: String,
    /// path to the entry html file (usually index.html)
    pub entry_file: String,
    /// detected format
    pub format: InteractiveFormat,
    /// preview image path if found (jpg/png/gif in the folder)
    pub preview_image: Option<String>,
    /// author if available (from metadata)
    pub author: Option<String>,
    /// description if available
    pub description: Option<String>,
    /// wallpaper type hint from metadata (e.g. "web", "godot", "video")
    pub wallpaper_type: Option<String>,
    /// customizable properties (from ColorWallProperties.json or similar)
    pub properties: Option<HashMap<String, ColorWallProperty>>,
    /// when this wallpaper was imported
    pub added_at: i64,
}

/// a single customizable property from ColorWallProperties.json
/// flexible enough to handle any property type we encounter
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorWallProperty {
    /// property type: "slider", "checkbox", "color", "label", "dropdown", "textbox", etc.
    #[serde(rename = "type")]
    pub prop_type: String,
    /// display label
    pub text: Option<String>,
    /// current value — stored as json value so it can be anything
    #[serde(default)]
    pub value: serde_json::Value,
    /// min value (for sliders)
    pub min: Option<f64>,
    /// max value (for sliders)
    pub max: Option<f64>,
    /// step value (for sliders)
    pub step: Option<f64>,
    /// selected folder (for folderDropdown properties)
    pub folder: Option<String>,
    /// dropdown items if applicable (lively format)
    pub items: Option<Vec<DropdownItem>>,
    /// dropdown items (wallpaper engine uses options)
    pub options: Option<Vec<DropdownItem>>,
    /// any additional unknown properties
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// dropdown option for property dropdowns
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DropdownItem {
    pub label: String,
    pub value: serde_json::Value,
}

/// colorwall info metadata (from ColorWallInfo.json)
/// all fields optional because we don't require this file
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ColorWallInfoJson {
    #[serde(alias = "Title", alias = "title")]
    pub title: Option<String>,
    #[serde(
        alias = "Desc",
        alias = "desc",
        alias = "Description",
        alias = "description"
    )]
    pub desc: Option<String>,
    #[serde(alias = "Author", alias = "author")]
    pub author: Option<String>,
    #[serde(alias = "Type", alias = "type")]
    pub wallpaper_type: Option<serde_json::Value>,
    #[serde(
        alias = "FileName",
        alias = "fileName",
        alias = "filename",
        alias = "file"
    )]
    pub file_name: Option<String>,
    #[serde(alias = "Preview", alias = "preview")]
    pub preview: Option<String>,
    #[serde(alias = "Thumbnail", alias = "thumbnail")]
    pub thumbnail: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// response for listing interactive wallpapers
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractiveWallpapersResponse {
    pub success: bool,
    pub wallpapers: Vec<InteractiveWallpaperInfo>,
    pub error: Option<String>,
}

/// response for property queries
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractivePropertiesResponse {
    pub success: bool,
    pub properties: Option<HashMap<String, ColorWallProperty>>,
    pub error: Option<String>,
}
