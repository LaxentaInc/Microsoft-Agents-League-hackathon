// import + patching — handles importing interactive wallpaper folders
// into the library and patching lively-specific callbacks to colorwall equivalents

use super::scanner::get_interactive_dir;

/// import an interactive wallpaper folder into the library
/// copies the entire folder into appdata/colorwall/interactive/
pub fn import_interactive_folder(source_path: &str) -> Result<String, String> {
    let source = std::path::Path::new(source_path);
    if !source.is_dir() {
        return Err("source path is not a directory".to_string());
    }

    // make sure it has something we can render
    let info = super::scanner::scan_folder(source)
        .ok_or("folder doesn't contain any renderable content (no html file found)")?;

    let dest_dir = get_interactive_dir()?;
    let folder_name = source
        .file_name()
        .ok_or("invalid folder name")?
        .to_string_lossy()
        .to_string();

    let dest_path = dest_dir.join(&folder_name);

    // if it already exists, don't overwrite - just return the existing one
    if dest_path.exists() {
        println!("[interactive] folder already imported: {}", folder_name);
        crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", &format!("folder already imported skip: {}", folder_name));
        return Ok(dest_path.to_string_lossy().to_string());
    }

    // copy the entire folder recursively
    super::helpers::copy_dir_recursive(source, &dest_path)
        .map_err(|e| format!("failed to copy folder: {}", e))?;

    println!("[interactive] imported {} ({:?})", info.name, info.format);
    crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", &format!("imported {} successfully", info.name));

    // patch downloaded scripts permanently
    patch_interactive_files(&dest_path);

    Ok(dest_path.to_string_lossy().to_string())
}

/// recursively patches `.js` and `.html` files, converting lively specific callbacks
/// to colorwall equivalents so the backend js remains clean
pub fn patch_interactive_files(dir_path: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                patch_interactive_files(&path);
            } else if let Some(ext) = path.extension() {
                if ext == "js" || ext == "html" {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let mut modified = false;
                        let mut new_content = content;

                        let replacements = [
                            ("livelyPropertyListener", "colorwallPropertyListener"),
                            ("livelyCurrentTrack", "colorwallCurrentTrack"),
                            ("livelyAudioListener", "colorwallAudioListener"),
                            (
                                "livelyWallpaperPlaybackChanged",
                                "colorwallWallpaperPlaybackChanged",
                            ),
                            ("livelySystemInformation", "colorwallSystemInformation"),
                        ];

                        for (old, new) in replacements.iter() {
                            if new_content.contains(old) {
                                new_content = new_content.replace(old, new);
                                modified = true;
                            }
                        }

                        if modified {
                            let _ = std::fs::write(&path, new_content);
                            println!("[interactive] patched source file: {:?}", path);
                            crate::platform::windows::interactive::diagnostics::InteractiveDiagnostics::log("global", "patched interactive source string configs");
                        }
                    }
                }
            }
        }
    }
}
