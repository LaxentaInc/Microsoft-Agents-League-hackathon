fn main() {
    tauri_build::build();

    // copy colorwall-shell.dll next to the output binary so it can be loaded at runtime
    let out_dir = std::env::var("OUT_DIR").unwrap();
    // OUT_DIR is something like target/debug/build/wallpaperengine-xxx/out
    // we need to go up to target/debug/
    let target_dir = std::path::Path::new(&out_dir)
        .ancestors()
        .nth(3)
        .expect("failed to find target dir");

    let dll_src = std::path::Path::new("binaries/colorwall-shell.dll");
    let dll_dest = target_dir.join("colorwall-shell.dll");

    if dll_src.exists() {
        std::fs::copy(dll_src, &dll_dest).expect("failed to copy colorwall-shell.dll");
        println!("cargo:warning=copied colorwall-shell.dll to {:?}", dll_dest);
    }

    // re-run if the dll changes
    println!("cargo:rerun-if-changed=binaries/colorwall-shell.dll");
}
