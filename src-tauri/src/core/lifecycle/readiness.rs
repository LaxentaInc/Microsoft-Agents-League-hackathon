use std::time::Instant;

lazy_static::lazy_static! {
    static ref READINESS_START_TIME: Instant = Instant::now();
}

#[derive(Debug, Default, Clone)]
pub struct SystemReadiness {
    pub is_ready: bool,
    pub screen_metrics_available: bool,
    pub progman_available: bool,
    pub sufficient_startup_delay: bool,
    pub time_since_startup_ms: u64,
}

pub fn check_system_readiness() -> SystemReadiness {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, GetSystemMetrics, SM_CXSCREEN};

    let mut readiness = SystemReadiness::default();

    // check 1: can we get screen metrics?
    unsafe {
        let screen_width = GetSystemMetrics(SM_CXSCREEN);
        readiness.screen_metrics_available = screen_width > 0;
    }

    // check 2: is progman (desktop) available?
    unsafe {
        let progman = FindWindowW(
            PCWSTR(windows::core::w!("Progman").as_ptr()),
            PCWSTR::null(),
        );
        readiness.progman_available = progman.is_ok() && !progman.unwrap().0.is_null();
    }

    // check 3: has enough time elapsed since startup?
    // after a power cut, the system might be slow to initialize
    readiness.time_since_startup_ms = READINESS_START_TIME.elapsed().as_millis() as u64;
    readiness.sufficient_startup_delay = readiness.time_since_startup_ms >= 3000;

    // overall readiness
    readiness.is_ready = readiness.screen_metrics_available
        && readiness.progman_available
        && readiness.sufficient_startup_delay;

    
    readiness
}



pub async fn wait_for_system_ready(max_wait_secs: u64) -> bool {
    
    let start = Instant::now();
    let mut delay_ms = 500;

    while start.elapsed().as_secs() < max_wait_secs {
        let readiness = check_system_readiness();

        if readiness.is_ready {
                        return true;
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        delay_ms = std::cmp::min(delay_ms * 2, 2000); // max 2 second delay
    }

    
    false
}
