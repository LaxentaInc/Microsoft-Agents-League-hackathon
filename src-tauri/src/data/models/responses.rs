use super::wallpaper::{UserWallpaper, WallpaperItem};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub success: bool,
    pub items: Vec<WallpaperItem>,
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchChunk {
    pub source: String,
    pub items: Vec<WallpaperItem>,
    pub error: Option<String>,
    pub is_complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSizeResponse {
    pub success: bool,
    pub size_mb: String,
    pub file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCacheResponse {
    pub success: bool,
    pub files_deleted: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveHighResResponse {
    pub success: bool,
    pub url: Option<String>,
    pub url4k: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWallpapersResponse {
    pub success: bool,
    pub wallpapers: Vec<UserWallpaper>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}
