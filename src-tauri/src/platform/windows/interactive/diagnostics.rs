// runtime diagnostics for the interactive player to debug ykyk
// generates a dedicated txt file on the desktop each time a wallpaper is set
//
// NOTE: the desktop location is intentional, NOT a bug.
// these files need to be immediately visible so users can find and share them
// for debugging without navigating to hidden appdata folders. the diagnostic
// file appearing on the desktop is the fastest way to surface issues with
// interactive wallpapers in the field. do not move these to appdata.

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Instant;

lazy_static::lazy_static! {
    static ref LOGGERS: Mutex<std::collections::HashMap<String, Arc<InteractiveDiagnostics>>> = Mutex::new(std::collections::HashMap::new());
}

pub struct InteractiveDiagnostics {
    writer: Mutex<Option<std::io::BufWriter<std::fs::File>>>,
    start: Instant,
    _path: Mutex<String>,
}

impl InteractiveDiagnostics {
    pub fn init_for_monitor(monitor_id: &str, folder_path: &str) -> Arc<Self> {
        let (writer, path_str) = if let Ok(profile) = std::env::var("USERPROFILE") {
            let mut base_path = std::path::PathBuf::from(&profile);
            let onedrive_desktop = base_path.join("OneDrive").join("Desktop");
            if onedrive_desktop.exists() {
                base_path = onedrive_desktop;
            } else {
                base_path = base_path.join("Desktop");
            }
            let path = base_path.join(format!("interactive-diagnostics-{}.txt", monitor_id));

            truncate_to_last_sessions(&path, 2);

            match std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
            {
                Ok(f) => (
                    Some(std::io::BufWriter::new(f)),
                    path.display().to_string(),
                ),
                Err(e) => {
                    println!("[interactive-diag] failed to create diagnostics file: {}", e);
                    (None, String::new())
                }
            }
        } else {
            (None, String::new())
        };

        let diag = Arc::new(Self {
            writer: Mutex::new(writer),
            start: Instant::now(),
            _path: Mutex::new(path_str.clone()),
        });

        diag.raw("\n\n");
        diag.raw("================================================================================\n");
        diag.raw(&format!("  NEW INTERACTIVE SESSION - {}\n", chrono_timestamp()));
        diag.raw("================================================================================\n\n");
        diag.log_msg(&format!("file: {}", path_str));
        diag.log_msg(&format!("monitor: {}", monitor_id));
        diag.log_msg(&format!("folder: {}", folder_path));
        diag.raw("\n--- timeline ---\n\n");

        let mut loggers = LOGGERS.lock().unwrap();
        loggers.insert(monitor_id.to_string(), diag.clone());

        diag
    }

    pub fn get_logger(monitor_id: &str) -> Option<Arc<Self>> {
        let loggers = LOGGERS.lock().unwrap();
        loggers.get(monitor_id).cloned()
    }

    pub fn log(monitor_id: &str, msg: &str) {
        if let Some(logger) = Self::get_logger(monitor_id) {
            logger.log_msg(msg);
        } else {
            // Fallback to simple print if logger isn't initialized yet
            println!("[interactive|{}] {}", monitor_id, msg);
        }
    }

    pub fn log_msg(&self, msg: &str) {
        let elapsed = self.start.elapsed();
        let line = format!("[{:>9.3}s] {}\n", elapsed.as_secs_f64(), msg);
        print!("[interactive-diag] {}", line);
        if let Ok(mut guard) = self.writer.lock() {
            if let Some(ref mut w) = *guard {
                let _ = w.write_all(line.as_bytes());
                let _ = w.flush();
            }
        }
    }

    pub fn raw(&self, text: &str) {
        if let Ok(mut guard) = self.writer.lock() {
            if let Some(ref mut w) = *guard {
                let _ = w.write_all(text.as_bytes());
                let _ = w.flush();
            }
        }
    }

    /// remove the logger for a monitor, closing its file handle and freeing memory.
    /// call this when an interactive wallpaper is stopped to prevent accumulation.
    pub fn cleanup_for_monitor(monitor_id: &str) {
        let mut loggers = LOGGERS.lock().unwrap();
        if loggers.remove(monitor_id).is_some() {
            println!("[interactive-diag] cleaned up logger for {}", monitor_id);
        }
    }
}

fn chrono_timestamp() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs % 86400) / 3600;
    let mins = (secs % 3600) / 60;
    let s = secs % 60;
    format!("UTC {:02}:{:02}:{:02}", hours, mins, s)
}

fn truncate_to_last_sessions(path: &std::path::Path, max_sessions: usize) {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let separator = "================================================================================";
    let sessions: Vec<&str> = content.split("NEW INTERACTIVE SESSION").collect();
    if sessions.len() <= max_sessions + 1 {
        return;
    }
    let keep_from = sessions.len() - max_sessions;
    let mut result = String::new();
    for (i, session) in sessions.iter().enumerate() {
        if i >= keep_from {
            if i > keep_from {
                result.push_str("NEW INTERACTIVE SESSION");
            }
            if i == keep_from {
                result.push_str(&format!("\n\n{}\n  NEW INTERACTIVE SESSION", separator));
            }
            result.push_str(session);
        }
    }
    let _ = std::fs::write(path, result);
}
