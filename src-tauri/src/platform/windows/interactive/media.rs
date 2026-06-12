use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
use windows::Storage::Streams::DataReader;

lazy_static::lazy_static! {
    static ref MEDIA_FORWARDER_ACTIVE: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    pub static ref PENDING_MEDIA_SYNC: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
}

#[derive(serde::Serialize)]
struct MediaTrackData {
    #[serde(rename = "Title")]
    title: String,
    #[serde(rename = "Artist")]
    artist: String,
    #[serde(rename = "Thumbnail")]
    thumbnail: Option<String>,
}

pub fn start_media_forwarder(app: AppHandle) {
    if MEDIA_FORWARDER_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    std::thread::spawn(move || {
        println!("[interactive_media] media forwarder started");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "media forwarder started");

        let mut last_title = String::new();
        let mut last_artist = String::new();
        let mut is_playing = false;
        let mut last_js = "if (typeof window.colorwallCurrentTrack === 'function') { window.colorwallCurrentTrack(\"null\"); }".to_string();
        let mut last_js_playback = "if (typeof window.colorwallWallpaperPlaybackChanged === 'function') { window.colorwallWallpaperPlaybackChanged('{\"IsPaused\":true}'); }".to_string();
        let mut synced_labels = std::collections::HashSet::new();

        loop {
            // collect labels from both scene webviews and widget host windows
            let labels: Vec<String> = {
                let scene_labels: Vec<String> = {
                    let map = crate::platform::windows::interactive::player::WEB_PLAYER_LABELS
                        .lock()
                        .unwrap();
                    map.values().map(|info| info.label.clone()).collect()
                };
                let host_labels = super::widget_host::get_host_labels();
                let mut all = scene_labels;
                all.extend(host_labels);
                all
            };

            // stop if nothing is running
            if labels.is_empty() {
                break;
            }

            // poll windows media
            let mut current_title = String::new();
            let mut current_artist = String::new();
            let mut currently_playing = false;
            let mut thumbnail_b64: Option<String> = None;

            if let Ok(manager) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .and_then(|r| r.get())
            {
                if let Ok(session) = manager.GetCurrentSession() {
                    if let Ok(info) = session.GetPlaybackInfo() {
                        if let Ok(status) = info.PlaybackStatus() {
                            currently_playing = status == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
                        }
                    }

                    if let Ok(props) = session.TryGetMediaPropertiesAsync().and_then(|r| r.get()) {
                        current_title = props.Title().unwrap_or_default().to_string_lossy();
                        current_artist = props.Artist().unwrap_or_default().to_string_lossy();

                        // only fetch thumbnail if track changed, it's slow
                        if current_title != last_title || current_artist != last_artist {
                            if let Ok(thumb_ref) = props.Thumbnail() {
                                if let Ok(stream) = thumb_ref.OpenReadAsync().and_then(|r| r.get())
                                {
                                    if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                        let size = stream.Size().unwrap_or(0) as u32;
                                        if size > 0
                                            && reader.LoadAsync(size).and_then(|r| r.get()).is_ok()
                                        {
                                            let mut bytes = vec![0u8; size as usize];
                                            if reader.ReadBytes(&mut bytes).is_ok() {
                                                // write thumbnail to a temp file instead of base64
                                                // encoding it. this avoids duplicating a ~70kb
                                                // string in every webview's v8 heap via eval.
                                                if let Ok(app_dir) = crate::data::storage::get_app_data_dir() {
                                                    let thumb_path = app_dir.join("media_thumb.jpg");
                                                    if std::fs::write(&thumb_path, &bytes).is_ok() {
                                                        let path_str = thumb_path.to_string_lossy().replace('\\', "/");
                                                        thumbnail_b64 = Some(format!(
                                                            "http://asset.localhost/{}",
                                                            path_str
                                                        ));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let state_changed = current_title != last_title
                || current_artist != last_artist
                || currently_playing != is_playing;
            let current_labels_set: std::collections::HashSet<String> =
                labels.iter().cloned().collect();
            let new_labels: Vec<String> = labels
                .iter()
                .filter(|l| !synced_labels.contains(*l))
                .cloned()
                .collect();

            if state_changed {
                let payload = if currently_playing && !current_title.is_empty() {
                    let data = MediaTrackData {
                        title: current_title.clone(),
                        artist: current_artist.clone(),
                        thumbnail: thumbnail_b64,
                    };
                    serde_json::to_string(&data).unwrap_or_else(|_| "null".to_string())
                } else {
                    "null".to_string()
                };

                // to safely pass stringified JSON inside a JS eval, we serialize the JSON string itself into a JS string literal.
                let js_string_literal =
                    serde_json::to_string(&payload).unwrap_or_else(|_| "\"null\"".to_string());

                last_js = format!(
                    "if (typeof window.colorwallCurrentTrack === 'function') {{ window.colorwallCurrentTrack({}); }}",
                    js_string_literal
                );

                last_js_playback = format!(
                    "if (typeof window.colorwallWallpaperPlaybackChanged === 'function') {{ window.colorwallWallpaperPlaybackChanged('{{\"IsPaused\":{}}}'); }}",
                    !currently_playing
                );

                // dispatch to all currently active labels
                for label in &labels {
                    if let Some(window) = app.get_webview_window(label) {
                        let _ = window.eval(&last_js);
                        let _ = window.eval(&last_js_playback);
                    }
                }

                last_title = current_title;
                last_artist = current_artist;
                is_playing = currently_playing;
                synced_labels = current_labels_set;
            } else if !new_labels.is_empty() {
                // state hasn't changed, but there are new wallpapers that need the current state
                for label in &new_labels {
                    if let Some(window) = app.get_webview_window(label) {
                        let delay_js = format!("setTimeout(() => {{ {} }}, 500);", last_js);
                        let delay_pb =
                            format!("setTimeout(() => {{ {} }}, 500);", last_js_playback);
                        let _ = window.eval(&delay_js);
                        let _ = window.eval(&delay_pb);
                    }
                }
                synced_labels = current_labels_set;
            } else {
                let mut force_sync_labels = Vec::new();
                {
                    let mut pending = PENDING_MEDIA_SYNC.lock().unwrap();
                    if !pending.is_empty() {
                        force_sync_labels = pending.clone();
                        pending.clear();
                    }
                }

                if !force_sync_labels.is_empty() {
                    for label in &force_sync_labels {
                        if let Some(window) = app.get_webview_window(label) {
                            let delay_js = format!("setTimeout(() => {{ {} }}, 500);", last_js);
                            let delay_pb =
                                format!("setTimeout(() => {{ {} }}, 500);", last_js_playback);
                            let _ = window.eval(&delay_js);
                            let _ = window.eval(&delay_pb);
                        }
                    }
                }

                // keep synced labels perfectly synchronized with active labels (handles closed windows)
                synced_labels = current_labels_set;
            }

            // poll every second
            std::thread::sleep(std::time::Duration::from_secs(1));
        }

        MEDIA_FORWARDER_ACTIVE.store(false, Ordering::Relaxed);
        println!("[interactive_media] media forwarder stopped");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "media forwarder stopped");
    });
}
