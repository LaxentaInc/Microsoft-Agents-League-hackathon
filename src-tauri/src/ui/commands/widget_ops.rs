// tauri commands for the widget system

use crate::data::models::widget::*;
use crate::platform::windows::interactive::widgets;
use crate::platform::windows::interactive::widget_host;
use tauri::{AppHandle, Manager};

/// list all available widgets (builtin + user)
#[tauri::command]
pub fn list_widgets() -> WidgetListResponse {
    let widgets_list = widgets::list_all_widgets();
    WidgetListResponse {
        success: true,
        widgets: widgets_list,
        error: None,
    }
}

/// get a standalone HTML document for previewing a widget in an iframe
#[tauri::command]
pub fn get_widget_preview_html(widget_id: String) -> String {
    let bounds = crate::platform::windows::os::monitors::get_primary_monitor_bounds_or_virtual_fallback();
    let mw = bounds.width;
    let mh = bounds.height;

    let instance = crate::data::models::widget::WidgetInstance {
        widget_id: widget_id.clone(),
        instance_id: "preview_1".to_string(),
        position: None,
        tweak_overrides: {
            let mut m = std::collections::HashMap::new();
            m.insert("__cw_locked".to_string(), serde_json::Value::Bool(true));
            m
        },
        enabled: true,
        z_index: None,
        monitor_id: None,
    };
    
    let payload = match widgets::build_single_widget_payload(&instance) {
        Ok(p) => p,
        Err(e) => return format!("Error: {}", e),
    };

    let payload_json = serde_json::to_string(&payload).unwrap_or_default().replace("</script>", "<\\/script>");
    let runtime_js = widgets::WIDGET_RUNTIME_JS;
    
    format!(r#"
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  html, body {{ margin: 0; padding: 0; overflow: hidden; background: transparent; }}
</style>
</head>
<body>
<script>
  function _cw_scalePreview() {{
      var w = window.innerWidth;
      var zoom = 2.5; // Enlarge widgets by 2.5x for preview
      var targetW = {mw} / zoom;
      var targetH = {mh} / zoom;
      
      document.body.style.transform = 'scale(' + (w / targetW) + ')';
      document.body.style.transformOrigin = 'top left';
      document.body.style.width = targetW + 'px';
      document.body.style.height = targetH + 'px';
      document.body.style.position = 'absolute';
      document.body.style.top = '0';
      document.body.style.left = '0';
  }}
  window.addEventListener('resize', _cw_scalePreview);
  _cw_scalePreview();

{}
window.__cw_addSingleWidget({});
</script>
</body>
</html>"#, runtime_js, payload_json)
}

/// get the widget config for a specific wallpaper/scene
#[tauri::command]
pub fn get_widget_config(wallpaper_id: String) -> WidgetConfigResponse {
    match widgets::load_widget_config(&wallpaper_id) {
        Ok(config) => WidgetConfigResponse {
            success: true,
            config: Some(config),
            error: None,
        },
        Err(e) => WidgetConfigResponse {
            success: false,
            config: None,
            error: Some(e),
        },
    }
}

/// save the widget config for a specific wallpaper/scene
#[tauri::command]
pub fn save_widget_config(wallpaper_id: String, config: SceneWidgetConfig) -> WidgetConfigResponse {
    match widgets::save_widget_config_to_disk(&wallpaper_id, &config) {
        Ok(()) => WidgetConfigResponse {
            success: true,
            config: Some(config),
            error: None,
        },
        Err(e) => WidgetConfigResponse {
            success: false,
            config: None,
            error: Some(e),
        },
    }
}

/// import a user widget from a folder path
#[tauri::command]
pub fn import_widget(source_path: String) -> WidgetListResponse {
    match widgets::import_widget_folder(&source_path) {
        Ok(manifest) => WidgetListResponse {
            success: true,
            widgets: vec![manifest],
            error: None,
        },
        Err(e) => WidgetListResponse {
            success: false,
            widgets: vec![],
            error: Some(e),
        },
    }
}

/// delete a user-uploaded widget
#[tauri::command]
pub fn delete_widget(widget_id: String) -> WidgetConfigResponse {
    match widgets::delete_user_widget(&widget_id) {
        Ok(()) => WidgetConfigResponse {
            success: true,
            config: None,
            error: None,
        },
        Err(e) => WidgetConfigResponse {
            success: false,
            config: None,
            error: Some(e),
        },
    }
}

// ── global widget overlay commands ──

/// get the global widget config (widgets on desktop, not tied to a wallpaper)
#[tauri::command]
pub fn get_global_widgets() -> WidgetConfigResponse {
    match widgets::load_global_widget_config() {
        Ok(config) => WidgetConfigResponse {
            success: true,
            config: Some(config),
            error: None,
        },
        Err(e) => WidgetConfigResponse {
            success: false,
            config: None,
            error: Some(e),
        },
    }
}

/// add a widget to the desktop overlay
/// creates a new instance, saves to global config, spawns host if needed, live-injects
#[tauri::command]
pub async fn spawn_widget_on_desktop(app: AppHandle, widget_id: String, monitor_ids: Option<Vec<String>>) -> WidgetConfigResponse {
    // load current global config
    let mut config = match widgets::load_global_widget_config() {
        Ok(c) => c,
        Err(e) => return WidgetConfigResponse { success: false, config: None, error: Some(e) },
    };

    // look up the manifest to get the default position (if any)
    let all_widgets = widgets::list_all_widgets();
    let initial_position = all_widgets
        .iter()
        .find(|w| w.id == widget_id)
        .and_then(|w| w.default_position.clone())
        .or_else(|| {
            // no manifest default — use the css fallback so it's persisted
            Some(crate::data::models::widget::WidgetPosition {
                x: "50%".to_string(),
                y: "10%".to_string(),
            })
        });

    let targets = match monitor_ids {
        Some(ids) if !ids.is_empty() => ids,
        _ => vec![crate::core::ipc::resolve_primary_id()],
    };

    for mon_id in targets {
        // create a new instance with position pre-filled so it survives app restarts
        let instance = WidgetInstance {
            widget_id: widget_id.clone(),
            instance_id: format!("g_{}", generate_short_id()),
            position: initial_position.clone(),
            tweak_overrides: {
                let mut m = std::collections::HashMap::new();
                m.insert("__cw_locked".to_string(), serde_json::Value::Bool(true));
                m
            },
            enabled: true,
            z_index: None,
            monitor_id: Some(mon_id.clone()),
        };

        config.widgets.push(instance.clone());

        // ensure widget host is running for this monitor
        if let Err(e) = crate::platform::windows::interactive::widget_host::spawn_widget_host(&app, Some(&mon_id)) {
            println!("[widget_ops] failed to spawn widget host on {}: {}", mon_id, e);
        }

        // live-inject the widget into the active webview
        if let Err(e) = crate::platform::windows::interactive::widget_host::inject_widget_live(&app, &mon_id, &instance) {
            println!("[widget_ops] live injection failed on {} (will load on next refresh): {}", mon_id, e);
        }
    }

    // save the config
    if let Err(e) = widgets::save_global_widget_config(&config) {
        return WidgetConfigResponse { success: false, config: None, error: Some(e) };
    }

    WidgetConfigResponse {
        success: true,
        config: Some(config),
        error: None,
    }
}

/// remove a widget from the desktop overlay
#[tauri::command]
pub async fn remove_widget_from_desktop(app: AppHandle, instance_id: String) -> WidgetConfigResponse {
    let mut config = match widgets::load_global_widget_config() {
        Ok(c) => c,
        Err(e) => return WidgetConfigResponse { success: false, config: None, error: Some(e) },
    };

    // remove from config
    config.widgets.retain(|w| w.instance_id != instance_id);

    if let Err(e) = widgets::save_global_widget_config(&config) {
        return WidgetConfigResponse { success: false, config: None, error: Some(e) };
    }

    // live-remove from the webview
    let monitor_id = crate::core::ipc::resolve_primary_id();
    let _ = widget_host::remove_widget_live(&app, &monitor_id, &instance_id);

    // if no more global widgets, stop the host to free resources
    if config.widgets.is_empty() {
        let _ = widget_host::stop_all_widget_hosts(&app);
    }

    WidgetConfigResponse {
        success: true,
        config: Some(config),
        error: None,
    }
}

/// kill all global widgets and stop the widget host — full cleanup
#[tauri::command]
pub async fn kill_all_widgets(app: AppHandle) -> WidgetConfigResponse {
    // clear the global config
    let empty_config = SceneWidgetConfig { widgets: vec![] };
    let _ = widgets::save_global_widget_config(&empty_config);

    // stop all widget host windows
    let _ = widget_host::stop_all_widget_hosts(&app);

    println!("[widget_ops] all global widgets killed and hosts stopped");

    WidgetConfigResponse {
        success: true,
        config: Some(empty_config),
        error: None,
    }
}

/// update a global widget's position on the desktop
#[tauri::command]
pub async fn update_widget_position(instance_id: String, x: String, y: String, wallpaper_id: Option<String>) -> WidgetConfigResponse {
    let target_id = wallpaper_id.unwrap_or_else(|| "_global".to_string());
    
    let mut config = match widgets::load_widget_config(&target_id) {
        Ok(c) => c,
        Err(e) => return WidgetConfigResponse { success: false, config: None, error: Some(e) },
    };

    let mut found = false;
    for widget in &mut config.widgets {
        if widget.instance_id == instance_id {
            widget.position = Some(WidgetPosition { x: x.clone(), y: y.clone() });
            found = true;
            break;
        }
    }

    if found {
        if let Err(e) = widgets::save_widget_config_to_disk(&target_id, &config) {
            return WidgetConfigResponse { success: false, config: None, error: Some(e) };
        }
    }

    WidgetConfigResponse {
        success: true,
        config: Some(config),
        error: None,
    }
}

/// save the full global widget config (for bulk updates like tweak changes)
/// also pushes live updates to the running widget host webview
#[tauri::command]
pub async fn save_global_widgets(app: AppHandle, config: SceneWidgetConfig) -> WidgetConfigResponse {
    // save to disk first
    if let Err(e) = widgets::save_global_widget_config(&config) {
        return WidgetConfigResponse { success: false, config: None, error: Some(e) };
    }

    // find all monitors that either have active webviews OR are configured to have widgets
    let mut target_monitors = std::collections::HashSet::new();

    // add monitors from the new config
    for w in &config.widgets {
        let mon = w.monitor_id.clone().unwrap_or_else(|| crate::core::ipc::resolve_primary_id());
        target_monitors.insert(crate::core::ipc::sanitize_monitor_id(&mon));
    }

    // add monitors that currently have an interactive wallpaper running
    {
        let iw_labels = crate::platform::windows::interactive::player::WEB_PLAYER_LABELS.lock().unwrap();
        for k in iw_labels.keys() {
            target_monitors.insert(k.clone());
        }
    }

    // add monitors that currently have a widget host running
    {
        let hosts = crate::platform::windows::interactive::widget_host::WIDGET_HOST_LABELS.lock().unwrap();
        for k in hosts.keys() {
            target_monitors.insert(k.clone());
        }
    }

    // push live updates to all relevant monitors
    for clean_id in target_monitors {
        let target_label = {
            let iw_labels = crate::platform::windows::interactive::player::WEB_PLAYER_LABELS.lock().unwrap();
            if let Some(info) = iw_labels.get(&clean_id) {
                Some(info.label.clone())
            } else {
                let hosts = crate::platform::windows::interactive::widget_host::WIDGET_HOST_LABELS.lock().unwrap();
                hosts.get(&clean_id).cloned()
            }
        };

        if let Some(label) = target_label {
            if let Some(window) = app.get_webview_window(&label) {
                // inject the updated widgets for this specific monitor
                match widgets::generate_global_widget_injection_js(Some(&clean_id)) {
                    Ok(js) => {
                        let _ = window.eval(&js);
                    }
                    Err(e) => println!("[widget_ops] failed to generate widget JS for {}: {}", clean_id, e),
                }
            }
        } else {
            // no webview exists on this monitor, but it has widgets in the config. Spawn a host!
            let _ = crate::platform::windows::interactive::widget_host::spawn_widget_host(&app, Some(&clean_id));
        }
    }

    WidgetConfigResponse {
        success: true,
        config: Some(config),
        error: None,
    }
}

/// generate a short random id for widget instances
fn generate_short_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}", t & 0xFFFFFFFF)
}
