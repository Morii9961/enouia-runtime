//! Select the UI v2 paper before Tauri creates either native window/webview.
use tauri::window::Color;
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};

pub fn apply(config: &mut tauri::Config) {
    // The same application-theme preference read by Tao's Windows theme path.
    // Missing/unreadable preferences keep Windows' default light appearance.
    let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let name: Vec<u16> = "AppsUseLightTheme".encode_utf16().chain(Some(0)).collect();
    let mut light = 1u32;
    let mut size = std::mem::size_of_val(&light) as u32;
    // SAFETY: NUL-terminated names and an aligned DWORD-sized output buffer.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut light as *mut u32).cast(),
            &mut size,
        )
    };
    let paper = if status == ERROR_SUCCESS && light == 0 {
        Color(0x0F, 0x1C, 0x23, 255)
    } else {
        Color(0xF1, 0xF0, 0xEB, 255)
    };
    for window in &mut config.app.windows {
        window.background_color = Some(paper);
    }
}
