use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

pub static HUD_REPLACE_ENABLED: AtomicBool = AtomicBool::new(true);
pub static TAP_ACTIVE: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPayload {
    pub kind: String, // "volume" | "brightness"
    pub value: u8,
    pub muted: bool,
}

#[tauri::command]
pub fn set_replace_system_hud(enabled: bool) {
    HUD_REPLACE_ENABLED.store(enabled, Ordering::Relaxed);
}

#[cfg(target_os = "macos")]
mod macos_hud {
    use super::*;
    use std::ffi::{c_char, c_void};
    use std::sync::OnceLock;

    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
        fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            value_callbacks: *const c_void,
        ) -> *const c_void;
        fn CFRelease(cf: *const c_void);
        static kCFBooleanTrue: *const c_void;
        static kAXTrustedCheckOptionPrompt: *const c_void;

        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: u64,
            callback: extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
            user_info: *mut c_void,
        ) -> *mut c_void;
        fn CGEventTapEnable(tap: *mut c_void, enable: bool);
        fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void,
            port: *mut c_void,
            order: isize,
        ) -> *mut c_void;
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
        static kCFRunLoopCommonModes: *const c_void;

        fn CGMainDisplayID() -> u32;
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        fn dlopen(filename: *const c_char, flag: i32) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    pub fn is_accessibility_granted() -> bool {
        unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
    }

    pub fn request_accessibility_prompt() -> bool {
        unsafe {
            let keys = [kAXTrustedCheckOptionPrompt];
            let vals = [kCFBooleanTrue];
            let dict = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                vals.as_ptr(),
                1,
                std::ptr::null(),
                std::ptr::null(),
            );
            let trusted = AXIsProcessTrustedWithOptions(dict);
            if !dict.is_null() {
                CFRelease(dict);
            }
            let listen = CGRequestListenEventAccess();
            trusted && listen
        }
    }

    fn adjust_macos_brightness(delta: f32) -> Option<u8> {
        unsafe {
            let path = b"/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices\0";
            let handle = dlopen(path.as_ptr() as *const c_char, 2);
            if handle.is_null() {
                return None;
            }
            let get_sym = dlsym(handle, b"DisplayServicesGetBrightness\0".as_ptr() as *const c_char);
            let set_sym = dlsym(handle, b"DisplayServicesSetBrightness\0".as_ptr() as *const c_char);
            if get_sym.is_null() || set_sym.is_null() {
                return None;
            }
            let get_fn: extern "C" fn(u32, *mut f32) -> i32 = std::mem::transmute(get_sym);
            let set_fn: extern "C" fn(u32, f32) -> i32 = std::mem::transmute(set_sym);
            let main_id = CGMainDisplayID();
            let mut cur: f32 = 0.5;
            if get_fn(main_id, &mut cur) == 0 {
                let next = (cur + delta).clamp(0.0, 1.0);
                set_fn(main_id, next);
                return Some((next * 100.0).round() as u8);
            }
            None
        }
    }

    fn adjust_macos_volume(delta: i32, toggle_mute: bool) -> (u8, bool) {
        let script = if toggle_mute {
            "set o to get volume settings\nset m to not (output muted of o)\nset volume output muted m\nreturn (output volume of o as string) & \",\" & (m as string)".to_string()
        } else {
            format!(
                "set o to get volume settings\nset v to (output volume of o) + ({delta})\nif v > 100 then set v to 100\nif v < 0 then set v to 0\nset volume output volume v\nset volume output muted false\nreturn (v as string) & \",false\""
            )
        };
        if let Ok(out) = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = text.trim().split(',').collect();
            if parts.len() == 2 {
                let v = parts[0].trim().parse::<u8>().unwrap_or(50);
                let m = parts[1].trim() == "true";
                return (v, m);
            }
        }
        (50, false)
    }

    extern "C" fn event_tap_callback(
        _proxy: *mut c_void,
        event_type: u32,
        event: *mut c_void,
        _user_info: *mut c_void,
    ) -> *mut c_void {
        use cocoa::base::id;
        use objc::{msg_send, sel, sel_impl};

        if !HUD_REPLACE_ENABLED.load(Ordering::Relaxed) || event_type != 14 || event.is_null() {
            return event;
        }

        objc::rc::autoreleasepool(|| unsafe {
            let ns_ev: id = msg_send![objc::class!(NSEvent), eventWithCGEvent: event];
            if ns_ev.is_null() {
                return event;
            }
            let subtype: i16 = msg_send![ns_ev, subtype];
            if subtype != 8 {
                return event;
            }
            let data1: isize = msg_send![ns_ev, data1];
            let key_code = (data1 >> 16) & 0xFFFF;
            let key_flags = data1 & 0xFFFF;
            let key_state = (key_flags & 0xFF00) >> 8;

            // Only intercept Sound Up (0), Sound Down (1), Mute (7), Brightness Up (2), Brightness Down (3)
            if !matches!(key_code, 0 | 1 | 2 | 3 | 7) {
                return event;
            }

            if key_state == 0xA {
                if let Some(app) = APP_HANDLE.get() {
                    let app_clone = app.clone();
                    std::thread::spawn(move || {
                        let payload = match key_code {
                            0 => {
                                let (v, m) = adjust_macos_volume(6, false);
                                Some(HudPayload { kind: "volume".into(), value: v, muted: m })
                            }
                            1 => {
                                let (v, m) = adjust_macos_volume(-6, false);
                                Some(HudPayload { kind: "volume".into(), value: v, muted: m })
                            }
                            7 => {
                                let (v, m) = adjust_macos_volume(0, true);
                                Some(HudPayload { kind: "volume".into(), value: v, muted: m })
                            }
                            2 => adjust_macos_brightness(0.0625).map(|b| HudPayload {
                                kind: "brightness".into(),
                                value: b,
                                muted: false,
                            }),
                            3 => adjust_macos_brightness(-0.0625).map(|b| HudPayload {
                                kind: "brightness".into(),
                                value: b,
                                muted: false,
                            }),
                            _ => None,
                        };
                        if let Some(p) = payload {
                            let _ = app_clone.emit("notch://hud", p);
                        }
                    });
                }
            }

            // Consume event so macOS OSDUIHelper does not show the native system popup
            std::ptr::null_mut()
        })
    }

    pub fn start(app: AppHandle) {
        let _ = APP_HANDLE.set(app);
        std::thread::spawn(|| unsafe {
            let mask: u64 = 1 << 14; // NX_SYSDEFINED
            loop {
                if is_accessibility_granted() && CGPreflightListenEventAccess() {
                    // Try kCGHIDEventTap (0) first, fallback to kCGSessionEventTap (1)
                    let mut tap = CGEventTapCreate(
                        0,
                        0,
                        0,
                        mask,
                        event_tap_callback,
                        std::ptr::null_mut(),
                    );
                    if tap.is_null() {
                        tap = CGEventTapCreate(
                            1,
                            0,
                            0,
                            mask,
                            event_tap_callback,
                            std::ptr::null_mut(),
                        );
                    }
                    if !tap.is_null() {
                        TAP_ACTIVE.store(true, Ordering::Relaxed);
                        let source = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
                        let rl = CFRunLoopGetCurrent();
                        CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
                        CGEventTapEnable(tap, true);
                        CFRunLoopRun();
                        TAP_ACTIVE.store(false, Ordering::Relaxed);
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        });
    }
}

#[cfg(target_os = "windows")]
mod windows_hud {
    use super::*;
    use std::sync::OnceLock;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
    };

    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    unsafe extern "system" fn ll_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && HUD_REPLACE_ENABLED.load(Ordering::Relaxed) && wparam.0 as u32 == WM_KEYDOWN {
            let kb = *(lparam.0 as *const KBDLLHOOKSTRUCT);
            // VK_VOLUME_MUTE (0xAD), VK_VOLUME_DOWN (0xAE), VK_VOLUME_UP (0xAF)
            if matches!(kb.vkCode, 0xAD | 0xAE | 0xAF) {
                if let Some(app) = APP_HANDLE.get() {
                    let label_val = match kb.vkCode {
                        0xAF => (60, false),
                        0xAE => (40, false),
                        _ => (0, true),
                    };
                    let _ = app.emit(
                        "notch://hud",
                        HudPayload {
                            kind: "volume".into(),
                            value: label_val.0,
                            muted: label_val.1,
                        },
                    );
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    pub fn start(app: AppHandle) {
        let _ = APP_HANDLE.set(app);
        std::thread::spawn(|| unsafe {
            let _hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_hook_proc), None, 0);
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}

pub fn start_hud_interceptor(app: AppHandle) {
    #[cfg(target_os = "macos")]
    macos_hud::start(app);
    #[cfg(target_os = "windows")]
    windows_hud::start(app);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = app;
}

#[tauri::command]
pub fn get_accessibility_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        return TAP_ACTIVE.load(Ordering::Relaxed);
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn request_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos_hud::request_accessibility_prompt();
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}
