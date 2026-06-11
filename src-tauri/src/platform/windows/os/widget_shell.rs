// widget overlay z-order manager, positions the widget host window
// between the desktop icons and the video wallpaper WITHOUT reparenting.
//
// the previous approach (SetParent into WorkerW) broke webview2's
// directcomposition transparency chain → fully black window.
//
// this approach keeps the widget host as a regular top-level window
// and uses z-order positioning to slot it between:
//   [top]    WorkerW containing SHELLDLL_DefView (desktop icons)
//   [middle] widget host (our transparent webview)
//   [bottom] WorkerW target (contains the video player)
//
// since we never call SetParent, the webview2 transparency works natively.

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows_core::BOOL;

lazy_static::lazy_static! {
    /// active widget overlay entries that need z-order maintenance
    /// each entry is (widget_hwnd, icons_workerw_hwnd)
    static ref ACTIVE_OVERLAYS: Arc<Mutex<Vec<(isize, isize)>>> = Arc::new(Mutex::new(Vec::new()));

    /// flag to prevent spawning multiple z-order threads
    static ref ZORDER_THREAD_ACTIVE: Arc<std::sync::atomic::AtomicBool> =
        Arc::new(std::sync::atomic::AtomicBool::new(false));
}

/// position a widget host window between the desktop icons and the video wallpaper.
/// does NOT reparent — keeps the window top-level so webview2 transparency works.
pub fn inject_widget_overlay(
    hwnd: HWND,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    println!(
        "[widget_shell] injecting widget overlay (z-order mode): hwnd={:?} pos=({},{}) size={}x{}",
        hwnd, x, y, width, height
    );

    thread::sleep(Duration::from_millis(200));

    unsafe {
        // find progman
        let progman = FindWindowW(
            PCWSTR(windows::core::w!("Progman").as_ptr()),
            PCWSTR(windows::core::w!("Program Manager").as_ptr()),
        )
        .map_err(|e| format!("FindWindowW failed: {}", e))?;

        // send the magic message to ensure WorkerW structure exists
        let _ = SendMessageTimeoutW(
            progman,
            0x052C,
            WPARAM(0xD),
            LPARAM(0x1),
            SMTO_NORMAL,
            1000,
            None,
        );
        thread::sleep(Duration::from_millis(200));

        // find the WorkerW that contains SHELLDLL_DefView (the desktop icons layer)
        let icons_workerw = find_icons_workerw()?;
        println!("[widget_shell] found icons WorkerW: {:?}", icons_workerw);

        // strip decoration styles — we want a clean borderless window
        let mut style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        style &= !(WS_CAPTION.0 as isize);
        style &= !(WS_THICKFRAME.0 as isize);
        style &= !(WS_SYSMENU.0 as isize);
        style &= !(WS_MINIMIZEBOX.0 as isize);
        style &= !(WS_MAXIMIZEBOX.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_STYLE, style);

        // add WS_EX_TOOLWINDOW to hide from taskbar and alt-tab
        // add WS_EX_NOACTIVATE (0x08000000) to prevent the window from stealing focus
        // note: do NOT add WS_EX_TRANSPARENT — it doesn't work properly with webview2
        // (chromium intercepts input before win32 hit-testing) and blocks desktop interaction.
        // the widget is below the icons WorkerW in z-order, so clicks naturally
        // hit the desktop first without needing click-through.
        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        ex_style |= WS_EX_TOOLWINDOW.0 as isize;
        ex_style |= 0x08000000_isize; // WS_EX_NOACTIVATE
        // strip any edge styles
        ex_style &= !(WS_EX_CLIENTEDGE.0 as isize);
        ex_style &= !(WS_EX_WINDOWEDGE.0 as isize);
        ex_style &= !(WS_EX_DLGMODALFRAME.0 as isize);
        ex_style &= !(WS_EX_STATICEDGE.0 as isize);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);

        // position the widget host just BELOW the icons WorkerW in z-order.
        // SetWindowPos with hwndInsertAfter = icons_workerw means:
        //   "place this window right after (below) icons_workerw in z-order"
        // so the stacking becomes: icons → widget → video
        SetWindowPos(
            hwnd,
            Some(icons_workerw),
            x,
            y,
            width,
            height,
            SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
        )
        .map_err(|e| format!("SetWindowPos failed: {}", e))?;

        let _ = ShowWindow(hwnd, SW_SHOWNA);

        // verify final state
        let visible = IsWindowVisible(hwnd).as_bool();
        println!(
            "[widget_shell] overlay positioned via z-order: visible={} (icons_workerw={:?})",
            visible, icons_workerw
        );

        // register for z-order maintenance
        {
            let mut overlays = ACTIVE_OVERLAYS.lock().unwrap();
            let entry = (hwnd.0 as isize, icons_workerw.0 as isize);
            if !overlays.contains(&entry) {
                overlays.push(entry);
            }
        }

        // start the z-order maintenance thread if not already running
        start_zorder_maintenance();
    }

    Ok(())
}

