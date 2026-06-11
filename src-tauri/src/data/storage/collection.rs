use crate::data::models::*;
use crate::data::storage::*;
use std::fs;
// for local wallpaper's: refer local_wallpaper_operations.rs
pub fn get_collection_file() -> Result<std::path::PathBuf, String> {
    let dir = get_app_data_dir()?;
    Ok(dir.join("wallpaper_collection.json"))
}

pub fn load_collection() -> WallpaperCollection {
    if let Ok(file_path) = get_collection_file() {
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(file_path) {
                if let Ok(collection) = serde_json::from_str(&content) {
                    return collection;
                }
            }
        }
    }

    // empty collection if load fails ;->
    WallpaperCollection {
        linked_wallpapers: Vec::new(),
    }
}

pub fn save_collection(collection: &WallpaperCollection) -> Result<(), String> {
    let file_path = get_collection_file()?;
    let json = serde_json::to_string_pretty(collection)
    .map_err(|e| format!("failed to serialize collection: {}", e))?;
    // atomic write pattern here too, just to be safe
    let temp_file = file_path.with_extension("tmp");
    fs::write(&temp_file, json).map_err(|e| format!("failed to write temp collection: {}", e))?;
    fs::rename(temp_file, file_path).map_err(|e| format!("failed to save collection: {}", e))?;

    Ok(())
}

pub fn add_linked_wallpaper(path_str: &str) -> Result<LinkedWallpaper, String> {
    let path = std::path::Path::new(path_str);
    if !path.exists() {
        return Err(format!("File does not exist: {}", path_str));
    }

    let mut collection = load_collection();

    // check if already exists
    if collection
        .linked_wallpapers
        .iter()
        .any(|w| w.path == path_str)
    {
        return Err("Wallpaper already linked".to_string());
    }

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let linked = LinkedWallpaper {
        id: format!("local_{:x}", md5::compute(path_str)),
        name,
        path: path_str.to_string(),
        added_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
    };

    collection.linked_wallpapers.push(linked.clone());
    save_collection(&collection)?;

    Ok(linked)
}

pub fn remove_linked_wallpaper(id: &str) -> Result<(), String> {
    let mut collection = load_collection();
    let initial_len = collection.linked_wallpapers.len();

    collection.linked_wallpapers.retain(|w| w.id != id);

    if collection.linked_wallpapers.len() != initial_len {
        save_collection(&collection)?;
        Ok(())
    } else {
        Err("Wallpaper not found in collection".to_string())
    }
}
