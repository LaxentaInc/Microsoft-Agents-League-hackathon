// widget system. uh scans, loads, and manages desktop widgets
// built-in widgets are compiled into the binary via include_str!
// user widgets are stored in %appdata%/colorwall/widgets/

use crate::data::models::widget::*;
use crate::data::storage::get_app_data_dir;
use std::collections::HashMap;
use std::path::Path;

/// the widget runtime js; injected into every scene webview
pub const WIDGET_RUNTIME_JS: &str =
    include_str!("../../../../../assets/widgets/runtime.js");

/// compiled-in widget data for builtin widgets
struct BuiltinWidgetData {
    manifest_json: &'static str,
    html: &'static str,
    css: &'static str,
    js: &'static str,
}

/// all built-in widgets embedded at compile time
const BUILTIN_WIDGETS: &[BuiltinWidgetData] = &[
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/clock-clean/widget.json"),
        html: include_str!("../../../../../assets/widgets/clock-clean/template.html"),
        css: include_str!("../../../../../assets/widgets/clock-clean/style.css"),
        js: include_str!("../../../../../assets/widgets/clock-clean/script.js"),
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/day-banner/widget.json"),
        html: include_str!("../../../../../assets/widgets/day-banner/template.html"),
        css: include_str!("../../../../../assets/widgets/day-banner/style.css"),
        js: "",
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/now-playing/widget.json"),
        html: include_str!("../../../../../assets/widgets/now-playing/template.html"),
        css: include_str!("../../../../../assets/widgets/now-playing/style.css"),
        js: include_str!("../../../../../assets/widgets/now-playing/script.js"),
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/visualizer/widget.json"),
        html: include_str!("../../../../../assets/widgets/visualizer/template.html"),
        css: include_str!("../../../../../assets/widgets/visualizer/style.css"),
        js: include_str!("../../../../../assets/widgets/visualizer/script.js"),
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/clock/widget.json"),
        html: include_str!("../../../../../assets/widgets/clock/template.html"),
        css: include_str!("../../../../../assets/widgets/clock/style.css"),
        js: "",
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/system/widget.json"),
        html: include_str!("../../../../../assets/widgets/system/template.html"),
        css: include_str!("../../../../../assets/widgets/system/style.css"),
        js: "",
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/mini-calendar/widget.json"),
        html: include_str!("../../../../../assets/widgets/mini-calendar/template.html"),
        css: include_str!("../../../../../assets/widgets/mini-calendar/style.css"),
        js: include_str!("../../../../../assets/widgets/mini-calendar/script.js"),
    },
    BuiltinWidgetData {
        manifest_json: include_str!("../../../../../assets/widgets/greeting/widget.json"),
        html: include_str!("../../../../../assets/widgets/greeting/template.html"),
        css: include_str!("../../../../../assets/widgets/greeting/style.css"),
        js: include_str!("../../../../../assets/widgets/greeting/script.js"),
    },
];

/// get all available widgets (builtin + user)
pub fn list_all_widgets() -> Vec<WidgetManifest> {
    let mut user_widgets = Vec::new();
    let mut builtin_widgets = Vec::new();

    // load built-in widgets
    for bw in BUILTIN_WIDGETS {
        if let Ok(mut manifest) = serde_json::from_str::<WidgetManifest>(bw.manifest_json) {
            manifest.builtin = true;
            if let Some(app_version) = option_env!("CARGO_PKG_VERSION") {
                manifest.version = Some(app_version.to_string());
            }
            builtin_widgets.push(manifest);
        }
    }

    // load user widgets from appdata
    if let Ok(user_dir) = get_user_widgets_dir() {
        if let Ok(entries) = std::fs::read_dir(&user_dir) {
            let mut folders: Vec<_> = entries.flatten().collect();
            // sort by creation time descending so newest appear first
            folders.sort_by(|a, b| {
                let time_a = a.metadata().ok()
                    .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                let time_b = b.metadata().ok()
                    .and_then(|m| m.created().or_else(|_| m.modified()).ok())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                time_b.cmp(&time_a)
            });
            for entry in folders {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(manifest) = scan_widget_folder(&path, false) {
                        user_widgets.push(manifest);
                    }
                }
            }
        }
    }

    // user widgets first (newest at top), then builtins
    let mut result = user_widgets;
    result.extend(builtin_widgets);
    result
}

