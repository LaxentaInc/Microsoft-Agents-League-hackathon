use crate::data::models::interactive::*;
use crate::data::storage::get_app_data_dir;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// get the directory where interactive wallpapers are stored
pub fn get_interactive_dir() -> Result<PathBuf, String> {
    let dir = get_app_data_dir()?.join("interactive");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn scan_folder(folder_path: &Path) -> Option<InteractiveWallpaperInfo> {
    if !folder_path.is_dir() {
        return None;
    }

    let entry_file = find_entry_file(folder_path)?;
    let colorwall_info = read_colorwall_info(folder_path);
    let format = detect_format(folder_path, &colorwall_info);
    let properties = read_colorwall_properties(folder_path);
    let preview = find_preview_image(folder_path, &colorwall_info);
    let name = colorwall_info
        .as_ref()
        .and_then(|i| i.title.clone())
        .unwrap_or_else(|| {
            folder_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown Wallpaper")
                .to_string()
        });

    let author = colorwall_info.as_ref().and_then(|i| i.author.clone());
    let description = colorwall_info.as_ref().and_then(|i| i.desc.clone());

    let wallpaper_type = colorwall_info.as_ref().and_then(|i| {
        i.wallpaper_type.as_ref().map(|v| match v {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Number(n) => {
                // colorwall uses numerical type codes sometimes
                match n.as_u64() {
                    Some(1) => "web".to_string(),
                    Some(2) => "web-audio".to_string(),
                    Some(3) => "godot".to_string(),
                    Some(4) => "gif".to_string(),
                    Some(5) => "unity".to_string(),
                    _ => format!("type-{}", n),
                }
            }
            _ => "unknown".to_string(),
        })
    });

    // generate a stable id from the folder path
    let id = format!(
        "iw_{:x}",
        md5::compute(folder_path.to_string_lossy().as_bytes())
    );

    let added_at = std::fs::metadata(folder_path)
        .and_then(|m| m.created().or_else(|_| m.modified()))
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    Some(InteractiveWallpaperInfo {
        id,
        name,
        folder_path: folder_path.to_string_lossy().to_string(),
        entry_file: entry_file.to_string_lossy().to_string(),
        format,
        preview_image: preview.map(|p| p.to_string_lossy().to_string()),
        author,
        description,
        wallpaper_type,
        properties,
        added_at,
    })
}

/// scan the entire interactive wallpapers library directory
pub fn scan_interactive_library() -> Result<Vec<InteractiveWallpaperInfo>, String> {
    let dir = get_interactive_dir()?;
    let mut wallpapers = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(info) = scan_folder(&path) {
                    wallpapers.push(info);
                }
            }
        }
    }

    // sort by added_at descending (newest first)
    wallpapers.sort_by(|a, b| b.added_at.cmp(&a.added_at));
    Ok(wallpapers)
}

/// find an entry html file in the folder
/// checks common names first, then falls back to any .html file
fn find_entry_file(folder: &Path) -> Option<PathBuf> {
    // check common entry point names
    let candidates = [
        "index.html",
        "Index.html",
        "index.htm",
        "main.html",
        "wallpaper.html",
    ];

    for name in &candidates {
        let path = folder.join(name);
        if path.exists() {
            return Some(path);
        }
    }

    // check if colorwall metadata specifies a filename
    if let Some(info) = read_colorwall_info(folder) {
        if let Some(filename) = info.file_name {
            let path = folder.join(&filename);
            if path.exists() {
                return Some(path);
            }
        }
    }

    // last resort: find any .html file
    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
                if ext == "html" || ext == "htm" {
                    return Some(path);
                }
            }
        }
    }

    None
}

/// detect what format this wallpaper folder is
fn detect_format(folder: &Path, info_json: &Option<ColorWallInfoJson>) -> InteractiveFormat {
    // if we previously found and parsed any metadata json file, it's a proper wallpaper package
    if info_json.is_some() {
        return InteractiveFormat::ColorWall;
    }

    // if it has index.html but no metadata, it's plain html
    let has_html = ["index.html", "index.htm", "main.html"]
        .iter()
        .any(|f| folder.join(f).exists());

    if has_html {
        return InteractiveFormat::PlainHtml;
    }

    // we'll try to render it anyway
    InteractiveFormat::Unknown
}

