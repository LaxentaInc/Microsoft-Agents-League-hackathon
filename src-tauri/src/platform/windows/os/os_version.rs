use std::sync::OnceLock;

static OS_VERSION: OnceLock<WindowsVersion> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowsVersion {
    Windows10,
    Windows11Pre24H2,
    Windows1124H2Plus,
    Unknown,
}

impl WindowsVersion {
    pub fn is_windows_11_24h2_plus(&self) -> bool {
        matches!(self, WindowsVersion::Windows1124H2Plus)
    }

    pub fn is_windows_11(&self) -> bool {
        matches!(
            self,
            WindowsVersion::Windows11Pre24H2 | WindowsVersion::Windows1124H2Plus
        )
    }

    #[allow(dead_code)]
    pub fn is_windows_10(&self) -> bool {
        matches!(self, WindowsVersion::Windows10)
    }
}

pub fn get_windows_version() -> WindowsVersion {
    *OS_VERSION.get_or_init(detect_windows_version)
}

fn detect_windows_version() -> WindowsVersion {
    unsafe {
        use windows::Win32::System::SystemInformation::OSVERSIONINFOEXW;

        let mut version_info: OSVERSIONINFOEXW = std::mem::zeroed();
        version_info.dwOSVersionInfoSize = std::mem::size_of::<OSVERSIONINFOEXW>() as u32;

        type RtlGetVersion = unsafe extern "system" fn(*mut OSVERSIONINFOEXW) -> i32;

        if let Ok(ntdll) = windows::Win32::System::LibraryLoader::LoadLibraryW(windows::core::w!("ntdll.dll")) {
            if let Some(proc_addr) = windows::Win32::System::LibraryLoader::GetProcAddress(
                ntdll,
                windows::core::s!("RtlGetVersion"),
            ) {
                let rtl_get_version: RtlGetVersion = std::mem::transmute(proc_addr);
                let status = rtl_get_version(&mut version_info);

                if status == 0 {
                    let build = version_info.dwBuildNumber;
                    let major = version_info.dwMajorVersion;

                    return match (major, build) {
                        (10, b) if b >= 26100 => WindowsVersion::Windows1124H2Plus,
                        (10, b) if b >= 22000 => WindowsVersion::Windows11Pre24H2,
                        (10, _) => WindowsVersion::Windows10,
                        _ => WindowsVersion::Unknown,
                    };
                }
            }
        }

        WindowsVersion::Unknown
    }
}

pub fn get_windows_build_number() -> u32 {
    unsafe {
        use windows::Win32::System::SystemInformation::OSVERSIONINFOEXW;

        let mut version_info: OSVERSIONINFOEXW = std::mem::zeroed();
        version_info.dwOSVersionInfoSize = std::mem::size_of::<OSVERSIONINFOEXW>() as u32;

        type RtlGetVersion = unsafe extern "system" fn(*mut OSVERSIONINFOEXW) -> i32;

        if let Ok(ntdll) = windows::Win32::System::LibraryLoader::LoadLibraryW(windows::core::w!("ntdll.dll")) {
            if let Some(proc_addr) = windows::Win32::System::LibraryLoader::GetProcAddress(
                ntdll,
                windows::core::s!("RtlGetVersion"),
            ) {
                let rtl_get_version: RtlGetVersion = std::mem::transmute(proc_addr);
                let status = rtl_get_version(&mut version_info as *mut OSVERSIONINFOEXW);

                if status == 0 {
                    return version_info.dwBuildNumber;
                }
            }
        }

        0
    }
}