/// scan a widget folder and parse its widget.json
/// auto-patches project.json-style fields (title→name, file→entry) and
/// derives a widget id from the folder name if missing
fn scan_widget_folder(folder: &Path, is_builtin: bool) -> Option<WidgetManifest> {
    match scan_widget_folder_inner(folder, is_builtin) {
        Ok(m) => Some(m),
        Err(e) => {
            println!("[widgets] scan_widget_folder({:?}) failed: {}", folder, e);
            None
        }
    }
}

/// inner function that returns detailed errors
fn scan_widget_folder_inner(folder: &Path, is_builtin: bool) -> Result<WidgetManifest, String> {
    let manifest_path = folder.join("widget.json");
    if !manifest_path.exists() {
        return Err("no widget.json found in folder".to_string());
    }

    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("failed to read widget.json: {}", e))?;

    let mut manifest: WidgetManifest = serde_json::from_str(&content)
        .map_err(|e| format!("widget.json parse error: {}", e))?;

    // patch: project.json uses "title" instead of "name"
    if manifest.name.is_empty() {
        if let Some(title) = manifest.title.take() {
            manifest.name = title;
        }
    }

    // patch: project.json uses "file" instead of "entry"
    if manifest.entry == "template.html" {
        if let Some(file) = manifest.file.take() {
            manifest.entry = file;
        }
    }

    // patch: derive id from folder name if missing
    if manifest.id.is_empty() {
        manifest.id = folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown-widget".to_string());
    }

    // patch: use id as name if still empty
    if manifest.name.is_empty() {
        manifest.name = manifest.id.clone();
    }

    // verify the entry file actually exists
    let entry_path = folder.join(&manifest.entry);
    if !entry_path.exists() {
        return Err(format!(
            "entry file '{}' not found in folder (expected at {:?})",
            manifest.entry, entry_path
        ));
    }

    manifest.builtin = is_builtin;
    manifest.folder_path = Some(folder.to_string_lossy().to_string());

    Ok(manifest)
}

/// get the content of a builtin widget by id
fn get_builtin_content(widget_id: &str) -> Option<(String, String, String)> {
    for bw in BUILTIN_WIDGETS {
        if let Ok(manifest) = serde_json::from_str::<WidgetManifest>(bw.manifest_json) {
            if manifest.id == widget_id {
                return Some((
                    bw.html.to_string(),
                    bw.css.to_string(),
                    bw.js.to_string(),
                ));
            }
        }
    }
    None
}

/// get the content of a user widget by reading its files
fn get_user_widget_content(folder: &Path, manifest: &WidgetManifest) -> (String, String, String) {
    let html = std::fs::read_to_string(folder.join(&manifest.entry)).unwrap_or_default();
    let css = manifest
        .style
        .as_ref()
        .and_then(|s| std::fs::read_to_string(folder.join(s)).ok())
        .unwrap_or_default();
    let js = manifest
        .script
        .as_ref()
        .and_then(|s| std::fs::read_to_string(folder.join(s)).ok())
        .unwrap_or_default();

    (html, css, js)
}

