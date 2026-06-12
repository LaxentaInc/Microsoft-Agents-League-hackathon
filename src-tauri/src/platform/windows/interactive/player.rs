// interactive wallpaper player → uses tauri's webview window
// creates a webview window, loads the html wallpaper, then injects it behind
// the desktop via shell_int. keeps its own window map so it doesn't interfere
// with existing video player code.
use crate::data::models::interactive::ColorWallProperty;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::HWND;

#[derive(Clone)]
pub struct WebPlayerInfo {
    pub label: String,
    pub folder_path: String,
}

lazy_static::lazy_static! {
    /// active interactive wallpaper window information keyed by sanitized monitor id
    pub static ref WEB_PLAYER_LABELS: Arc<Mutex<HashMap<String, WebPlayerInfo>>> = Arc::new(Mutex::new(HashMap::new()));
    /// tracks which windows have already had widgets injected to avoid duplicate injection
    pub static ref WIDGET_INJECTED: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
}

/// start an interactive wallpaper on a specific monitor
pub fn start_interactive_wallpaper(
    app: &AppHandle,
    folder_path: &str,
    monitor_id: Option<&str>,
) -> Result<(), String> {
    let resolved_id = match monitor_id {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => crate::core::ipc::resolve_primary_id(),
    };
    let clean_id = crate::core::ipc::sanitize_monitor_id(&resolved_id);

    // init diagnostics logger
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::init_for_monitor(&clean_id, folder_path);

    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!(
        "starting web wallpaper on {} (folder: {})",
        clean_id, folder_path
    ));

    // stop any existing video wallpaper on this monitor
    let _ =
        crate::platform::windows::engine::stop_wallpaper_on_monitor(&resolved_id).map_err(|e| {
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("failed to stop video wallpaper: {}", e));
    });

    // stop any widget host on this monitor — widgets will inject into this interactive webview instead
    let _ = super::widget_host::stop_widget_host(app, Some(&resolved_id)).map_err(|e| {
        println!("[interactive] failed to stop widget host: {}", e);
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("failed to stop widget host: {}", e));
    });

    // find the entry html file and parse metadata config
    let folder = std::path::Path::new(folder_path);
    let wallpaper_info = super::scanner::scan_folder(folder)
        .ok_or("folder doesn't contain any renderable content")?;
    let entry_file = wallpaper_info.entry_file.clone();

    super::import::patch_interactive_files(folder);

    // use tauri's asset protocol to load the html file so CORS local fetches work
    let entry_path = std::path::Path::new(&entry_file);
    let path_str = entry_path.to_string_lossy().replace('\\', "/");

    #[cfg(target_os = "windows")]
    let file_url = format!("http://asset.localhost/{}", path_str);

    #[cfg(not(target_os = "windows"))]
    let file_url = format!("asset://localhost/{}", path_str);

    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("loading url: {}", file_url));

    // unique label for this webview window
    let label = format!("iw_{}", clean_id);

    // try to reuse an existing window
    if let Some(existing_window) = app.get_webview_window(&label) {
        return reuse_existing_window(
            app,
            existing_window,
            &label,
            &file_url,
            &clean_id,
            &resolved_id,
            folder_path,
            wallpaper_info.properties,
        );
    }

    // stop any existing interactive wallpaper on this monitor first
    super::state::clean_interactive_webview(app, &clean_id);
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, "stopped previous interactive wallpaper instances");

    // get screen dimensions for positioning
    let (screen_x, screen_y, screen_w, screen_h) = super::helpers::get_monitor_bounds(&resolved_id);

    // create a new webview window — hidden, borderless, exact size of the monitor
    let window_builder = tauri::WebviewWindowBuilder::new(
        app,
        label.clone(),
        tauri::WebviewUrl::External(file_url.parse().map_err(|e| format!("bad url: {}", e))?),
    )
    .fullscreen(false)
    .inner_size(screen_w as f64, screen_h as f64)
    .position(screen_x as f64, screen_y as f64)
    .decorations(false)
    .transparent(true)
    .always_on_bottom(true)
    .skip_taskbar(true)
    .disable_drag_drop_handler()
    .visible(false);

    let window = window_builder
        .build()
        .map_err(|e| format!("failed to build window: {}", e))?;

    // disable rounded corners and fix the white background
    super::helpers::fix_window_appearance(&window)?;

    // give the window a moment to initialize
    std::thread::sleep(std::time::Duration::from_millis(300));

    // get the native hwnd and inject it behind the desktop
    let raw_hwnd = window
        .hwnd()
        .map_err(|e| format!("failed to get hwnd: {}", e))?
        .0;
    let hwnd = HWND(raw_hwnd as _);

    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!(
        "got hwnd {:?}, injecting behind desktop at ({},{}) {}x{}",
        hwnd, screen_x, screen_y, screen_w, screen_h
    ));

    crate::platform::windows::os::shell_int::inject_behind_desktop(
        hwnd, screen_x, screen_y, screen_w, screen_h,
    )?;

    let _ = window.show();

    schedule_property_and_widget_injection(&window, wallpaper_info.properties, folder_path, &clean_id);

    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("web wallpaper active on {}", clean_id));

    WEB_PLAYER_LABELS.lock().unwrap().insert(
        clean_id.clone(),
        WebPlayerInfo {
            label,
            folder_path: folder_path.to_string(),
        },
    );
    // persist to state so it survives app restarts
    super::state::save_interactive_to_state(&resolved_id, folder_path);

    super::mouse::start_mouse_forwarder(app.clone());
    crate::platform::windows::interactive::media::start_media_forwarder(app.clone());
    crate::platform::windows::interactive::system::start_system_forwarder(app.clone());
    crate::platform::windows::interactive::audio::start_audio_forwarder(app.clone());

    Ok(())
}

