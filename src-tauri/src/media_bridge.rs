use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_url: String,
    pub is_playing: bool,
    pub app_name: String,
    pub duration_sec: f64,
    pub position_sec: f64,
    pub has_media: bool,
}

#[cfg(target_os = "macos")]
fn is_process_running(name: &str) -> bool {
    Command::new("pgrep")
        .args(["-x", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn is_macos_audio_playing() -> bool {
    #[repr(C)]
    struct AudioObjectPropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    extern "C" {
        fn AudioObjectGetPropertyData(
            in_object_id: u32,
            in_address: *const AudioObjectPropertyAddress,
            in_qualifier_data_size: u32,
            in_qualifier_data: *const std::ffi::c_void,
            io_data_size: *mut u32,
            out_data: *mut std::ffi::c_void,
        ) -> i32;
    }

    const K_AUDIO_OBJECT_SYSTEM_OBJECT: u32 = 1;
    const K_AUDIO_HW_DEFAULT_OUTPUT_DEVICE: u32 = 0x644f7574; // 'dOut'
    const K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL: u32 = 0x676c6f62; // 'glob'
    const K_AUDIO_DEVICE_PROPERTY_IS_RUNNING_SOMEWHERE: u32 = 0x676f6e65; // 'gone'

    unsafe {
        let mut device_id: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let addr = AudioObjectPropertyAddress {
            selector: K_AUDIO_HW_DEFAULT_OUTPUT_DEVICE,
            scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            element: 0,
        };
        let status = AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut device_id as *mut u32 as *mut std::ffi::c_void,
        );
        if status != 0 || device_id == 0 {
            return false;
        }

        let mut is_running: u32 = 0;
        let mut run_size = std::mem::size_of::<u32>() as u32;
        let run_addr = AudioObjectPropertyAddress {
            selector: K_AUDIO_DEVICE_PROPERTY_IS_RUNNING_SOMEWHERE,
            scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_GLOBAL,
            element: 0,
        };
        let status2 = AudioObjectGetPropertyData(
            device_id,
            &run_addr,
            0,
            std::ptr::null(),
            &mut run_size,
            &mut is_running as *mut u32 as *mut std::ffi::c_void,
        );
        status2 == 0 && is_running != 0
    }
}

#[cfg(target_os = "macos")]
fn fetch_browser_media() -> Option<MediaState> {
    let audio_active = is_macos_audio_playing();
    for (proc_name, app_name, is_safari) in [
        ("Google Chrome", "Google Chrome", false),
        ("Arc", "Arc", false),
        ("Brave Browser", "Brave Browser", false),
        ("Safari", "Safari", true),
    ] {
        if !is_process_running(proc_name) {
            continue;
        }
        let script = if is_safari {
            r#"tell application "Safari" to return name of current tab of front window"#
                .to_string()
        } else {
            format!(
                r#"tell application "{app_name}" to return title of active tab of front window"#
            )
        };
        let Ok(out) = Command::new("osascript").args(["-e", &script]).output() else {
            continue;
        };
        let title = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let lower = title.to_ascii_lowercase();
        let is_media_tab = lower.contains("youtube")
            || lower.contains("spotify")
            || lower.contains("iqiyi")
            || lower.contains("netflix")
            || lower.contains("soundcloud")
            || lower.contains("twitch")
            || lower.contains("music");
        if !title.is_empty() && is_media_tab {
            let clean_title = title
                .replace(" - YouTube", "")
                .replace(" | iQIYI", "")
                .trim()
                .to_string();
            return Some(MediaState {
                title: clean_title,
                artist: format!("Playing in {app_name}"),
                album: String::new(),
                artwork_url: String::new(),
                is_playing: audio_active,
                app_name: app_name.to_string(),
                duration_sec: 0.0,
                position_sec: 0.0,
                has_media: true,
            });
        }
    }
    None
}

#[cfg(target_os = "macos")]
pub fn fetch_now_playing() -> MediaState {
    let spotify_up = is_process_running("Spotify");
    let music_up = is_process_running("Music");
    if !spotify_up && !music_up {
        return fetch_browser_media().unwrap_or_default();
    }

    let target = if spotify_up { "Spotify" } else { "Music" };
    let art_expr = if target == "Spotify" {
        "set artUrl to artwork url of current track"
    } else {
        "set artUrl to \"\""
    };
    let script = format!(
        r#"
        tell application "{target}"
            try
                set pState to player state as string
                set tName to name of current track
                set aName to artist of current track
                set alName to album of current track
                set dur to duration of current track
                set pos to player position
                {art_expr}
                return "{target}" & "|||" & pState & "|||" & tName & "|||" & aName & "|||" & alName & "|||" & (dur as string) & "|||" & (pos as string) & "|||" & artUrl
            end try
        end tell
        return ""
        "#
    );

    let Ok(output) = Command::new("osascript").args(["-e", &script]).output() else {
        return MediaState::default();
    };
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return MediaState::default();
    }
    let parts: Vec<&str> = text.split("|||").collect();
    if parts.len() < 7 {
        return MediaState::default();
    }
    let mut dur = parts[5].trim().replace(',', ".").parse::<f64>().unwrap_or(0.0);
    // Spotify returns duration in ms on some versions
    if parts[0] == "Spotify" && dur > 1000.0 {
        dur /= 1000.0;
    }
    let pos = parts[6].trim().replace(',', ".").parse::<f64>().unwrap_or(0.0);
    let artwork_url = parts.get(7).map(|s| s.trim().to_string()).unwrap_or_default();

    MediaState {
        app_name: parts[0].to_string(),
        is_playing: parts[1].eq_ignore_ascii_case("playing"),
        title: parts[2].to_string(),
        artist: parts[3].to_string(),
        album: parts[4].to_string(),
        artwork_url,
        duration_sec: dur,
        position_sec: pos,
        has_media: true,
    }
}

#[cfg(target_os = "windows")]
pub fn fetch_now_playing() -> MediaState {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() else {
        return MediaState::default();
    };
    let Ok(manager) = op.get() else {
        return MediaState::default();
    };
    let Ok(session) = manager.GetCurrentSession() else {
        return MediaState::default();
    };

    let is_playing = session
        .GetPlaybackInfo()
        .and_then(|p| p.PlaybackStatus())
        .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

    let app_name = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_else(|_| "Media".to_string());

    if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
        if let Ok(props) = props_op.get() {
            let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
            let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
            let album = props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();
            if !title.is_empty() {
                return MediaState {
                    title,
                    artist,
                    album,
                    is_playing,
                    app_name,
                    duration_sec: 0.0,
                    position_sec: 0.0,
                    has_media: true,
                };
            }
        }
    }
    MediaState::default()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn fetch_now_playing() -> MediaState {
    MediaState::default()
}

#[tauri::command]
pub fn get_media_state() -> MediaState {
    fetch_now_playing()
}

#[cfg(target_os = "macos")]
fn send_macos_media_key(key_code: i32) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSPoint;
    use objc::{msg_send, sel, sel_impl};

    // NX_KEYTYPE_PLAY = 16, NX_KEYTYPE_NEXT = 17, NX_KEYTYPE_PREVIOUS = 18
    // NSEventTypeSystemDefined = 14
    unsafe {
        for state in [0xA_i32, 0xB_i32] {
            let data1 = ((key_code as isize) << 16) | ((state as isize) << 8);
            let event: id = msg_send![
                objc::class!(NSEvent),
                otherEventWithType: 14_u64
                location: NSPoint::new(0.0, 0.0)
                modifierFlags: 0_u64
                timestamp: 0.0_f64
                windowNumber: 0_i64
                context: nil
                subtype: 8_i16
                data1: data1
                data2: -1_isize
            ];
            if event != nil {
                let cg_event: *mut std::ffi::c_void = msg_send![event, CGEvent];
                if !cg_event.is_null() {
                    extern "C" {
                        fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
                    }
                    CGEventPost(0, cg_event);
                }
            }
        }
    }
}

