use windows::Win32::Foundation::HWND;

type InjectFn = unsafe extern "C" fn(isize, i32, i32, i32, i32) -> i32;

fn find_dll() -> Result<std::path::PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("failed to get exe path: {}", e))?
        .parent()
        .ok_or("failed to get exe directory")?
        .to_path_buf();

    let dll_path = exe_dir.join("colorwall-shell.dll");

    if dll_path.exists() {
        return Ok(dll_path);
    }

    println!("[shell_int] dll not found locally, downloading...");
    crate::core::plugins::ensure_plugin_binary("colorwall-shell.dll")
}

pub fn inject_behind_desktop(
    hwnd: HWND,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    println!(
        "[shell_int] inject_behind_desktop called: hwnd={:?} pos=({},{}) size={}x{}",
        hwnd, x, y, width, height
    );

    let dll_path = find_dll()?;

    let lib = unsafe { libloading::Library::new(&dll_path) }
        .map_err(|e| format!("failed to load colorwall-shell.dll: {}", e))?;

    let func: libloading::Symbol<InjectFn> = unsafe { lib.get(b"cw_inject_behind_desktop") }
        .map_err(|e| format!("symbol cw_inject_behind_desktop not found: {}", e))?;

    let result = unsafe { func(hwnd.0 as isize, x, y, width, height) };

    if result == 0 {
        println!("[shell_int] injection succeeded via dll");
        Ok(())
    } else {
        Err(format!("shell injection failed (dll returned {})", result))
    }
}