fn reuse_existing_window(
    app: &AppHandle,
    existing_window: tauri::WebviewWindow,
    label: &str,
    file_url: &str,
    clean_id: &str,
    resolved_id: &str,
    folder_path: &str,
    properties: Option<HashMap<String, ColorWallProperty>>,
) -> Result<(), String> {
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(clean_id, &format!("reusing existing window for {}", clean_id));

    // clear widget injection tracking so widgets re-inject after navigation
    WIDGET_INJECTED.lock().unwrap().remove(label);

    let _ = existing_window
        .navigate(tauri::Url::parse(file_url).map_err(|e| format!("bad url: {}", e))?);
    let _ = existing_window.show();

    WEB_PLAYER_LABELS.lock().unwrap().insert(
        clean_id.to_string(),
        WebPlayerInfo {
            label: label.to_string(),
            folder_path: folder_path.to_string(),
        },
    );
    crate::platform::windows::interactive::media::PENDING_MEDIA_SYNC
        .lock()
        .unwrap()
        .push(label.to_string());
    super::mouse::start_mouse_forwarder(app.clone());
    crate::platform::windows::interactive::media::start_media_forwarder(app.clone());
    crate::platform::windows::interactive::system::start_system_forwarder(app.clone());
    crate::platform::windows::interactive::audio::start_audio_forwarder(app.clone());

    schedule_property_and_widget_injection(&existing_window, properties, folder_path, clean_id);

    // persist to state so it survives app restarts (was missing here!)
    super::state::save_interactive_to_state(resolved_id, folder_path);

    Ok(())
}

/// schedule property injection + widget injection after a short delay
fn schedule_property_and_widget_injection(
    window: &tauri::WebviewWindow,
    properties: Option<HashMap<String, ColorWallProperty>>,
    folder_path: &str,
    monitor_id: &str,
) {
    let mut js_injection = String::new();
    if let Some(properties) = properties {
        js_injection.push_str("setTimeout(() => { ");
        for (key, prop) in properties {
            if let Ok(value_str) = serde_json::to_string(&prop.value) {
                js_injection.push_str(&format!(
                    "if (typeof window.colorwallPropertyListener === 'function') window.colorwallPropertyListener('{}', {}); ",
                    key, value_str
                ));
            }
        }
        js_injection.push_str("}, 500);");
    }

    let win_clone = window.clone();
    let folder_for_widgets = folder_path.to_string();
    let monitor_id_clone = monitor_id.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if !js_injection.is_empty() {
            let _ = win_clone.eval(&js_injection);
        }
        // inject widgets after properties settle
        std::thread::sleep(std::time::Duration::from_millis(300));
        inject_widgets_into_window(&win_clone, &folder_for_widgets, &monitor_id_clone);
    });
}