/// remove a widget overlay from z-order maintenance (called when host is stopped)
pub fn unregister_overlay(hwnd: HWND) {
    let mut overlays = ACTIVE_OVERLAYS.lock().unwrap();
    let hwnd_val = hwnd.0 as isize;
    overlays.retain(|(h, _)| *h != hwnd_val);
}

/// background thread that periodically re-applies z-order positioning.
/// other windows or shell events can shuffle the z-order, so we
/// re-assert our position every 500ms.
fn start_zorder_maintenance() {
    use std::sync::atomic::Ordering;

    if ZORDER_THREAD_ACTIVE.load(Ordering::Relaxed) {
        return;
    }
    ZORDER_THREAD_ACTIVE.store(true, Ordering::Relaxed);

    thread::spawn(move || {
        println!("[widget_shell] z-order maintenance thread started");

        loop {
            // check less frequentl. 3s is plenty to catch z-order drift
            thread::sleep(Duration::from_millis(3000));

            let overlays = {
                let mut guard = ACTIVE_OVERLAYS.lock().unwrap();
                unsafe {
                    // hard-prune stale handles so the thread can fully stop when windows are gone
                    guard.retain(|(hwnd_val, workerw_val)| {
                        let hwnd = HWND(*hwnd_val as *mut _);
                        let workerw = HWND(*workerw_val as *mut _);
                        IsWindow(Some(hwnd)).as_bool() && IsWindow(Some(workerw)).as_bool()
                    });
                }
                if guard.is_empty() {
                    break;
                }
                guard.clone()
            };

            for (hwnd_val, icons_workerw_val) in &overlays {
                let hwnd = HWND(*hwnd_val as *mut _);
                let icons_workerw = HWND(*icons_workerw_val as *mut _);

                unsafe {
                    if IsWindowVisible(hwnd).as_bool() {
                        // only reposition if we've actually drifted ,check current z-order
                        // GetWindow(icons_workerw, GW_HWNDNEXT) returns the window directly below icons
                        // if that's already us, skip the SetWindowPos call entirely
                        let below_icons = GetWindow(icons_workerw, GW_HWNDNEXT);
                        if below_icons != Ok(hwnd) {
                            let _ = SetWindowPos(
                                hwnd,
                                Some(icons_workerw),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                            );
                        }
                    }
                }
            }
        }

        ZORDER_THREAD_ACTIVE.store(false, Ordering::Relaxed);
        println!("[widget_shell] z-order maintenance thread stopped");
    });
}

/// find the WorkerW window that CONTAINS SHELLDLL_DefView (the desktop icons)
unsafe fn find_icons_workerw() -> Result<HWND, String> {
    let mut icons_workerw: Option<HWND> = None;
    let ptr: *mut Option<HWND> = &mut icons_workerw;

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let defview = FindWindowExW(
            Some(hwnd),
            None,
            PCWSTR(windows::core::w!("SHELLDLL_DefView").as_ptr()),
            PCWSTR::null(),
        )
        .unwrap_or(HWND(std::ptr::null_mut()));

        if !defview.0.is_null() {
            // this WorkerW contains the desktop icons — this is the one we want
            let ptr = lparam.0 as *mut Option<HWND>;
            *ptr = Some(hwnd);
        }
        BOOL(1)
    }

    let _ = EnumWindows(Some(enum_callback), LPARAM(ptr as isize));

    icons_workerw.ok_or_else(|| {
        "icons WorkerW not found — shell may be heavily modified".to_string()
    })
}
