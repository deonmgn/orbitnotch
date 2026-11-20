use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::{Networks, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub memory_used_gb: f64,
    pub memory_total_gb: f64,
    pub memory_percent: f64,
    pub net_down_kbps: f64,
    pub net_up_kbps: f64,
    pub battery_percent: Option<u8>,
    pub is_charging: bool,
    pub volume_percent: Option<u8>,
    pub is_muted: bool,
}

pub struct SystemCollector {
    sys: System,
    networks: Networks,
}

impl SystemCollector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let networks = Networks::new_with_refreshed_list();
        Self { sys, networks }
    }

    pub fn sample(&mut self, interval_secs: f64) -> SystemStats {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.networks.refresh(true);

        let cpu_percent = self.sys.global_cpu_usage();
        let total_bytes = self.sys.total_memory() as f64;
        let used_bytes = self.sys.used_memory() as f64;
        let memory_total_gb = total_bytes / 1_073_741_824.0;
        let memory_used_gb = used_bytes / 1_073_741_824.0;
        let memory_percent = if total_bytes > 0.0 {
            (used_bytes / total_bytes) * 100.0
        } else {
            0.0
        };

        let mut rx_bytes = 0u64;
        let mut tx_bytes = 0u64;
        for (_iface, data) in &self.networks {
            rx_bytes += data.received();
            tx_bytes += data.transmitted();
        }
        let secs = interval_secs.max(0.5);
        let net_down_kbps = (rx_bytes as f64 / 1024.0) / secs;
        let net_up_kbps = (tx_bytes as f64 / 1024.0) / secs;

        let (battery_percent, is_charging) = read_battery_status();
        let (volume_percent, is_muted) = read_volume_status();

        SystemStats {
            cpu_percent,
            memory_used_gb,
            memory_total_gb,
            memory_percent,
            net_down_kbps,
            net_up_kbps,
            battery_percent,
            is_charging,
            volume_percent,
            is_muted,
        }
    }
}

#[cfg(target_os = "macos")]
fn read_battery_status() -> (Option<u8>, bool) {
    let Ok(output) = Command::new("pmset").arg("-g").arg("batt").output() else {
        return (None, false);
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let is_charging = text.contains("AC Power") || text.contains("charging;");
    for token in text.split_whitespace() {
        if let Some(pct_str) = token.strip_suffix("%;") {
            if let Ok(pct) = pct_str.parse::<u8>() {
                return (Some(pct), is_charging);
            }
        }
    }
    (None, is_charging)
}

#[cfg(target_os = "windows")]
fn read_battery_status() -> (Option<u8>, bool) {
    let Ok(output) = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress)",
        ])
        .output()
    else {
        return (None, false);
    };
    let text = String::from_utf8_lossy(&output.stdout);
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(text.trim()) {
        let pct = val["EstimatedChargeRemaining"].as_u64().map(|v| v.min(100) as u8);
        let status = val["BatteryStatus"].as_u64().unwrap_or(0);
        let charging = matches!(status, 2 | 6 | 7 | 8 | 9);
        return (pct, charging);
    }
    (None, false)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_battery_status() -> (Option<u8>, bool) {
    (None, false)
}

#[cfg(target_os = "macos")]
fn read_volume_status() -> (Option<u8>, bool) {
    let Ok(output) = Command::new("osascript")
        .args([
            "-e",
            "set o to get volume settings\nreturn (output volume of o as string) & \",\" & (output muted of o as string)",
        ])
        .output()
    else {
        return (None, false);
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = text.trim().split(',').collect();
    if parts.len() == 2 {
        let vol = parts[0].trim().parse::<u8>().ok();
        let muted = parts[1].trim() == "true";
        return (vol, muted);
    }
    (None, false)
}

#[cfg(not(target_os = "macos"))]
fn read_volume_status() -> (Option<u8>, bool) {
    (None, false)
}

#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    let mut collector = SystemCollector::new();
    collector.sample(1.0)
}

#[tauri::command]
pub fn set_system_volume(volume: u8) -> Result<(), String> {
    let clamped = volume.min(100);
    #[cfg(target_os = "macos")]
    {
        Command::new("osascript")
            .args(["-e", &format!("set volume output volume {}", clamped)])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let steps = (clamped as f32 / 2.0).round() as usize;
        let script = format!(
            "$w = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 50;$i++){{$w.SendKeys([char]174)}}; for($i=0;$i -lt {};$i++){{$w.SendKeys([char]175)}}",
            steps
        );
        Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn toggle_system_mute() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("osascript")
            .args([
                "-e",
                "set m to output muted of (get volume settings)\nset volume output muted (not m)",
            ])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(New-Object -ComObject WScript.Shell).SendKeys([char]173)",
            ])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn trigger_screenshot() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("screencapture")
            .args(["-i", "-c"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("ms-screenclip:")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn lock_screen() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("pmset")
            .arg("displaysleepnow")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .args(["user32.dll,LockWorkStation"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}