/// inject the widget runtime + all configured widgets into a webview window
fn inject_widgets_into_window(window: &tauri::WebviewWindow, folder_path: &str, monitor_id: &str) {
    // guard against duplicate injection per window label
    let label = window.label();
    {
        let mut injected = WIDGET_INJECTED.lock().unwrap();
        if injected.contains(label) {
            println!("[interactive] widgets already injected for {}", label);
            return;
        }
        injected.insert(label.to_string());
    }
    match super::widgets::generate_widget_injection_js(folder_path, Some(monitor_id)) {
        Ok(js) if !js.is_empty() => {
            match window.eval(&js) {
                Ok(_) => {
                    println!("[interactive] widgets injected for {}", folder_path);
                    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", &format!("widgets injected for {}", folder_path));
                }
                Err(e) => println!("[interactive] failed to inject widgets: {}", e),
            }
        }
        Ok(_) => {
            // no widgets configured, still inject runtime for future use
            let runtime = super::widgets::WIDGET_RUNTIME_JS;
            let _ = window.eval(runtime);
            println!("[interactive] widget runtime injected (no widgets configured)");
        }
        Err(e) => println!("[interactive] widget payload error: {}", e),
    }

    // inject the real app version (from Cargo.toml) into the runtime
    if let Some(version) = option_env!("CARGO_PKG_VERSION") {
        if let Ok(version_json) = serde_json::to_string(version) {
            let _ = window.eval(format!(
                "if (typeof window.__cw_setAppVersion === 'function') window.__cw_setAppVersion({});",
                version_json
            ));
        }
    }
}

/// stop all interactive wallpaper players
pub fn stop_all_interactive_wallpapers(app: &AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let keys: Vec<String> = {
        let labels = WEB_PLAYER_LABELS.lock().unwrap();
        labels.keys().cloned().collect()
    };

    // Clean known trackers
    for monitor_id in keys {
        super::state::clean_interactive_webview(app, &monitor_id);
    }

    // Aggressively hunt down and kill ANY orphaned webviews starting with iw_
    for (label, window) in app.webview_windows() {
        if label.starts_with("iw_") {
            println!("[interactive] nuking orphan webview: {}", label);
            let _ = window.close();
            let _ = window.destroy();
        }
    }

    WIDGET_INJECTED.lock().unwrap().clear();

    println!("[interactive] all web wallpapers stopped");
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "all web wallpapers stopped cleanly");
    Ok(())
}

/// send a property update to a running interactive wallpaper via js eval
pub fn send_property_update(
    app: &AppHandle,
    monitor_id: &str,
    property_name: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    let clean_id = crate::core::ipc::sanitize_monitor_id(monitor_id);

    let info = {
        let labels = WEB_PLAYER_LABELS.lock().unwrap();
        labels
            .get(&clean_id)
            .cloned() // Clone to drop the lock immediately
            .ok_or_else(|| format!("no interactive wallpaper running on {}", clean_id))?
    };

    let window = app
        .get_webview_window(&info.label)
        .ok_or_else(|| format!("webview window {} not found", info.label))?;

    if let Ok(value_str) = serde_json::to_string(value) {
        let js = format!(
            "if (typeof window.colorwallPropertyListener === 'function') {{ window.colorwallPropertyListener('{}', {}); }}",
            property_name, value_str
        );

        window
            .eval(&js)
            .map_err(|e| format!("failed to eval js: {}", e))?;
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&clean_id, &format!("sent property update for {}", property_name));
    } else {
        return Err(format!(
            "failed to serialize value for property '{}'",
            property_name
        ));
    }

    Ok(())
}

/// check if any interactive wallpaper is currently running
pub fn is_interactive_active() -> bool {
    !WEB_PLAYER_LABELS.lock().unwrap().is_empty()
}

/// get list of monitors with active interactive wallpapers
pub fn get_active_interactive_monitors() -> Vec<String> {
    WEB_PLAYER_LABELS.lock().unwrap().keys().cloned().collect()
}