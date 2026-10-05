//! A thread-owned Windows registration; no keyboard hook or input recording.
use serde_json::{Value, json};

/// Default Ctrl+Alt+M, with an explicit single ASCII letter override.
pub fn letter(args: &[String]) -> Option<u8> {
    match args.iter().position(|arg| arg == "--hotkey-key") {
        None => Some(b'M'),
        Some(index) => args.get(index + 1).and_then(|value| {
            let bytes = value.as_bytes();
            (bytes.len() == 1 && bytes[0].is_ascii_alphabetic())
                .then(|| bytes[0].to_ascii_uppercase())
        }),
    }
}

#[cfg(windows)]
pub struct Hotkey {
    thread_id: u32,
    thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(windows)]
impl Hotkey {
    pub fn start(
        letter: u8,
        on_press: impl Fn() + Send + 'static,
        on_failure: impl Fn() + Send + 'static,
    ) -> (Option<Self>, Value) {
        use windows_sys::Win32::Foundation::GetLastError;
        use windows_sys::Win32::System::Threading::GetCurrentThreadId;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, RegisterHotKey, UnregisterHotKey,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetMessageW, MSG, PM_NOREMOVE, PeekMessageW, WM_HOTKEY,
        };
        let combo = format!("Ctrl+Alt+{}", letter as char);
        let (ready, received) = std::sync::mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("runtime-hotkey".into())
            .spawn(move || {
                // SAFETY: initialized MSG, null HWND: only this thread's queue.
                let mut message: MSG = unsafe { std::mem::zeroed() };
                unsafe {
                    PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
                }
                // SAFETY: thread-level registration; this same thread unregisters it.
                let registered = unsafe {
                    RegisterHotKey(
                        std::ptr::null_mut(),
                        1,
                        MOD_CONTROL | MOD_ALT | MOD_NOREPEAT,
                        u32::from(letter),
                    )
                } != 0;
                let error = if registered {
                    0
                } else {
                    unsafe { GetLastError() }
                };
                let id = unsafe { GetCurrentThreadId() };
                // Queue creation precedes readiness, so stop cannot miss the queue.
                if ready.send((id, registered, error)).is_err() {
                    if registered {
                        unsafe {
                            UnregisterHotKey(std::ptr::null_mut(), 1);
                        }
                    }
                    return;
                }
                if !registered {
                    return;
                }
                loop {
                    // SAFETY: receive only messages from this owned thread's queue.
                    let result = unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) };
                    if result <= 0 {
                        if result < 0 {
                            on_failure();
                        }
                        break;
                    }
                    if message.message == WM_HOTKEY && message.wParam == 1 {
                        on_press();
                    }
                }
                unsafe {
                    UnregisterHotKey(std::ptr::null_mut(), 1);
                }
            });
        let Ok(thread) = thread else {
            return (None, json!({"combo":combo, "state":"unavailable"}));
        };
        match received.recv() {
            Ok((thread_id, true, _)) => (
                Some(Self {
                    thread_id,
                    thread: Some(thread),
                }),
                json!({"combo":combo, "state":"registered"}),
            ),
            result => {
                let _ = thread.join();
                let state = if matches!(result, Ok((_, false, 1409))) {
                    "conflict"
                } else {
                    "unavailable"
                };
                (None, json!({"combo":combo, "state":state}))
            }
        }
    }

    /// Called from the exit worker, never from the UI message loop.
    pub fn stop(&mut self) -> Result<(), &'static str> {
        use windows_sys::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
        let Some(thread) = self.thread.as_ref() else {
            return Ok(());
        };
        // SAFETY: the readiness handshake established this owned thread's queue.
        if !thread.is_finished()
            && unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0) } == 0
        {
            return Err("hotkey_stop_failed");
        }
        self.thread
            .take()
            .unwrap()
            .join()
            .map_err(|_| "hotkey_stop_failed")
    }
}

#[cfg(windows)]
impl Drop for Hotkey {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(not(windows))]
pub struct Hotkey;
#[cfg(not(windows))]
impl Hotkey {
    pub fn start(
        letter: u8,
        _: impl Fn() + Send + 'static,
        _: impl Fn() + Send + 'static,
    ) -> (Option<Self>, Value) {
        (
            None,
            json!({"combo":format!("Ctrl+Alt+{}", letter as char), "state":"unsupported"}),
        )
    }
    pub fn stop(&mut self) -> Result<(), &'static str> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn override_is_one_explicit_ascii_letter() {
        assert_eq!(letter(&[]), Some(b'M'));
        for (value, expected) in [
            ("a", Some(b'A')),
            ("Z", Some(b'Z')),
            ("", None),
            ("mm", None),
            ("é", None),
            ("7", None),
            ("--memory-vault", None),
        ] {
            assert_eq!(letter(&["--hotkey-key".into(), value.into()]), expected);
        }
        assert_eq!(letter(&["--hotkey-key".into()]), None);
    }
}
