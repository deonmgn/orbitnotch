use serde::{Deserialize, Serialize};
#[cfg(not(target_os = "macos"))]
use tauri::{LogicalPosition, LogicalSize};
use tauri::{Manager, WebviewWindow};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayEnvironment {
    pub has_hardware_notch: bool,
    pub notch_width: f64,
    pub notch_height: f64,
    pub screen_width: f64,
    pub screen_height: f64,
    pub scale_factor: f64,
    pub platform: String,
    pub monitor_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSummary {
    pub index: usize,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub is_primary: bool,
}

pub const WINDOW_WIDTH: f64 = 720.0;
pub const WINDOW_HEIGHT: f64 = 460.0;

#[allow(dead_code)]
pub fn compute_top_center_position(
    monitor_x: f64,
    monitor_y: f64,
    monitor_width: f64,
    window_width: f64,
    has_notch: bool,
) -> (f64, f64) {
    let x = monitor_x + (monitor_width - window_width) / 2.0;
    let y = if has_notch { monitor_y } else { monitor_y + 4.0 };
    (x.round(), y.round())
}

#[cfg(target_os = "macos")]
fn detect_macos_hardware_notch() -> (bool, f64, f64) {
    use cocoa::appkit::NSScreen;
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSRect;
    use objc::{msg_send, sel, sel_impl};

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct NSEdgeInsets {
        top: f64,
        left: f64,
        bottom: f64,
        right: f64,
    }

    unsafe {
        let screen: id = NSScreen::mainScreen(nil);
        if screen == nil {
            return (false, 190.0, 34.0);
        }
        let responds: bool = msg_send![screen, respondsToSelector: sel!(safeAreaInsets)];
        if responds {
            let insets: NSEdgeInsets = msg_send![screen, safeAreaInsets];
            if insets.top > 0.0 {
                let frame: NSRect = msg_send![screen, frame];
                let mut notch_width = 188.0;
                let has_aux: bool =
                    msg_send![screen, respondsToSelector: sel!(auxiliaryTopLeftArea)];
                if has_aux {
                    let left_area: NSRect = msg_send![screen, auxiliaryTopLeftArea];
                    let right_area: NSRect = msg_send![screen, auxiliaryTopRightArea];
                    let computed = frame.size.width - left_area.size.width - right_area.size.width;
                    if computed > 100.0 && computed < 320.0 {
                        notch_width = computed;
                    }
                }
                return (true, notch_width, insets.top.max(32.0));
            }
        }
        (false, 190.0, 34.0)
    }
}

#[cfg(not(target_os = "macos"))]
fn detect_macos_hardware_notch() -> (bool, f64, f64) {
    (false, 190.0, 34.0)
}

#[cfg(target_os = "macos")]
pub fn configure_platform_window(window: &WebviewWindow) {
    use cocoa::appkit::{NSColor, NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::{id, nil};
    use objc::{msg_send, sel, sel_impl};

    if let Ok(ns_win) = window.ns_window() {
        unsafe {
            let win = ns_win as id;
            // NSPopUpMenuWindowLevel (101) floats above newly launched apps and fullscreen Spaces
            let level: i64 = 101;
            let _: () = msg_send![win, setLevel: level];
            let ignores_cycle = NSWindowCollectionBehavior::from_bits_truncate(1 << 6);
            win.setCollectionBehavior_(
                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                    | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                    | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                    | ignores_cycle,
            );
            let clear = NSColor::clearColor(nil);
            let _: () = msg_send![win, setBackgroundColor: clear];
            let _: () = msg_send![win, setHasShadow: false];
            let _: () = msg_send![win, invalidateShadow];
            let _: () = msg_send![win, setOpaque: false];
            let _: () = msg_send![win, orderFrontRegardless];
        }
    }
}

#[cfg(target_os = "macos")]
fn set_cocoa_top_center_frame(
    window: &WebviewWindow,
    width: f64,
    height: f64,
    has_notch: bool,
    monitor_index: Option<usize>,
) {
    use cocoa::appkit::NSScreen;
    use cocoa::base::{id, nil, YES};
    use cocoa::foundation::{NSPoint, NSRect, NSSize};
    use objc::{msg_send, sel, sel_impl};

    if let Ok(ns_win) = window.ns_window() {
        unsafe {
            let win = ns_win as id;
            let mut screen: id = nil;
            if let Some(idx) = monitor_index {
                let screens: id = NSScreen::screens(nil);
                let count: usize = msg_send![screens, count];
                if idx < count {
                    screen = msg_send![screens, objectAtIndex: idx];
                }
            }
            if screen == nil {
                screen = msg_send![win, screen];
            }
            if screen == nil {
                screen = NSScreen::mainScreen(nil);
            }
            if screen == nil {
                return;
            }
            let screen_frame: NSRect = msg_send![screen, frame];
            let x = screen_frame.origin.x + ((screen_frame.size.width - width) / 2.0).round();
            let top_offset = if has_notch { 0.0 } else { 4.0 };
            // Cocoa coordinates originate at bottom-left, so top edge is origin.y + size.height
            let y = screen_frame.origin.y + screen_frame.size.height - height - top_offset;
            let rect = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
            let _: () = msg_send![win, setFrame: rect display: YES];
            let _: () = msg_send![win, orderFrontRegardless];
        }
    }
}

#[cfg(target_os = "windows")]
pub fn configure_platform_window(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let hwnd = HWND(hwnd.0 as _);
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            SetWindowLongW(
                hwnd,
                GWL_EXSTYLE,
                ex_style | (WS_EX_TOOLWINDOW.0 as i32) | (WS_EX_NOACTIVATE.0 as i32),
            );
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn configure_platform_window(_window: &WebviewWindow) {}

pub fn read_display_environment(
    window: &WebviewWindow,
    monitor_index: Option<usize>,
) -> DisplayEnvironment {
    let monitors = window.available_monitors().unwrap_or_default();
    let monitor_count = monitors.len().max(1);
    let target = monitor_index
        .and_then(|idx| monitors.get(idx).cloned())
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let (has_hardware_notch, notch_width, notch_height) = detect_macos_hardware_notch();

    let (screen_width, screen_height, scale_factor) = if let Some(m) = target {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        (size.width, size.height, scale)
    } else {
        (1440.0, 900.0, 1.0)
    };

    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
    .to_string();

    DisplayEnvironment {
        has_hardware_notch,
        notch_width,
        notch_height,
        screen_width,
        screen_height,
        scale_factor,
        platform,
        monitor_count,
    }
}

pub fn position_window_on_monitor(window: &WebviewWindow, monitor_index: Option<usize>) -> DisplayEnvironment {
    let monitors = window.available_monitors().unwrap_or_default();
    let target = monitor_index
        .and_then(|idx| monitors.get(idx).cloned())
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let env = read_display_environment(window, monitor_index);

    let (mon_x, mon_y) = if let Some(m) = target {
        let pos = m.position().to_logical::<f64>(env.scale_factor);
        (pos.x, pos.y)
    } else {
        (0.0, 0.0)
    };

    // Preserve the current window size instead of resetting to 720x460;
    // on initial launch (when still at default WINDOW_WIDTH x WINDOW_HEIGHT), start compact.
    let (cur_w, cur_h) = window
        .inner_size()
        .ok()
        .map(|s| {
            let l = s.to_logical::<f64>(env.scale_factor);
            if (l.width - WINDOW_WIDTH).abs() < 1.0 && (l.height - WINDOW_HEIGHT).abs() < 1.0 {
                (320.0, env.notch_height.max(34.0))
            } else {
                (l.width, l.height)
            }
        })
        .unwrap_or((320.0, env.notch_height.max(34.0)));

    #[cfg(target_os = "macos")]
    {
        set_cocoa_top_center_frame(
            window,
            cur_w,
            cur_h,
            env.has_hardware_notch,
            monitor_index,
        );
    }

    #[cfg(not(target_os = "macos"))]
    {
        let (x, y) =
            compute_top_center_position(mon_x, mon_y, env.screen_width, cur_w, env.has_hardware_notch);
        let _ = window.set_size(LogicalSize::new(cur_w, cur_h));
        let _ = window.set_position(LogicalPosition::new(x, y));
    }
    let _ = (mon_x, mon_y);

    env
}

#[tauri::command]
pub fn get_display_environment(app: tauri::AppHandle) -> DisplayEnvironment {
    if let Some(window) = app.get_webview_window("main") {
        read_display_environment(&window, None)
    } else {
        DisplayEnvironment {
            has_hardware_notch: false,
            notch_width: 190.0,
            notch_height: 34.0,
            screen_width: 1440.0,
            screen_height: 900.0,
            scale_factor: 1.0,
            platform: std::env::consts::OS.to_string(),
            monitor_count: 1,
        }
    }
}

#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Vec<MonitorSummary> {
    let Some(window) = app.get_webview_window("main") else {
        return vec![];
    };
    let primary_name = window
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().map(|n| n.to_string()));

    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, m)| {
            let scale = m.scale_factor();
            let size = m.size().to_logical::<f64>(scale);
            let name = m
                .name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Display {}", index + 1));
            let is_primary = primary_name.as_deref() == Some(name.as_str()) || index == 0;
            MonitorSummary {
                index,
                name,
                width: size.width,
                height: size.height,
                is_primary,
            }
        })
        .collect()
}

