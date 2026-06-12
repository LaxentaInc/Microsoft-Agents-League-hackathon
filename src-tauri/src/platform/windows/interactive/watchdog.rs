// watchdog — periodically checks if any interactive webviews have died
// and respawns them up to a max retry count

use std::collections::HashMap;
use tauri::{AppHandle, Manager};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

lazy_static::lazy_static! {
    static ref WATCHDOG_ACTIVE: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

/// start the interactive watchdog to resurrect dead webviews
pub fn start_interactive_watchdog(app: AppHandle) {
    if WATCHDOG_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    std::thread::spawn(move || {
        println!("[watchdog] interactive watchdog started");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "interactive watchdog started");

        let mut crash_count: HashMap<String, u32> = HashMap::new();

        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));

            let mut dead_monitors: Vec<(String, String)> = Vec::new();

            {
                let labels = super::player::WEB_PLAYER_LABELS.lock().unwrap();
                if labels.is_empty() {
                    crash_count.clear();
                    continue;
                }

                for (monitor_id, info) in labels.iter() {
                    // check if window object exists
                    let is_dead = app.get_webview_window(&info.label).is_none();

                    if is_dead {
                        println!("[watchdog] interactive player on {} is missing", monitor_id);
                        dead_monitors.push((monitor_id.clone(), info.folder_path.clone()));
                    }
                }
            } // drop lock

            for (monitor_id, folder_path) in dead_monitors {
                let count = crash_count.entry(monitor_id.clone()).or_insert(0);
                *count += 1;

                if *count > 5 {
                    println!(
                        "[watchdog] interactive player on {} crashed too many times, giving up",
                        monitor_id
                    );
                    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&monitor_id, "watchdog gave up max retries");
                    let mut labels = super::player::WEB_PLAYER_LABELS.lock().unwrap();
                    labels.remove(&monitor_id);
                    continue;
                }

                println!(
                    "[watchdog] respawning interactive player on {} (attempt {}/5)",
                    monitor_id, count
                );
                crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log(&monitor_id, &format!("respawn attempt {}/5", count));

                // stop the old resources just in case
                super::state::clean_interactive_webview(&app, &monitor_id);
                // start a new one
                let _ = super::player::start_interactive_wallpaper(&app, &folder_path, Some(&monitor_id));

                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
    });
}
