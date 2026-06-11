note to self:
The files inside the folder are not used by the sidercar binary. 
DO not forget, you goldfish! check player_main.rs if you forget!

### ~~NEW IDEA -> UHHH instead of checking .is_null(), return an Option Option<HWND> ? for rust safety~~
~~WINDOWS UTILS.RS LINE 28~~
**DONE** — `get_progman()` and `get_worker_w()` now return `Option<HWND>`

### ~~RECHECK SHELL INT PLAYER MAIN to recheck enums and virtual dimension comparisons, holy shit i have to make notes now~~
**REVIEWED** — shell_int enums and virtual dimension comparisons look correct after audit


 we will add a "High Quality / HDR Mode" toggle in Tauri settings/uh front end. When enabled, destroy SwapChain and recreate it with DXGI_FORMAT_R16G16B16A16_FLOAT.

IMFAttributes you just spent an hour reading has MF_MEDIA_ENGINE_VIDEO_OUTPUT_FORMAT hardcoded to DXGI_FORMAT_B8G8R8A8_UNORM, so you'd need to destroy and recreate the entire media engine

// so engine.rs dimensions are genuinely just dead weight being passed around for no reason for WMF, dimensions from engine.rs → actually used in player mpv for the window size 
// fix the dead code issues and understand it clearly