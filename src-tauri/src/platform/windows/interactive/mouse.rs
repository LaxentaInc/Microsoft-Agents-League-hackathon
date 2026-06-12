// mouse position forwarder — polls cursor and left-button state,
// then injects synthetic mouse/pointer events into all active webviews
// so interactive wallpapers and widgets can react to the cursor.
// coordinates are converted from screen-space to viewport-local (client) space
// using each window's screen position, so elementFromPoint and drag work correctly.

use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

lazy_static::lazy_static! {
    /// flag to control the mouse forwarder thread
    static ref MOUSE_FORWARDER_ACTIVE: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

/// start a background thread that polls mouse position and forwards it to all active webview windows
/// injects a tiny js bridge function once, then just updates coordinates cheaply
pub fn start_mouse_forwarder(app: AppHandle) {
    // don't start if already running (atomic swap to prevent race)
    if MOUSE_FORWARDER_ACTIVE.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return;
    }

    std::thread::spawn(move || {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

        println!("[interactive] mouse forwarder started");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "mouse forwarder started");

        // the bridge js function we inject once per window.
        // receives screen-space coords (sx,sy) plus the window's screen origin (ox,oy)
        // and converts to viewport-local (client) coords before dispatching events.
        let bridge_js = r#"
            if (!window.__cw_mouse_bridge) {
                window.__cw_last_cx = 0;
                window.__cw_last_cy = 0;
                window.__cw_last_btn_state = false;
                window.__cw_mouse_bridge = function(sx, sy, ox, oy, scale_factor, btn_down, force_btn_event) {
                    var cx = (sx - ox) / scale_factor;
                    var cy = (sy - oy) / scale_factor;
                    var mx = cx - window.__cw_last_cx;
                    var my = cy - window.__cw_last_cy;
                    window.__cw_last_cx = cx;
                    window.__cw_last_cy = cy;
                    var state_changed = btn_down !== window.__cw_last_btn_state;
                    window.__cw_last_btn_state = btn_down;

                    var eventTypes = [];
                    if (mx !== 0 || my !== 0) eventTypes.push('move');
                    if (state_changed || force_btn_event) {
                        eventTypes.push(btn_down ? 'down' : 'up');
                    }

                    if (eventTypes.length === 0) return;

                    var opts = {
                        clientX: cx, clientY: cy,
                        pageX: cx, pageY: cy,
                        screenX: sx, screenY: sy,
                        offsetX: cx, offsetY: cy,
                        movementX: mx, movementY: my,
                        bubbles: true, cancelable: true,
                        pointerId: 1, pointerType: 'mouse', isPrimary: true,
                        button: btn_down ? 0 : -1,
                        buttons: btn_down ? 1 : 0
                    };
                    
                    // cache canvas list, refresh every 60 calls (~3 seconds at 20fps)
                    if (!window.__cw_canvas_cache || !window.__cw_canvas_tick || window.__cw_canvas_tick++ > 60) {
                        window.__cw_canvas_cache = document.querySelectorAll('canvas');
                        window.__cw_canvas_tick = 0;
                    }
                    var canvases = window.__cw_canvas_cache;

                    eventTypes.forEach(function(action) {
                        var e = new MouseEvent('mouse' + action, opts);
                        var pe = new PointerEvent('pointer' + action, opts);
                        
                        window.dispatchEvent(e);
                        window.dispatchEvent(pe);
                        document.dispatchEvent(e);
                        document.dispatchEvent(pe);
                        
                        if (document.body) {
                            document.body.dispatchEvent(e);
                            document.body.dispatchEvent(pe);
                        }
                        
                        for (var i = 0; i < canvases.length; i++) {
                            var r = canvases[i].getBoundingClientRect();
                            var co = {
                                clientX: cx, clientY: cy,
                                pageX: cx, pageY: cy,
                                screenX: sx, screenY: sy,
                                offsetX: cx - r.left, offsetY: cy - r.top,
                                movementX: mx, movementY: my,
                                bubbles: true, cancelable: true,
                                pointerId: 1, pointerType: 'mouse', isPrimary: true,
                                button: btn_down ? 0 : -1,
                                buttons: btn_down ? 1 : 0
                            };
                            var ce = new MouseEvent('mouse' + action, co);
                            var cpe = new PointerEvent('pointer' + action, co);
                            canvases[i].dispatchEvent(ce);
                            canvases[i].dispatchEvent(cpe);
                        }
                    });
                };
            }
        "#;

        let mut last_x = -1i32;
        let mut last_y = -1i32;
        let mut last_btn = false;
        let mut bridge_injected: HashSet<String> = HashSet::new();

        loop {
            let labels: Vec<String> = {
                let mut all_labels: Vec<String> = Vec::new();

                // collect interactive wallpaper labels
                let iw_map = super::player::WEB_PLAYER_LABELS.lock().unwrap();
                for info in iw_map.values() {
                    all_labels.push(info.label.clone());
                }

                // collect widget host labels
                let host_labels = super::widget_host::get_host_labels();
                all_labels.extend(host_labels);

                if all_labels.is_empty() {
                    break;
                }
                all_labels
            };

            // inject bridge on any new windows
            for label in &labels {
                if !bridge_injected.contains(label) {
                    if let Some(window) = app.get_webview_window(label) {
                        let _ = window.eval(bridge_js);
                        bridge_injected.insert(label.clone());
                    }
                }
            }

            // clean up stale entries
            bridge_injected.retain(|l| labels.contains(l));

            let mut point = POINT { x: 0, y: 0 };
            let btn_down;
            unsafe {
                let _ = GetCursorPos(&mut point);
                use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetDesktopWindow, GetShellWindow, GetClassNameW};
                
                let mut allow_click = true;
                let fg = GetForegroundWindow();
                if !fg.0.is_null() && fg != GetDesktopWindow() && fg != GetShellWindow() {
                    allow_click = false;
                    let mut class_name = [0u16; 256];
                    let len = GetClassNameW(fg, &mut class_name);
                    if len > 0 {
                        let name = String::from_utf16_lossy(&class_name[..len as usize]);
                        if name == "WorkerW" || name == "Progman" {
                            allow_click = true;
                        }
                    }
                }

                use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
                let raw_btn = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0;
                btn_down = raw_btn && allow_click;
            }

            let moved = point.x != last_x || point.y != last_y;
            let clicked = btn_down != last_btn;

            // only send if the cursor moved or the button state changed
            if moved || clicked {
                last_x = point.x;
                last_y = point.y;
                last_btn = btn_down;

                // forward to each window with its own screen offset so the bridge
                // can convert to viewport-local coordinates
                for label in &labels {
                    if let Some(window) = app.get_webview_window(label) {
                        // get the window's screen position for coordinate conversion
                        let (ox, oy) = window
                            .outer_position()
                            .map(|p| (p.x, p.y))
                            .unwrap_or((0, 0));
                        let scale_factor = window.scale_factor().unwrap_or(1.0);

                        let js = format!(
                            "if(window.__cw_mouse_bridge)window.__cw_mouse_bridge({},{},{},{},{},{},{})",
                            point.x, point.y, ox, oy, scale_factor, btn_down, clicked
                        );
                        let _ = window.eval(&js);
                    }
                }
            }

            // ~15fps polling — smooth enough for parallax/interaction, less eval overhead overnight
            std::thread::sleep(std::time::Duration::from_millis(66));
        }

        MOUSE_FORWARDER_ACTIVE.store(false, Ordering::Relaxed);
        println!("[interactive] mouse forwarder stopped");
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "mouse forwarder stopped");
    });
}
