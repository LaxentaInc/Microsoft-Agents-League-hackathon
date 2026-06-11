use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedWallpaper {
    pub id: String,
    pub name: String,
    pub path: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WallpaperCollection {
    pub linked_wallpapers: Vec<LinkedWallpaper>,
}
