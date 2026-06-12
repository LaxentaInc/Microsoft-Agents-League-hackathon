// widget host:: transparent overlay webview for rendering widgets on top of video wallpapers
// when no interactive wallpaper is running, this provides a lightweight canvas for widgets
// uses the same shell injection as interactive wallpapers to sit behind desktop icons

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::HWND;

use super::helpers;
use super::widgets;

/// the host.html page compiled into the binary
const HOST_HTML: &str = include_str!("../../../../../assets/widgets/host.html");

lazy_static::lazy_static! {
    /// active widget host windows keyed by sanitized monitor id
    pub static ref WIDGET_HOST_LABELS: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// spawn a transparent widget host overlay on a monitor
/// writes host.html to appdata, creates a webview, injects behind desktop, loads widgets
pub fn spawn_widget_host(app: &AppHandle, monitor_id: Option<&str>) -> Result<(), String> {
    let resolved_id = match monitor_id {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => crate::core::ipc::resolve_primary_id(),
    };
    let clean_id = crate::core::ipc::sanitize_monitor_id(&resolved_id);

    // don't spawn if an interactive wallpaper is already running on this monitor
    // (widgets inject directly into the interactive webview instead)
    {
        let iw_labels = super::player::WEB_PLAYER_LABELS.lock().unwrap();
        if iw_labels.contains_key(&clean_id) {
            println!("[widget_host] interactive wallpaper active on {}, skipping host spawn", clean_id);
            crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, "interactive wallpaper active, skipping host spawn");
            return Ok(());
        }
    }

    // check if host already exists
    {
        let hosts = WIDGET_HOST_LABELS.lock().unwrap();
        if hosts.contains_key(&clean_id) {
            println!("[widget_host] host already active on {}", clean_id);
            return Ok(());
        }
    }

    println!("[widget_host] spawning transparent widget host on {}", clean_id);

    // write host.html to appdata so we can load it via asset protocol
    let host_html_path = write_host_html_to_appdata()?;
    let path_str = host_html_path.to_string_lossy().replace('\\', "/");

    #[cfg(target_os = "windows")]
    let file_url = format!("http://asset.localhost/{}", path_str);

    #[cfg(not(target_os = "windows"))]
    let file_url = format!("asset://localhost/{}", path_str);

    let label = format!("wh_{}", clean_id);

    // get screen dimensions
    let (screen_x, screen_y, screen_w, screen_h) = helpers::get_monitor_bounds(&resolved_id);

    // create a transparent, borderless webview covering the monitor
    let window = tauri::WebviewWindowBuilder::new(
        app,
        label.clone(),
        tauri::WebviewUrl::External(file_url.parse().map_err(|e| format!("bad url: {}", e))?),
    )
    .fullscreen(false)
    .inner_size(screen_w as f64, screen_h as f64)
    .position(screen_x as f64, screen_y as f64)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .disable_drag_drop_handler()
    .visible(false)
    .build()
    .map_err(|e| format!("failed to build widget host window: {}", e))?;

    // fix appearance (no rounded corners, no borders)
    helpers::fix_window_appearance(&window)?;

    // give the window a moment to initialize
    std::thread::sleep(std::time::Duration::from_millis(300));

    // inject into desktop — above video player but behind desktop icons
    let raw_hwnd = window
        .hwnd()
        .map_err(|e| format!("failed to get hwnd: {}", e))?
        .0;
    let hwnd = HWND(raw_hwnd as _);

    crate::platform::windows::os::widget_shell::inject_widget_overlay(
        hwnd, screen_x, screen_y, screen_w, screen_h,
    )?;

    // make the widget host fully click-through — all mouse events pass to the desktop below.
    // widget interaction is handled by the mouse forwarder (js eval), not native input.
    let _ = window.set_ignore_cursor_events(true);

    let _ = window.show();

    // track the host
    WIDGET_HOST_LABELS
        .lock()
        .unwrap()
        .insert(clean_id.clone(), label.clone());

    // inject widget runtime + all global widgets after a short delay
    let win_clone = window.clone();
    let clean_id_clone = clean_id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        inject_global_widgets(&win_clone, Some(&clean_id_clone));
    });

    // start the mouse forwarder so widget dragging works
    super::mouse::start_mouse_forwarder(app.clone());

    // start data forwarders (media, system, audio) so widgets get live data
    super::media::start_media_forwarder(app.clone());
    super::system::start_system_forwarder(app.clone());
    super::audio::start_audio_forwarder(app.clone());

    println!("[widget_host] host active on {}", clean_id);
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, "widget host active");
    Ok(())
}

