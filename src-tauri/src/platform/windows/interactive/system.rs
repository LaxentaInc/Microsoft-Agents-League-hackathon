use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Networks, RefreshKind, System};
use tauri::{AppHandle, Manager};

lazy_static::lazy_static! {
    static ref SYSTEM_FORWARDER_ACTIVE: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

#[derive(serde::Serialize)]
#[allow(non_snake_case)]
struct SystemData {
    NameCpu: String,
    NameGpu: String,
    NameNetCard: String,
    TotalRam: u64,
    CurrentCpu: u32,
    CurrentGpu3D: u32,
    CurrentNetDown: u64,
    CurrentNetUp: u64,
    CurrentRamAvail: u64,
}

pub fn start_system_forwarder(app: AppHandle) {
    if SYSTEM_FORWARDER_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    std::thread::spawn(move || {
        println!("[interactive_system] system info forwarder started");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "system info forwarder started");

        let mut sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::new().with_cpu_usage())
                .with_memory(MemoryRefreshKind::everything()),
        );
        let mut networks = Networks::new_with_refreshed_list();

        // --- session-static values: fetch once and cache ---
        // these don't change during a wallpaper session, no point re-querying every 3s
        sys.refresh_cpu_specifics(CpuRefreshKind::new().with_cpu_usage());
        let cpu_name = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());

        // gpu name — mocked because real gpu usage queries (wmi/dxgi) are too
        // expensive for a hot loop and would eat more gpu than they measure
        let gpu_name = "Primary GPU".to_string();

        // total ram never changes during a session
        let total_ram_mb = sys.total_memory() / (1024 * 1024);

        // primary network card, pick the most active adapter once at startup.
        // if the user plugs in a different adapter mid-session they'd need to
        // restart the wallpaper, but that's an acceptable trade-off vs calling
        // refresh_list() (full adapter enumeration) every 3 seconds.
        networks.refresh();
        let primary_net_card = networks
            .iter()
            .max_by_key(|(_, net)| net.received() + net.transmitted())
            .map(|(name, _)| name.to_string())
            .unwrap_or_else(|| "Network".to_string());

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

            // --- dynamic values: refresh only what actually changes ---
            sys.refresh_cpu_specifics(CpuRefreshKind::new().with_cpu_usage());
            sys.refresh_memory();
            // only refresh counters on existing adapters — NOT refresh_list()
            // which would re-enumerate all system network interfaces every cycle
            networks.refresh();

            let global_cpu_usage = sys.global_cpu_usage();
            let avail_ram_mb = sys.available_memory() / (1024 * 1024);

            let mut total_down = 0u64;
            let mut total_up = 0u64;

            // sum all adapters for total throughput (cumulative bytes)
            for (_, net) in networks.iter() {
                total_down += net.received();
                total_up += net.transmitted();
            }

            let data = SystemData {
                NameCpu: cpu_name.clone(),
                NameGpu: gpu_name.clone(),
                NameNetCard: primary_net_card.clone(),
                TotalRam: total_ram_mb,
                CurrentCpu: global_cpu_usage.round() as u32,
                CurrentGpu3D: 0, // mocked — see gpu_name comment above
                CurrentNetDown: total_down,
                CurrentNetUp: total_up,
                CurrentRamAvail: avail_ram_mb,
            };

            let payload_json = serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string());
            let js_string_literal =
                serde_json::to_string(&payload_json).unwrap_or_else(|_| "\"{}\"".to_string());

            let js = format!(
                "if (typeof window.colorwallSystemInformation === 'function') {{ window.colorwallSystemInformation({}); }}",
                js_string_literal
            );

            // Dispatch to all currently active labels
            for label in &labels {
                if let Some(window) = app.get_webview_window(label) {
                    let _ = window.eval(&js);
                }
            }

            // poll every 3 seconds — widgets don't need sub-second system stats
            std::thread::sleep(std::time::Duration::from_secs(3));
        }

        SYSTEM_FORWARDER_ACTIVE.store(false, Ordering::Relaxed);
        println!("[interactive_system] system info forwarder stopped");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "system info forwarder stopped");
    });
}
