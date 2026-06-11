// these binaries (wallpaper-player.exe, colorwall-shell.dll) are precompiled and are plugins i made seperately!

use std::path::{Path, PathBuf};

const RELEASE_BASE_URL: &str =
    "https://github.com/LaxentaInc/LaxentaInc/releases/download/1";

/// list of rendering plugin binaries that need to be present
const PLUGIN_BINARIES: &[&str] = &[
    "wallpaper-player.exe",
];

/// get the directory where plugin binaries should live (next to the main exe)
pub fn get_plugins_dir() -> Result<PathBuf, String> {
    let exe_path =
        std::env::current_exe().map_err(|e| format!("failed to get current exe path: {}", e))?;
    exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed to get exe directory".to_string())
}

/// ensure a specific plugin binary exists, downloading it if missing
pub fn ensure_plugin_binary(binary_name: &str) -> Result<PathBuf, String> {
    let dir = get_plugins_dir()?;
    let binary_path = dir.join(binary_name);

    if binary_path.exists() {
        return Ok(binary_path);
    }

    println!(
        "[plugins] {} not found, downloading from release...",
        binary_name
    );

    download_binary(binary_name, &binary_path)?;

    Ok(binary_path)
}

/// download all plugin binaries that are missing
pub fn ensure_all_plugins() -> Result<(), String> {
    let dir = get_plugins_dir()?;

    for binary_name in PLUGIN_BINARIES {
        let binary_path = dir.join(binary_name);
        if !binary_path.exists() {
            println!(
                "[plugins] {} missing, downloading...",
                binary_name
            );
            download_binary(binary_name, &binary_path)?;
        }
    }

    println!("[plugins] all rendering plugins present");
    Ok(())
}

/// download a binary from the github release
/// runs on a dedicated os thread to avoid tokio runtime conflicts
fn download_binary(binary_name: &str, dest: &Path) -> Result<(), String> {
    let url = format!("{}/{}", RELEASE_BASE_URL, binary_name);
    let dest = dest.to_path_buf();
    let name = binary_name.to_string();

    println!("[plugins] downloading {} from {}", name, url);

    // spawn on a separate os thread because reqwest::blocking creates its own
    // tokio runtime internally, which panics if called from within tauri's
    // existing async runtime ("cannot drop a runtime in a context where
    // blocking is not allowed")
    let handle = std::thread::spawn(move || -> Result<(), String> {
        let response = reqwest::blocking::Client::new()
            .get(&url)
            .header("User-Agent", "ColorWall")
            .send()
            .map_err(|e| format!("failed to download {}: {}", name, e))?;

        if !response.status().is_success() {
            return Err(format!(
                "failed to download {} (HTTP {})",
                name,
                response.status()
            ));
        }

        let bytes = response
            .bytes()
            .map_err(|e| format!("failed to read response for {}: {}", name, e))?;

        // write to a temp file first, then rename (atomic-ish on windows)
        let temp_path = dest.with_extension("tmp");
        std::fs::write(&temp_path, &bytes)
            .map_err(|e| format!("failed to write {}: {}", name, e))?;

        std::fs::rename(&temp_path, &dest)
            .map_err(|e| format!("failed to rename {}: {}", name, e))?;

        println!(
            "[plugins] downloaded {} ({:.2} MB)",
            name,
            bytes.len() as f64 / 1_048_576.0
        );

        Ok(())
    });

    handle
        .join()
        .map_err(|_| format!("download thread panicked for {}", binary_name))?
}