#[tauri::command]
pub fn media_control(action: String) -> Result<MediaState, String> {
    #[cfg(target_os = "macos")]
    {
        let spotify_up = is_process_running("Spotify");
        let music_up = is_process_running("Music");
        if spotify_up || music_up {
            let cmd = match action.as_str() {
                "play_pause" => "playpause",
                "next" => "next track",
                "previous" => "previous track",
                _ => return Err("Unknown media action".to_string()),
            };
            let target = if spotify_up { "Spotify" } else { "Music" };
            let script = format!(r#"tell application "{target}" to {cmd}"#);
            Command::new("osascript")
                .args(["-e", &script])
                .status()
                .map_err(|e| e.to_string())?;
        } else {
            // Universal macOS media key fallback for Chrome, Safari, Arc, VLC, IINA, and any new app
            let key = match action.as_str() {
                "play_pause" => 16,
                "next" => 17,
                "previous" => 18,
                _ => return Err("Unknown media action".to_string()),
            };
            send_macos_media_key(key);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        if let Ok(op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            if let Ok(manager) = op.get() {
                if let Ok(session) = manager.GetCurrentSession() {
                    match action.as_str() {
                        "play_pause" => {
                            let _ = session.TryTogglePlayPauseAsync();
                        }
                        "next" => {
                            let _ = session.TrySkipNextAsync();
                        }
                        "previous" => {
                            let _ = session.TrySkipPreviousAsync();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(fetch_now_playing())
}

#[tauri::command]
pub fn media_seek(position_sec: f64) -> Result<MediaState, String> {
    #[cfg(target_os = "macos")]
    {
        let pos = position_sec.max(0.0);
        let spotify_up = is_process_running("Spotify");
        let music_up = is_process_running("Music");
        if spotify_up {
            let script = format!(r#"tell application "Spotify" to set player position to {pos}"#);
            let _ = Command::new("osascript").args(["-e", &script]).status();
        } else if music_up {
            let script = format!(r#"tell application "Music" to set player position to {pos}"#);
            let _ = Command::new("osascript").args(["-e", &script]).status();
        }
    }
    let _ = position_sec;
    Ok(fetch_now_playing())
}
