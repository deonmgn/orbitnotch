use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

pub static HUD_REPLACE_ENABLED: AtomicBool = AtomicBool::new(true);
pub static TAP_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static HID_TAP_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static SESSION_TAP_ONLY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPayload {
    pub kind: String, // "volume" | "brightness" | "backlight"
    pub value: u8,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPermissionStatus {
    pub accessibility: bool,
    pub input_monitoring: bool,
    pub hid_tap_active: bool,
    pub session_tap_only: bool,
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
    static TAP_PTR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

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
        static kCFTypeDictionaryKeyCallBacks: c_void;
        static kCFTypeDictionaryValueCallBacks: c_void;
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
        fn CFMachPortInvalidate(port: *mut c_void);
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
        fn CFRunLoopRunInMode(
            mode: *const c_void,
            seconds: f64,
            return_after_source_handled: bool,
        ) -> i32;
        static kCFRunLoopCommonModes: *const c_void;
        static kCFRunLoopDefaultMode: *const c_void;

        fn CGMainDisplayID() -> u32;
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        fn dlopen(filename: *const c_char, flag: i32) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    pub fn is_accessibility_granted() -> bool {
        unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
    }

    pub fn is_input_monitoring_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request_accessibility_prompt() -> bool {
        unsafe {
            let keys = [kAXTrustedCheckOptionPrompt];
            let values = [kCFBooleanTrue];
            let opts = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks as *const _ as *const c_void,
                &kCFTypeDictionaryValueCallBacks as *const _ as *const c_void,
            );
            let ax_ok = AXIsProcessTrustedWithOptions(opts);
            if !opts.is_null() {
                CFRelease(opts);
            }
            let listen_ok = CGRequestListenEventAccess();
            if !ax_ok {
                let _ = std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                    .spawn();
            }
            if !listen_ok {
                let _ = std::process::Command::new("open")
                    .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
                    .spawn();
            }
            ax_ok && listen_ok
        }
    }

    pub(super) fn adjust_macos_brightness(delta: f32) -> Option<u8> {
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

    #[repr(C)]
    struct AudioObjectPropertyAddress {
        m_selector: u32,
        m_scope: u32,
        m_element: u32,
    }

    fn adjust_macos_volume_coreaudio(delta: f32, toggle_mute: bool) -> Option<(u8, bool)> {
        unsafe {
            let ca = dlopen(
                b"/System/Library/Frameworks/CoreAudio.framework/CoreAudio\0".as_ptr() as *const c_char,
                2,
            );
            let at = dlopen(
                b"/System/Library/Frameworks/AudioToolbox.framework/AudioToolbox\0".as_ptr() as *const c_char,
                2,
            );
            if ca.is_null() || at.is_null() {
                return None;
            }
            let get_prop_sym = dlsym(ca, b"AudioObjectGetPropertyData\0".as_ptr() as *const c_char);
            let set_prop_sym = dlsym(ca, b"AudioObjectSetPropertyData\0".as_ptr() as *const c_char);
            let hs_get_sym = dlsym(at, b"AudioHardwareServiceGetPropertyData\0".as_ptr() as *const c_char);
            let hs_set_sym = dlsym(at, b"AudioHardwareServiceSetPropertyData\0".as_ptr() as *const c_char);
            if get_prop_sym.is_null() || set_prop_sym.is_null() || hs_get_sym.is_null() || hs_set_sym.is_null() {
                return None;
            }

            type GetPropFn = extern "C" fn(u32, *const AudioObjectPropertyAddress, u32, *const c_void, *mut u32, *mut c_void) -> i32;
            type SetPropFn = extern "C" fn(u32, *const AudioObjectPropertyAddress, u32, *const c_void, u32, *const c_void) -> i32;
            let get_prop: GetPropFn = std::mem::transmute(get_prop_sym);
            let set_prop: SetPropFn = std::mem::transmute(set_prop_sym);
            let hs_get: GetPropFn = std::mem::transmute(hs_get_sym);
            let hs_set: SetPropFn = std::mem::transmute(hs_set_sym);

            let mut device_id: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            let dev_addr = AudioObjectPropertyAddress {
                m_selector: u32::from_be_bytes(*b"dOut"), // kAudioHardwarePropertyDefaultOutputDevice
                m_scope: u32::from_be_bytes(*b"glob"),    // kAudioObjectPropertyScopeGlobal
                m_element: 0,
            };
            if get_prop(1, &dev_addr, 0, std::ptr::null(), &mut size, &mut device_id as *mut u32 as *mut c_void) != 0 || device_id == 0 {
                return None;
            }

            let vol_addr = AudioObjectPropertyAddress {
                m_selector: u32::from_be_bytes(*b"vmvc"), // kAudioHardwareServiceDeviceProperty_VirtualMainVolume
                m_scope: u32::from_be_bytes(*b"outp"),    // kAudioObjectPropertyScopeOutput
                m_element: 0,
            };
            let mute_addr = AudioObjectPropertyAddress {
                m_selector: u32::from_be_bytes(*b"mute"), // kAudioDevicePropertyMute
                m_scope: u32::from_be_bytes(*b"outp"),
                m_element: 0,
            };

            let mut cur_vol: f32 = 0.5;
            let mut vol_size = std::mem::size_of::<f32>() as u32;
            if hs_get(device_id, &vol_addr, 0, std::ptr::null(), &mut vol_size, &mut cur_vol as *mut f32 as *mut c_void) != 0 {
                return None;
            }

            let mut cur_mute: u32 = 0;
            let mut mute_size = std::mem::size_of::<u32>() as u32;
            let _ = get_prop(device_id, &mute_addr, 0, std::ptr::null(), &mut mute_size, &mut cur_mute as *mut u32 as *mut c_void);

            if toggle_mute {
                let next_mute: u32 = if cur_mute == 0 { 1 } else { 0 };
                if set_prop(device_id, &mute_addr, 0, std::ptr::null(), std::mem::size_of::<u32>() as u32, &next_mute as *const u32 as *const c_void) == 0 {
                    return Some(((cur_vol * 100.0).round() as u8, next_mute != 0));
                }
                return None;
            }

            let next_vol = (cur_vol + delta).clamp(0.0, 1.0);
            if hs_set(device_id, &vol_addr, 0, std::ptr::null(), std::mem::size_of::<f32>() as u32, &next_vol as *const f32 as *const c_void) == 0 {
                let unmute: u32 = 0;
                let _ = set_prop(device_id, &mute_addr, 0, std::ptr::null(), std::mem::size_of::<u32>() as u32, &unmute as *const u32 as *const c_void);
                return Some(((next_vol * 100.0).round() as u8, false));
            }
            None
        }
    }

    pub(super) fn adjust_macos_volume(delta: i32, toggle_mute: bool) -> (u8, bool) {
        if let Some(res) = adjust_macos_volume_coreaudio(delta as f32 / 100.0, toggle_mute) {
            return res;
        }
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

        // Re-enable tap if macOS disables it due to timeout
        if event_type == 0xFFFFFFFE || event_type == 0xFFFFFFFF {
            let tap = TAP_PTR.load(Ordering::Relaxed) as *mut c_void;
            if !tap.is_null() {
                unsafe { CGEventTapEnable(tap, true) };
            }
            return event;
        }

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

            // Intercept Sound Up (0), Sound Down (1), Brightness Up (2), Brightness Down (3),
            // Mute (7), Keyboard Backlight Up (21), Keyboard Backlight Down (22)
            if !matches!(key_code, 0 | 1 | 2 | 3 | 7 | 21 | 22) {
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
                            21 => Some(HudPayload {
                                kind: "backlight".into(),
                                value: 75,
                                muted: false,
                            }),
                            22 => Some(HudPayload {
                                kind: "backlight".into(),
                                value: 25,
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

            // Consume both key-down (0xA) and key-up (0xB) so macOS does not show native HUD
            std::ptr::null_mut()
        })
    }

    pub fn start(app: AppHandle) {
        let _ = APP_HANDLE.set(app);
        std::thread::spawn(|| unsafe {
            let mask: u64 = 1 << 14; // NX_SYSDEFINED
            loop {
                let ax_ok = is_accessibility_granted();
                let listen_ok = is_input_monitoring_granted();
                if ax_ok || listen_ok {
                    // Try kCGHIDEventTap (0) first — required to suppress native macOS HUD
                    let hid_tap = CGEventTapCreate(
                        0,
                        0,
                        0,
                        mask,
                        event_tap_callback,
                        std::ptr::null_mut(),
                    );
                    if !hid_tap.is_null() {
                        TAP_PTR.store(hid_tap as usize, Ordering::Relaxed);
                        HID_TAP_ACTIVE.store(true, Ordering::Relaxed);
                        SESSION_TAP_ONLY.store(false, Ordering::Relaxed);
                        TAP_ACTIVE.store(true, Ordering::Relaxed);
                        let source = CFMachPortCreateRunLoopSource(std::ptr::null(), hid_tap, 0);
                        let rl = CFRunLoopGetCurrent();
                        CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
                        CGEventTapEnable(hid_tap, true);
                        CFRunLoopRun();
                        HID_TAP_ACTIVE.store(false, Ordering::Relaxed);
                        TAP_ACTIVE.store(false, Ordering::Relaxed);
                    } else {
                        // Fallback to kCGSessionEventTap (1) temporarily, polling to upgrade to HID tap
                        let sess_tap = CGEventTapCreate(
                            1,
                            0,
                            0,
                            mask,
                            event_tap_callback,
                            std::ptr::null_mut(),
                        );
                        if !sess_tap.is_null() {
                            TAP_PTR.store(sess_tap as usize, Ordering::Relaxed);
                            HID_TAP_ACTIVE.store(false, Ordering::Relaxed);
                            SESSION_TAP_ONLY.store(true, Ordering::Relaxed);
                            TAP_ACTIVE.store(false, Ordering::Relaxed);
                            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), sess_tap, 0);
                            let rl = CFRunLoopGetCurrent();
                            CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
                            CGEventTapEnable(sess_tap, true);
                            loop {
                                CFRunLoopRunInMode(kCFRunLoopDefaultMode, 1.5, false);
                                if is_accessibility_granted() && is_input_monitoring_granted() {
                                    CGEventTapEnable(sess_tap, false);
                                    CFMachPortInvalidate(sess_tap);
                                    CFRelease(sess_tap);
                                    break;
                                }
                            }
                            SESSION_TAP_ONLY.store(false, Ordering::Relaxed);
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(1500));
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
    static TAP_PTR: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

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
        return HID_TAP_ACTIVE.load(Ordering::Relaxed);
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn get_hud_permission_status() -> HudPermissionStatus {
    #[cfg(target_os = "macos")]
    {
        return HudPermissionStatus {
            accessibility: macos_hud::is_accessibility_granted(),
            input_monitoring: macos_hud::is_input_monitoring_granted(),
            hid_tap_active: HID_TAP_ACTIVE.load(Ordering::Relaxed),
            session_tap_only: SESSION_TAP_ONLY.load(Ordering::Relaxed),
        };
    }
    #[cfg(not(target_os = "macos"))]
    {
        HudPermissionStatus {
            accessibility: true,
            input_monitoring: true,
            hid_tap_active: true,
            session_tap_only: false,
        }
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

#[tauri::command]
pub fn reset_tcc_permissions() -> bool {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("tccutil")
            .args(["reset", "Accessibility", "com.orbitnotch.desktop"])
            .output();
        let _ = std::process::Command::new("tccutil")
            .args(["reset", "ListenEvent", "com.orbitnotch.desktop"])
            .output();
        return macos_hud::request_accessibility_prompt();
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn get_tahoe_banner_disabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("defaults")
            .args(["read", "com.apple.controlcenter", "EnableSystemBanners"])
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
            return s == "0" || s == "false";
        }
        return false;
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
pub fn adjust_hud_delta(app: AppHandle, kind: String, delta: i32) -> Result<HudPayload, String> {
    #[cfg(target_os = "macos")]
    {
        let payload = if kind == "brightness" {
            let step = (delta as f32) / 100.0;
            let b = macos_hud::adjust_macos_brightness(step)
                .ok_or_else(|| "Brightness unavailable".to_string())?;
            HudPayload {
                kind: "brightness".into(),
                value: b,
                muted: false,
            }
        } else {
            let (v, m) = macos_hud::adjust_macos_volume(delta, false);
            HudPayload {
                kind: "volume".into(),
                value: v,
                muted: m,
            }
        };
        let _ = app.emit("notch://hud", payload.clone());
        return Ok(payload);
    }
    #[cfg(target_os = "windows")]
    {
        let key_char = if delta >= 0 { 175 } else { 174 };
        let script = format!("(New-Object -ComObject WScript.Shell).SendKeys([char]{key_char})");
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status();
        let payload = HudPayload {
            kind: if kind == "brightness" { "brightness".into() } else { "volume".into() },
            value: if delta >= 0 { 60 } else { 40 },
            muted: false,
        };
        let _ = app.emit("notch://hud", payload.clone());
        return Ok(payload);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, kind, delta);
        Err("Scroll HUD adjustment is unavailable on this OS".to_string())
    }
}

#[tauri::command]
pub fn set_tahoe_banner_disabled(disabled: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        if disabled {
            let _ = std::process::Command::new("defaults")
                .args(["write", "com.apple.controlcenter", "EnableSystemBanners", "-bool", "false"])
                .output();
        } else {
            let _ = std::process::Command::new("defaults")
                .args(["delete", "com.apple.controlcenter", "EnableSystemBanners"])
                .output();
        }
        let _ = std::process::Command::new("killall").arg("ControlCenter").output();
        return get_tahoe_banner_disabled();
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}