/// build a widget payload for injection into a webview
/// reads the scene's widget config and assembles all widget data
pub fn build_widget_payload(wallpaper_id: &str, target_monitor_id: Option<&str>) -> Result<WidgetPayload, String> {
    let config = load_widget_config(wallpaper_id)?;
    let all_widgets = list_all_widgets();

    let mut items = Vec::new();

    for instance in &config.widgets {
        if !instance.enabled {
            continue;
        }

        // if a target monitor is specified, skip widgets that belong to a different monitor
        if let Some(target_id) = target_monitor_id {
            let primary = crate::core::ipc::resolve_primary_id();
            let instance_monitor = instance.monitor_id.as_deref().unwrap_or(&primary);
            let clean_instance_monitor = crate::core::ipc::sanitize_monitor_id(instance_monitor);
            let clean_target = crate::core::ipc::sanitize_monitor_id(target_id);
            if clean_instance_monitor != clean_target {
                continue;
            }
        }

        // find the widget manifest
        let manifest = all_widgets
            .iter()
            .find(|w| w.id == instance.widget_id);

        let manifest = match manifest {
            Some(m) => m.clone(),
            None => {
                println!(
                    "[widgets] widget '{}' not found, skipping instance '{}'",
                    instance.widget_id, instance.instance_id
                );
                continue;
            }
        };

        // get the widget's html/css/js content
        let (html, css, js) = if manifest.builtin {
            get_builtin_content(&manifest.id).unwrap_or_default()
        } else if let Some(ref folder) = manifest.folder_path {
            get_user_widget_content(Path::new(folder), &manifest)
        } else {
            (String::new(), String::new(), String::new())
        };

        // merge tweak defaults with user overrides
        let mut tweaks: HashMap<String, serde_json::Value> = HashMap::new();
        for (key, prop) in &manifest.tweaks {
            tweaks.insert(key.clone(), prop.value.clone());
        }
        for (key, val) in &instance.tweak_overrides {
            tweaks.insert(key.clone(), val.clone());
        }

        items.push(WidgetPayloadItem {
            instance_id: instance.instance_id.clone(),
            widget_id: instance.widget_id.clone(),
            position: instance.position.clone(),
            enabled: instance.enabled,
            tweaks,
            manifest,
            html,
            css,
            js,
            fonts: Vec::new(), // fonts come from manifest, runtime handles loading
            z_index: instance.z_index,
        });
    }

    // populate fonts from manifests
    for item in &mut items {
        item.fonts = item.manifest.fonts.clone();
    }

    Ok(WidgetPayload { widgets: items })
}

/// get the user widgets directory
fn get_user_widgets_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_app_data_dir()?.join("widgets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// get the widget config directory
fn get_widget_config_dir() -> Result<std::path::PathBuf, String> {
    let dir = get_app_data_dir()?.join("widget-configs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// load the widget config for a specific wallpaper
pub fn load_widget_config(wallpaper_id: &str) -> Result<SceneWidgetConfig, String> {
    let dir = get_widget_config_dir()?;
    let safe_id = wallpaper_id
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let config_path = dir.join(format!("{}.json", safe_id));

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let config: SceneWidgetConfig =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(config)
    } else {
        Ok(SceneWidgetConfig::default())
    }
}

/// save the widget config for a specific wallpaper
pub fn save_widget_config_to_disk(
    wallpaper_id: &str,
    config: &SceneWidgetConfig,
) -> Result<(), String> {
    let dir = get_widget_config_dir()?;
    let safe_id = wallpaper_id
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    let config_path = dir.join(format!("{}.json", safe_id));

    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

    println!("[widgets] saved config for {}", wallpaper_id);
    Ok(())
}

/// import a user widget folder (copies to appdata/widgets/)
/// auto-patches project.json-style field names on import
pub fn import_widget_folder(source_path: &str) -> Result<WidgetManifest, String> {
    let source = Path::new(source_path);
    if !source.is_dir() {
        return Err("source path is not a directory".to_string());
    }

    // verify and patch the widget.json — gives detailed errors
    let manifest = scan_widget_folder_inner(source, false)?;

    let dest_dir = get_user_widgets_dir()?;
    let folder_name = source
        .file_name()
        .ok_or("invalid folder name")?
        .to_string_lossy()
        .to_string();

    let dest_path = dest_dir.join(&folder_name);

    if dest_path.exists() {
        println!("[widgets] widget already imported: {}", folder_name);
        return scan_widget_folder_inner(&dest_path, false);
    }

    // copy recursively
    copy_dir_recursive(source, &dest_path).map_err(|e| format!("failed to copy: {}", e))?;

    // write back the patched/normalized widget.json so future reads
    // don't need to re-patch title→name, file→entry, etc.
    let patched_manifest_path = dest_path.join("widget.json");
    if let Ok(patched_json) = serde_json::to_string_pretty(&manifest) {
        let _ = std::fs::write(&patched_manifest_path, patched_json);
    }

    println!("[widgets] imported widget: {} ({})", manifest.name, manifest.id);

    scan_widget_folder_inner(&dest_path, false)
}

/// delete a user widget
pub fn delete_user_widget(widget_id: &str) -> Result<(), String> {
    let user_dir = get_user_widgets_dir()?;
    if let Ok(entries) = std::fs::read_dir(&user_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(manifest) = scan_widget_folder(&path, false) {
                    if manifest.id == widget_id {
                        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
                        println!("[widgets] deleted widget: {}", widget_id);
                        return Ok(());
                    }
                }
            }
        }
    }
    Err(format!("widget '{}' not found", widget_id))
}