#[tauri::command]
pub fn move_to_monitor(app: tauri::AppHandle, monitor_index: usize) -> Option<DisplayEnvironment> {
    app.get_webview_window("main")
        .map(|w| position_window_on_monitor(&w, Some(monitor_index)))
}

#[tauri::command]
pub fn set_click_through(app: tauri::AppHandle, ignore: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_ignore_cursor_events(ignore);
    }
}

#[tauri::command]
pub fn set_notch_window_size(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
    has_notch: bool,
    monitor_index: Option<usize>,
    focus: Option<bool>,
) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    #[cfg(target_os = "macos")]
    {
        set_cocoa_top_center_frame(&window, width, height, has_notch, monitor_index);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let monitors = window.available_monitors().unwrap_or_default();
        let target = monitor_index
            .and_then(|idx| monitors.get(idx).cloned())
            .or_else(|| window.primary_monitor().ok().flatten())
            .or_else(|| monitors.into_iter().next());

        let (screen_width, mon_x, mon_y) = if let Some(m) = target {
            let scale = m.scale_factor();
            let size = m.size().to_logical::<f64>(scale);
            let pos = m.position().to_logical::<f64>(scale);
            (size.width, pos.x, pos.y)
        } else {
            (1440.0, 0.0, 0.0)
        };

        let (x, y) = compute_top_center_position(mon_x, mon_y, screen_width, width, has_notch);
        let _ = window.set_size(LogicalSize::new(width, height));
        let _ = window.set_position(LogicalPosition::new(x, y));
    }

    if focus.unwrap_or(false) {
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn focus_notch_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
pub fn is_cursor_inside_window(window: &WebviewWindow) -> bool {
    use cocoa::appkit::NSEvent;
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::{msg_send, sel, sel_impl};

    let Ok(ns_win) = window.ns_window() else {
        return false;
    };
    unsafe {
        let win = ns_win as id;
        let frame: NSRect = msg_send![win, frame];
        let pt: NSPoint = NSEvent::mouseLocation(nil);
        pt.x >= frame.origin.x
            && pt.x <= frame.origin.x + frame.size.width
            && pt.y >= frame.origin.y
            && pt.y <= frame.origin.y + frame.size.height
    }
}

#[cfg(target_os = "windows")]
pub fn is_cursor_inside_window(window: &WebviewWindow) -> bool {
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect};

    let Ok(hwnd) = window.hwnd() else {
        return false;
    };
    unsafe {
        let mut pt = POINT::default();
        let mut rect = RECT::default();
        if GetCursorPos(&mut pt).is_ok() && GetWindowRect(HWND(hwnd.0 as _), &mut rect).is_ok() {
            return pt.x >= rect.left
                && pt.x <= rect.right
                && pt.y >= rect.top
                && pt.y <= rect.bottom;
        }
    }
    false
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn is_cursor_inside_window(_window: &WebviewWindow) -> bool {
    false
}

#[tauri::command]
pub fn is_fullscreen_active(app: tauri::AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        let Some(window) = app.get_webview_window("main") else {
            return false;
        };
        let Ok(Some(mon)) = window.primary_monitor() else {
            return false;
        };
        let scale = mon.scale_factor();
        let size = mon.size().to_logical::<f64>(scale);
        // Check if active frontmost app has a window covering the full screen height
        let script = r#"
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            if name of frontApp is "orbitnotch" then return "false"
            try
                set wSize to size of front window of frontApp
                return (item 1 of wSize as string) & "," & (item 2 of wSize as string)
            end try
        end tell
        return "false"
        "#;
        if let Ok(out) = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let parts: Vec<&str> = text.split(',').collect();
            if parts.len() == 2 {
                let w = parts[0].trim().parse::<f64>().unwrap_or(0.0);
                let h = parts[1].trim().parse::<f64>().unwrap_or(0.0);
                return (w - size.width).abs() < 4.0 && (h - size.height).abs() < 4.0;
            }
        }
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};
        let _ = app;
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return false;
            }
            let mut w_rect = RECT::default();
            if GetWindowRect(fg, &mut w_rect).is_err() {
                return false;
            }
            let hmon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(hmon, &mut mi).as_bool() {
                let mr = mi.rcMonitor;
                return w_rect.left <= mr.left
                    && w_rect.top <= mr.top
                    && w_rect.right >= mr.right
                    && w_rect.bottom >= mr.bottom;
            }
        }
        return false;
    }

    #[allow(unreachable_code)]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn set_notch_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if visible {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_top_center_position_with_notch() {
        let (x, y) = compute_top_center_position(0.0, 0.0, 1512.0, 720.0, true);
        assert_eq!(x, 396.0);
        assert_eq!(y, 0.0);
    }

    #[test]
    fn test_compute_top_center_position_floating_pill() {
        let (x, y) = compute_top_center_position(1920.0, 0.0, 2560.0, 720.0, false);
        assert_eq!(x, 2840.0);
        assert_eq!(y, 4.0);
    }
}
