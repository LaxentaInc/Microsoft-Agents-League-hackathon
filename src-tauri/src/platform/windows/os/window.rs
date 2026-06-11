use super::os_version::get_windows_version;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT};
use windows::Win32::UI::WindowsAndMessaging::*;

/// # Safety
/// To satisfy clippy; Caller must ensure this is called from a valid Windows message loop context.
// #[allow(clippy::missing_safety_doc)]
pub unsafe fn create_player_window(width: i32, height: i32) -> Result<HWND, String> {
    let class_name = w!("WmfPlayerWindow");

    let wc = WNDCLASSW {
        lpfnWndProc: Some(wnd_proc),
        hInstance: HINSTANCE(std::ptr::null_mut()),
        lpszClassName: PCWSTR(class_name.as_ptr()),
        style: CS_HREDRAW | CS_VREDRAW,
        hbrBackground: windows::Win32::Graphics::Gdi::HBRUSH(1 as _),
        ..Default::default()
    };

    let _ = RegisterClassW(&wc);

    let win_ver = get_windows_version();
    let ex_style = if win_ver.is_windows_11() {
        WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_NOPARENTNOTIFY
    } else {
        WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_NOPARENTNOTIFY
    };

    let hwnd = CreateWindowExW(
        ex_style,
        class_name,
        w!("WMF Player"),
        WS_POPUP,
        0,
        0,
        width,
        height,
        None,
        None,
        None,
        None,
    )
    .map_err(|e| format!("CreateWindowExW failed: {}", e))?;

    if win_ver.is_windows_11() {
        SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)
            .map_err(|e| format!("SetLayeredWindowAttributes failed: {}", e))?;
    }

    let _ = SetWindowPos(
        hwnd,
        Some(HWND_BOTTOM),
        0,
        0,
        0,
        0,
        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_HIDEWINDOW,
    );

    Ok(hwnd)
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        WM_NCHITTEST => LRESULT(HTNOWHERE as isize),
        WM_SETCURSOR => LRESULT(1),
        WM_ACTIVATE => LRESULT(0),
        WM_SETFOCUS => LRESULT(0),
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let _hdc = BeginPaint(hwnd, &mut ps);
            let _ = EndPaint(hwnd, &ps);
            LRESULT(0)
        }
        WM_ERASEBKGND => LRESULT(1),
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
