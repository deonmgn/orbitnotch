mod calendar_ics;
mod clipboard_manager;
mod hud_interceptor;
mod media_bridge;
mod shelf_manager;
mod system_monitor;
mod window_manager;

use calendar_ics::CalendarStore;
use clipboard_manager::ClipboardStore;
use shelf_manager::ShelfStore;
use std::time::Duration;
use system_monitor::SystemCollector;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn license_file_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("license.json"))
}

#[tauri::command]
fn get_saved_license_key(app: tauri::AppHandle) -> String {
    let Some(path) = license_file_path(&app) else {
        return String::new();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return String::new();
    };
    serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("licenseKey").and_then(|k| k.as_str()).map(|s| s.trim().to_string()))
        .unwrap_or_default()
}

#[tauri::command]
fn save_license_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let Some(path) = license_file_path(&app) else {
        return Err("Missing app data dir".to_string());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::json!({ "licenseKey": key.trim() });
    std::fs::write(path, body.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_license_key(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(path) = license_file_path(&app) {
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn install_app_update(download_url: String) -> Result<String, String> {
    let url = download_url.trim().to_string();
    if !url.starts_with("https://github.com/deonmgn/orbitnotch/")
        && !url.starts_with("https://objects.githubusercontent.com/")
    {
        return Err("Untrusted update URL".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "curl -fsSL '{}' -o /tmp/OrbitNotch_update.dmg && \
             MNT=$(hdiutil attach /tmp/OrbitNotch_update.dmg -nobrowse -readonly | grep -o '/Volumes/.*' | head -n 1) && \
             if [ -d \"$MNT/OrbitNotch.app\" ]; then \
               rm -rf /Applications/OrbitNotch.app && \
               ditto \"$MNT/OrbitNotch.app\" /Applications/OrbitNotch.app && \
               hdiutil detach \"$MNT\" -quiet || true; \
               rm -f /tmp/OrbitNotch_update.dmg; \
               (sleep 1 && open -a /Applications/OrbitNotch.app) & \
             else \
               hdiutil detach \"$MNT\" -quiet || true; \
               exit 1; \
             fi",
            url.replace('\'', "")
        );
        let status = std::process::Command::new("sh")
            .args(["-c", &script])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok("Updated and relaunching".to_string());
        }
        return Err("Failed to install DMG update".to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("Use browser installer on this OS".to_string())
    }
}

#[tauri::command]
fn launch_shortcut_target(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Empty target".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            std::process::Command::new("open")
                .arg(trimmed)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("open")
                .args(["-a", trimmed])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let toggle_shortcut =
                            Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
                        let win_shortcut =
                            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                        if shortcut == &toggle_shortcut || shortcut == &win_shortcut {
                            let _ = app.emit("notch://toggle", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| dirs::data_local_dir().unwrap_or_default().join("OrbitNotch"));

            app.manage(ClipboardStore::new(app_data_dir.clone()));
            app.manage(ShelfStore::new(app_data_dir.clone()));
            app.manage(CalendarStore::new(app_data_dir));

            if let Some(window) = app.get_webview_window("main") {
                window_manager::configure_platform_window(&window);
                window_manager::position_window_on_monitor(&window, None);
            }

            // Register global shortcut: Cmd+Shift+Space on macOS, Ctrl+Shift+Space on Windows/Linux
            #[cfg(target_os = "macos")]
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
            #[cfg(not(target_os = "macos"))]
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            let _ = app.global_shortcut().register(shortcut);

            // System Tray
            let toggle_item = MenuItem::with_id(app, "toggle", "Toggle OrbitNotch", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit OrbitNotch", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            if let Some(icon) = app.default_window_icon().cloned() {
                let _ = TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "toggle" => {
                            let _ = app.emit("notch://toggle", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let _ = tray.app_handle().emit("notch://toggle", ());
                        }
                    })
                    .build(app);
            }

            // Background System Telemetry Loop
            let sys_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut collector = SystemCollector::new();
                loop {
                    tokio::time::sleep(Duration::from_millis(1800)).await;
                    let stats = collector.sample(1.8);
                    let _ = sys_handle.emit("system://stats", stats);
                }
            });

            // Background Media Bridge Loop (700ms for instant play/pause detection)
            let media_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(700)).await;
                    let media = tokio::task::spawn_blocking(media_bridge::fetch_now_playing)
                        .await
                        .unwrap_or_default();
                    let _ = media_handle.emit("media://state", media);
                }
            });

            // Background Clipboard Watcher Loop
            let clip_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(1200)).await;
                    let store = clip_handle.state::<ClipboardStore>();
                    if let Some(updated) = store.poll_once() {
                        let _ = clip_handle.emit("clipboard://updated", updated);
                    }
                }
            });

            // Background Screenshot Watcher Loop (auto-catches recent screenshots to Shelf)
            let shelf_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(2500)).await;
                    let store = shelf_handle.state::<ShelfStore>();
                    if let Some(updated) = store.poll_new_screenshots() {
                        let _ = shelf_handle.emit("shelf://updated", updated);
                    }
                }
            });

            // Native Global Hover Watcher (works even when Chrome or another app is focused)
            let hover_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut was_inside = false;
                loop {
                    tokio::time::sleep(Duration::from_millis(90)).await;
                    let h_inner = hover_handle.clone();
                    let (tx, rx) = tokio::sync::oneshot::channel();
                    let _ = hover_handle.run_on_main_thread(move || {
                        let inside = h_inner
                            .get_webview_window("main")
                            .map(|w| window_manager::is_cursor_inside_window(&w))
                            .unwrap_or(false);
                        let _ = tx.send(inside);
                    });
                    if let Ok(inside) = rx.await {
                        if inside && !was_inside {
                            was_inside = true;
                            let _ = hover_handle.emit("notch://hover-enter", ());
                        } else if !inside && was_inside {
                            was_inside = false;
                            let _ = hover_handle.emit("notch://hover-leave", ());
                        }
                    }
                }
            });

            // Start native Volume & Brightness HUD key interceptor
            hud_interceptor::start_hud_interceptor(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window_manager::get_display_environment,
            window_manager::list_monitors,
            window_manager::move_to_monitor,
            window_manager::set_click_through,
            window_manager::set_notch_window_size,
            window_manager::focus_notch_window,
            window_manager::is_fullscreen_active,
            window_manager::set_notch_visible,
            system_monitor::get_system_stats,
            system_monitor::set_system_volume,
            system_monitor::toggle_system_mute,
            system_monitor::trigger_screenshot,
            system_monitor::lock_screen,
            media_bridge::get_media_state,
            media_bridge::media_control,
            media_bridge::media_seek,
            clipboard_manager::get_clipboard_history,
            clipboard_manager::copy_clipboard_entry,
            clipboard_manager::toggle_pin_clipboard_entry,
            clipboard_manager::clear_clipboard_history,
            clipboard_manager::copy_text_to_clipboard,
            shelf_manager::get_shelf_items,
            shelf_manager::add_shelf_files,
            shelf_manager::add_shelf_text,
            shelf_manager::remove_shelf_item,
            shelf_manager::toggle_pin_shelf_item,
            shelf_manager::clear_shelf_items,
            shelf_manager::open_shelf_file,
            shelf_manager::reveal_in_folder,
            shelf_manager::copy_image_to_clipboard,
            shelf_manager::extract_image_text_ocr,
            shelf_manager::compress_shelf_image,
            calendar_ics::get_upcoming_meetings,
            calendar_ics::add_meeting,
            calendar_ics::import_ics_content,
            calendar_ics::import_ics_file,
            calendar_ics::remove_meeting,
            hud_interceptor::set_replace_system_hud,
            hud_interceptor::get_accessibility_status,
            hud_interceptor::get_hud_permission_status,
            hud_interceptor::request_accessibility_permission,
            hud_interceptor::reset_tcc_permissions,
            hud_interceptor::get_tahoe_banner_disabled,
            hud_interceptor::set_tahoe_banner_disabled,
            launch_shortcut_target,
            get_saved_license_key,
            save_license_key,
            clear_license_key,
            install_app_update,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OrbitNotch");
}
