# OS Subsystem

This module (`src/platform/windows/os/`) contains foundational, OS-level REUSABLE utilities and bridging logic for interacting directly with the Windows API, that i figured out long time ago. 

It is designed to be completely agnostic of any particular rendering engine. Any generalized desktop window manipulation should go here.

## Core Components:
- **`monitors.rs`**: Robust Win32 multi-monitor enumeration and bounding resolution. Used to determine the exact coordinates of where wallpapers and widgets should span.
- **`shell_int.rs`**: The core shell injection logic. It leverages the undocumented `Progman` -> `WorkerW` hack to place custom windows permanently behind desktop icons but above the desktop wallpaper.
- **`widget_shell.rs`**: Specialized z-order manipulation for transparent widgets. Instead of full injection (which breaks Webview2 compositing), it dynamically forces windows below the `WorkerW` icons layer. I love i figured this out of the blue while working for the agent's league!
- **`window.rs`**: Generic factory for creating headless, borderless Win32 windows ready for injection or D3D11 rendering.
- **`taskbar.rs`**: Utilities to manipulate taskbar transparency and visibility states.
- **`os_version.rs`**: Win32 version checkers (e.g. separating Windows 10 vs Windows 11 behaviors for window layering).
- **`windows_startup.rs`**: Registry manipulation to allow the wallpaper engine to start quietly on boot.
