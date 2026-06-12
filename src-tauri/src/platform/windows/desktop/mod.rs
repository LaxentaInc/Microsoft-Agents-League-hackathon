// desktop module — only the wallpaper semaphore is actively used
// the rest of the shell injection logic lives in shell_int.rs (used by wallpaper-player.exe)

use std::sync::Arc;
use tokio::sync::Semaphore;

lazy_static::lazy_static! {
    pub static ref WALLPAPER_SEMAPHORE: Arc<Semaphore> = Arc::new(Semaphore::new(1));
}