/// check global config and spawn widget host if there are any active widgets
pub fn restore_global_widgets(app: &AppHandle) {
    if let Ok(config) = super::widgets::load_global_widget_config() {
        if !config.widgets.is_empty() {
            println!("[widget_host] restoring global widgets on startup");
            
            let mut unique_monitors = std::collections::HashSet::new();
            for w in config.widgets {
                let mon_id = w.monitor_id.clone().unwrap_or_else(|| crate::core::ipc::resolve_primary_id());
                unique_monitors.insert(crate::core::ipc::sanitize_monitor_id(&mon_id));
            }
            
            let app_clone = app.clone();
            // run this in a blocking task since spawn_widget_host uses std::thread::sleep internally
            tauri::async_runtime::spawn_blocking(move || {
                // small delay to let the primary wallpaper window mount first
                std::thread::sleep(std::time::Duration::from_millis(1500));
                for mon_id in unique_monitors {
                    if let Err(e) = spawn_widget_host(&app_clone, Some(&mon_id)) {
                        println!("[widget_host] failed to restore global widgets on {}: {}", mon_id, e);
                    }
                }
            });
        }
    }
}

/// stop the widget host on a specific monitor
pub fn stop_widget_host(app: &AppHandle, monitor_id: Option<&str>) -> Result<(), String> {
    let resolved_id = match monitor_id {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => crate::core::ipc::resolve_primary_id(),
    };
    let clean_id = crate::core::ipc::sanitize_monitor_id(&resolved_id);

    let mut hosts = WIDGET_HOST_LABELS.lock().unwrap();
    if let Some(label) = hosts.remove(&clean_id) {
        println!("[widget_host] stopping host on {} (label: {})", clean_id, label);
        if let Some(window) = app.get_webview_window(&label) {
            // unregister from z-order maintenance before closing
            if let Ok(raw_hwnd) = window.hwnd() {
                let hwnd = HWND(raw_hwnd.0 as _);
                crate::platform::windows::os::widget_shell::unregister_overlay(hwnd);
            }
            let _ = window.close();
            let _ = window.destroy();
        }
        println!("[widget_host] host stopped on {}", clean_id);
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, "widget host stopped");
    }

    Ok(())
}

/// stop all widget hosts on all monitors
pub fn stop_all_widget_hosts(app: &AppHandle) -> Result<(), String> {
    let mut hosts = WIDGET_HOST_LABELS.lock().unwrap();

    for (monitor_id, label) in hosts.drain() {
        println!("[widget_host] stopping host on {} (label: {})", monitor_id, label);
        if let Some(window) = app.get_webview_window(&label) {
            // unregister from z-order maintenance before closing
            if let Ok(raw_hwnd) = window.hwnd() {
                let hwnd = HWND(raw_hwnd.0 as _);
                crate::platform::windows::os::widget_shell::unregister_overlay(hwnd);
            }
            let _ = window.close();
            let _ = window.destroy();
        }
    }

    println!("[widget_host] all hosts stopped");
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "all widget hosts stopped");
    Ok(())
}

/// check if a widget host is active on a monitor
pub fn is_widget_host_active(monitor_id: &str) -> bool {
    let clean_id = crate::core::ipc::sanitize_monitor_id(monitor_id);
    WIDGET_HOST_LABELS.lock().unwrap().contains_key(&clean_id)
}

