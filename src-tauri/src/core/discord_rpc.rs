use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use lazy_static::lazy_static;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

lazy_static! {
    static ref DISCORD_TX: std::sync::Mutex<Option<mpsc::Sender<DiscordCommand>>> =
        std::sync::Mutex::new(None);
}

#[derive(Clone, Debug)]
pub struct DiscordActivity {
    pub title: String,
    pub details: String,
    pub is_video: bool,
}

#[derive(Clone, Debug)]
struct DiscordRpcSettings {
    enabled: bool,
    window_focused: bool,
    custom_status: Option<String>,
    custom_details: Option<String>,
}

impl Default for DiscordRpcSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            window_focused: true,
            custom_status: None,
            custom_details: None,
        }
    }
}

#[derive(Clone, Debug)]
enum DiscordCommand {
    SetActivity(DiscordActivity),
    UpdateSettings(DiscordRpcSettings),
    SetWindowFocus(bool),
}

const DISCORD_CLIENT_ID: &str = "1467464164703211743";

pub fn init_discord_rpc() {
    let (tx, rx) = mpsc::channel::<DiscordCommand>();
    
    if let Ok(mut guard) = DISCORD_TX.lock() {
        *guard = Some(tx);
    }

    thread::spawn(move || {
        let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);

        let mut connected = client.connect().is_ok();
        if connected {
            println!("[discord] Success connecting to Discord RPC");
        } else {
            println!("[discord] Discord not detected. Will retry in loop.");
        }

        let mut current_activity: Option<DiscordActivity> = None;
        let mut rpc_settings = DiscordRpcSettings::default();
        let mut force_update = true;

        loop {
            while let Ok(msg) = rx.try_recv() {
                match msg {
                    DiscordCommand::SetActivity(activity) => {
                        current_activity = Some(activity);
                        force_update = true;
                    }
                    DiscordCommand::UpdateSettings(settings) => {
                        rpc_settings = settings;
                        force_update = true;
                    }
                    DiscordCommand::SetWindowFocus(focused) => {
                        rpc_settings.window_focused = focused;
                        force_update = true;
                    }
                }
            }

            if !connected {
                // The underlying discord-rich-presence crate poisons its socket permanently on drop.
                // We MUST instantiate a new client instance rather than calling .connect() on the dead one.
                let mut new_client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
                if new_client.connect().is_ok() {
                    println!("[discord] Connected to Discord RPC successfully!");
                    client = new_client;
                    connected = true;
                    force_update = true;
                }
            }

            if connected && force_update {
                if !rpc_settings.enabled || !rpc_settings.window_focused {
                    if let Err(e) = client.clear_activity() {
                        eprintln!("[discord] Failed to clear activity: {}", e);
                        connected = false;
                    } else {
                        force_update = false;
                    }
                    thread::sleep(Duration::from_secs(2));
                    continue;
                }

                if let Some(ref activity_info) = current_activity {
                    let clean_title = activity_info.title
                        .replace(".mp4", "")
                        .replace(".webm", "")
                        .replace(".mkv", "")
                        .replace(".gif", "")
                        .replace(".jpg", "")
                        .replace(".png", "")
                        .replace("_", " ");

                    let custom_status = rpc_settings
                        .custom_status
                        .as_ref()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let custom_details = rpc_settings
                        .custom_details
                        .as_ref()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());

                    let details_line = custom_status.unwrap_or(clean_title);
                    let state_line = custom_details.unwrap_or_else(|| {
                        if activity_info.is_video {
                            "Animated Wallpaper".to_string()
                        } else {
                            "Static Wallpaper".to_string()
                        }
                    });
                    
                    let activity = activity::Activity::new()
                        .activity_type(activity::ActivityType::Competing)
                        .state(&state_line)
                        .details(&details_line)
                        .assets(
                            activity::Assets::new()
                                .large_image("icon")
                                .large_text("ColorWall"),
                        )
                        .timestamps(
                            activity::Timestamps::new().start(
                                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
                            )
                        )
                        .buttons(vec![
                            activity::Button::new("Get ColorWall", "https://colorwall.xyz/")
                        ]);

                    if let Err(e) = client.set_activity(activity) {
                        eprintln!("[discord] Failed to set activity, connection might be dead: {}", e);
                        connected = false;
                    } else {
                        println!("[discord] Activity updated successfully!");
                        force_update = false;
                    }
                } else {
                    let custom_status = rpc_settings
                        .custom_status
                        .as_ref()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let custom_details = rpc_settings
                        .custom_details
                        .as_ref()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let activity = activity::Activity::new()
                        .activity_type(activity::ActivityType::Competing)
                        .state(custom_details.as_deref().unwrap_or("Idle / Browsing catalog"))
                        .details(custom_status.as_deref().unwrap_or("ColorWall"))
                        .assets(
                            activity::Assets::new()
                                .large_image("icon")
                                .large_text("ColorWall"),
                        )
                        .buttons(vec![
                            activity::Button::new("Get ColorWall", "https://colorwall.xyz/")
                        ]);
                    if let Err(e) = client.set_activity(activity) {
                        eprintln!("[discord] Failed to set idle activity: {}", e);
                        connected = false;
                    } else {
                        println!("[discord] Idle activity updated successfully!");
                        force_update = false;
                    }
                }
            }

            thread::sleep(Duration::from_secs(2));
        }
    });
}

pub fn update_presence(title: String, is_video: bool) {
    if let Ok(guard) = DISCORD_TX.lock() {
        if let Some(tx) = guard.as_ref() {
            let mut display_title = title;
            if display_title.is_empty() {
                display_title = "Unknown Wallpaper".to_string();
            }
            
            let _ = tx.send(DiscordCommand::SetActivity(DiscordActivity {
                title: display_title,
                details: "".to_string(),
                is_video,
            }));
        }
    }
}

pub fn clear_presence() {
    if let Ok(guard) = DISCORD_TX.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCommand::SetActivity(DiscordActivity {
                title: "ColorWall - Wallpaper Engine".to_string(),
                details: "Idle".to_string(),
                is_video: false,
            }));
        }
    }
}

pub fn apply_settings(
    enabled: bool,
    custom_status: Option<String>,
    custom_details: Option<String>,
) {
    if let Ok(guard) = DISCORD_TX.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCommand::UpdateSettings(DiscordRpcSettings {
                enabled,
                window_focused: true,
                custom_status,
                custom_details,
            }));
        }
    }
}

pub fn set_window_focus(focused: bool) {
    if let Ok(guard) = DISCORD_TX.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(DiscordCommand::SetWindowFocus(focused));
        }
    }
}