/// scan all json files in the folder and find one that looks like wallpaper metadata
/// checks structure (has title/author/filename fields) rather than hardcoding filenames
fn read_colorwall_info(folder: &Path) -> Option<ColorWallInfoJson> {
    let entries = std::fs::read_dir(folder).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            != Some("json".to_string())
        {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(&path) {
            // try to parse as our metadata struct
            if let Ok(info) = serde_json::from_str::<ColorWallInfoJson>(&content) {
                // validate it actually has metadata-like fields (title or filename at minimum)
                if info.title.is_some() || info.file_name.is_some() || info.author.is_some() {
                    return Some(info);
                }
            }
        }
    }

    None
}

/// scan all json files in the folder and find one that looks like a properties definition
/// detects by checking if the json is a flat object where values have a "type" field
fn read_colorwall_properties(folder: &Path) -> Option<HashMap<String, ColorWallProperty>> {
    let entries = std::fs::read_dir(folder).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            != Some("json".to_string())
        {
            continue;
        }

        if let Ok(content) = std::fs::read_to_string(&path) {
            // try to parse as a flat json object
            if let Ok(raw) = serde_json::from_str::<HashMap<String, serde_json::Value>>(&content) {
                let mut props = HashMap::new();
                let mut has_typed_props = false;

                // check for "general" -> "properties" (wallpaper engine style)
                let mut target_iter = None;
                if let Some(general) = raw.get("general").and_then(|g| g.as_object()) {
                    if let Some(p) = general.get("properties").and_then(|p| p.as_object()) {
                        target_iter = Some(p.clone());
                    }
                }

                // check for "properties" at root
                if target_iter.is_none() {
                    if let Some(p) = raw.get("properties").and_then(|p| p.as_object()) {
                        target_iter = Some(p.clone());
                    }
                }

                if let Some(target) = target_iter {
                    for (key, val) in target {
                        if let Some(obj) = val.as_object() {
                            if obj.contains_key("type") {
                                has_typed_props = true;
                                if let Some(prop) = parse_colorwall_property(&val) {
                                    props.insert(key.clone(), prop);
                                }
                            }
                        }
                    }
                } else {
                    // fallback: flat lively structure over root keys
                    for (key, val) in &raw {
                        if let Some(obj) = val.as_object() {
                            if obj.contains_key("type") {
                                has_typed_props = true;
                                if let Some(prop) = parse_colorwall_property(val) {
                                    props.insert(key.clone(), prop);
                                }
                            }
                        }
                    }
                }

                // only return if we found actual typed property definitions
                if has_typed_props && !props.is_empty() {
                    return Some(props);
                }
            }
        }
    }

    None
}

/// parse a single colorwall property from its json value
fn parse_colorwall_property(val: &serde_json::Value) -> Option<ColorWallProperty> {
    let mut obj = val.clone();

    // lively folderdropdowns often just provide the filename, but the wallpaper needs the relative path
    if let Some(o) = obj.as_object_mut() {
        if let Some(prop_type) = o.get("type").and_then(|v| v.as_str()) {
            if prop_type == "folderDropdown" {
                let folder_str = o
                    .get("folder")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                if let Some(folder) = folder_str {
                    if let Some(val_node) = o.get_mut("value") {
                        if let Some(filename) = val_node.as_str() {
                            if !filename.contains('/') && !filename.contains('\\') {
                                let combined = format!("{}/{}", folder, filename);
                                *val_node = serde_json::Value::String(combined);
                            }
                        }
                    }
                }
            }
        }
    }

    serde_json::from_value(obj).ok()
}

/// find a preview/thumbnail image in the folder
fn find_preview_image(
    folder: &Path,
    colorwall_info: &Option<ColorWallInfoJson>,
) -> Option<PathBuf> {
    // check colorwall metadata first
    if let Some(info) = colorwall_info {
        for name in [&info.preview, &info.thumbnail].into_iter().flatten() {
            let path = folder.join(name);
            if path.exists() {
                return Some(path);
            }
        }
    }

    // search for common preview filenames
    let preview_names = [
        "preview.jpg",
        "preview.png",
        "preview.gif",
        "thumbnail.jpg",
        "thumbnail.png",
        "thumb.jpg",
        "thumb.png",
    ];

    for name in &preview_names {
        let path = folder.join(name);
        if path.exists() {
            return Some(path);
        }
    }

    // grab any image file in the root of the folder
    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if matches!(
                        ext.to_lowercase().as_str(),
                        "jpg" | "jpeg" | "png" | "gif" | "webp"
                    ) {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}