/// live-inject a single widget into the active host or interactive webview on a monitor
pub fn inject_widget_live(app: &AppHandle, monitor_id: &str, instance: &crate::data::models::widget::WidgetInstance) -> Result<(), String> {
    let clean_id = crate::core::ipc::sanitize_monitor_id(monitor_id);

    // build the payload for this single widget
    let payload_item = widgets::build_single_widget_payload(instance)?;
    let payload_json = serde_json::to_string(&payload_item).map_err(|e| e.to_string())?;

    // figure out which webview to inject into
    let target_label = {
        // prefer interactive webview if running
        let iw_labels = super::player::WEB_PLAYER_LABELS.lock().unwrap();
        if let Some(info) = iw_labels.get(&clean_id) {
            Some(info.label.clone())
        } else {
            // fall back to widget host
            let hosts = WIDGET_HOST_LABELS.lock().unwrap();
            hosts.get(&clean_id).cloned()
        }
    };

    if let Some(label) = target_label {
        if let Some(window) = app.get_webview_window(&label) {
            // make sure runtime is loaded, then inject the widget
            let runtime_js = widgets::WIDGET_RUNTIME_JS;
            let js = format!(
                "if(!window.__cw_widget_runtime){{{}}}\nwindow.__cw_addSingleWidget({});",
                runtime_js, payload_json
            );
            window.eval(&js).map_err(|e| format!("failed to inject widget: {}", e))?;
            println!("[widget_host] live-injected widget {} into {}", instance.instance_id, label);
            crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("live-injected widget {}", instance.instance_id));
        } else {
            return Err(format!("webview window {} not found", label));
        }
    } else {
        return Err("no active webview on this monitor".to_string());
    }

    Ok(())
}

/// remove a widget from the active host or interactive webview
pub fn remove_widget_live(app: &AppHandle, monitor_id: &str, instance_id: &str) -> Result<(), String> {
    let clean_id = crate::core::ipc::sanitize_monitor_id(monitor_id);

    let target_label = {
        let iw_labels = super::player::WEB_PLAYER_LABELS.lock().unwrap();
        if let Some(info) = iw_labels.get(&clean_id) {
            Some(info.label.clone())
        } else {
            let hosts = WIDGET_HOST_LABELS.lock().unwrap();
            hosts.get(&clean_id).cloned()
        }
    };

    if let Some(label) = target_label {
        if let Some(window) = app.get_webview_window(&label) {
            let js = format!("if(window.__cw_removeWidget)window.__cw_removeWidget('{}');", instance_id);
            window.eval(&js).map_err(|e| format!("failed to remove widget: {}", e))?;
            println!("[widget_host] removed widget {} from {}", instance_id, label);
            crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("removed widget {}", instance_id));
        }
    }

    Ok(())
}

/// inject the global widget runtime + widgets into a webview window
fn inject_global_widgets(window: &tauri::WebviewWindow, monitor_id: Option<&str>) {
    match widgets::generate_global_widget_injection_js(monitor_id) {
        Ok(js) if !js.is_empty() => {
            match window.eval(&js) {
                Ok(_) => {
                    println!("[widget_host] global widgets injected");
                    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "global widgets injected");
                }
                Err(e) => println!("[widget_host] failed to inject widgets: {}", e),
            }
        }
        Ok(_) => {
            // no widgets configured, inject runtime anyway for future live injection
            let _ = window.eval(widgets::WIDGET_RUNTIME_JS);
            println!("[widget_host] runtime injected (no global widgets configured)");
            crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "runtime injected (no global widgets configured)");
        }
        Err(e) => println!("[widget_host] widget payload error: {}", e),
    }

    // inject the real app version so data-cw-app-version elements update
    if let Some(version) = option_env!("CARGO_PKG_VERSION") {
        if let Ok(version_json) = serde_json::to_string(version) {
            let _ = window.eval(format!(
                "if (typeof window.__cw_setAppVersion === 'function') window.__cw_setAppVersion({});",
                version_json
            ));
        }
    }
}

/// write host.html to appdata so it can be loaded via asset protocol
fn write_host_html_to_appdata() -> Result<std::path::PathBuf, String> {
    let dir = crate::data::storage::get_app_data_dir()?.join("widgets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = dir.join("host.html");
    // always overwrite to ensure latest version
    std::fs::write(&path, HOST_HTML).map_err(|e| format!("failed to write host.html: {}", e))?;

    Ok(path)
}

/// get all widget host labels (used by the mouse forwarder to poll these windows too)
pub fn get_host_labels() -> Vec<String> {
    WIDGET_HOST_LABELS
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect()
}