/// generate the full javascript to inject all widgets for a scene
pub fn generate_widget_injection_js(wallpaper_id: &str, monitor_id: Option<&str>) -> Result<String, String> {
    let payload = build_widget_payload(wallpaper_id, monitor_id)?;

    if payload.widgets.is_empty() {
        return Ok(String::new());
    }

    let payload_json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    Ok(format!(
        "{}\nwindow.__cw_wallpaper_id = {:?};\nsetTimeout(function(){{ window.__cw_loadWidgets({}); }}, 300);",
        WIDGET_RUNTIME_JS, wallpaper_id, payload_json
    ))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    super::helpers::copy_dir_recursive(src, dst)
}

// ── global widget config ──
// global widgets are not tied to any wallpaper — they overlay on top of video wallpapers

const GLOBAL_CONFIG_ID: &str = "_global";

/// load the global widget config (not tied to any wallpaper)
pub fn load_global_widget_config() -> Result<SceneWidgetConfig, String> {
    load_widget_config(GLOBAL_CONFIG_ID)
}

/// save the global widget config
pub fn save_global_widget_config(config: &SceneWidgetConfig) -> Result<(), String> {
    save_widget_config_to_disk(GLOBAL_CONFIG_ID, config)
}

/// build the widget payload for the global overlay
pub fn build_global_widget_payload(monitor_id: Option<&str>) -> Result<WidgetPayload, String> {
    build_widget_payload(GLOBAL_CONFIG_ID, monitor_id)
}

/// generate js to inject global widgets into the widget host
pub fn generate_global_widget_injection_js(monitor_id: Option<&str>) -> Result<String, String> {
    generate_widget_injection_js(GLOBAL_CONFIG_ID, monitor_id)
}

/// build payload for a single widget instance (used for live injection)
pub fn build_single_widget_payload(instance: &WidgetInstance) -> Result<WidgetPayloadItem, String> {
    let all_widgets = list_all_widgets();

    let manifest = all_widgets
        .iter()
        .find(|w| w.id == instance.widget_id)
        .cloned()
        .ok_or_else(|| format!("widget '{}' not found", instance.widget_id))?;

    // get content
    let (html, css, js) = if manifest.builtin {
        get_builtin_content(&manifest.id).unwrap_or_default()
    } else if let Some(ref folder) = manifest.folder_path {
        get_user_widget_content(Path::new(folder), &manifest)
    } else {
        (String::new(), String::new(), String::new())
    };

    // merge tweaks
    let mut tweaks: HashMap<String, serde_json::Value> = HashMap::new();
    for (key, prop) in &manifest.tweaks {
        tweaks.insert(key.clone(), prop.value.clone());
    }
    for (key, val) in &instance.tweak_overrides {
        tweaks.insert(key.clone(), val.clone());
    }

    Ok(WidgetPayloadItem {
        instance_id: instance.instance_id.clone(),
        widget_id: instance.widget_id.clone(),
        position: instance.position.clone(),
        enabled: instance.enabled,
        tweaks,
        manifest: manifest.clone(),
        html,
        css,
        js,
        fonts: manifest.fonts.clone(),
        z_index: instance.z_index,
    })
}
