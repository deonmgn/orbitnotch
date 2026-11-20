use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: String,
    pub name: String,
    pub kind: String, // "image" | "file" | "folder" | "text"
    pub path: Option<String>,
    pub text_content: Option<String>,
    pub size_bytes: u64,
    pub preview_data_url: Option<String>,
    pub added_at: String,
    pub pinned: bool,
}

pub struct ShelfStore {
    items: Mutex<Vec<ShelfItem>>,
    manifest_path: PathBuf,
}

pub fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg"
    )
}

fn build_image_preview(path: &Path, size_bytes: u64) -> Option<String> {
    if size_bytes > 2_500_000 {
        return None;
    }
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    if !is_image_extension(&ext) {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

impl ShelfStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let shelf_dir = app_data_dir.join("shelf");
        let _ = fs::create_dir_all(&shelf_dir);
        let manifest_path = shelf_dir.join("manifest.json");
        let items = fs::read_to_string(&manifest_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<ShelfItem>>(&s).ok())
            .unwrap_or_default();

        Self {
            items: Mutex::new(items),
            manifest_path,
        }
    }

    fn persist(&self, items: &[ShelfItem]) {
        if let Ok(json) = serde_json::to_string_pretty(items) {
            let _ = fs::write(&self.manifest_path, json);
        }
    }

    pub fn list(&self) -> Vec<ShelfItem> {
        self.items.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn add_files(&self, paths: Vec<String>) -> Vec<ShelfItem> {
        let mut guard = self.items.lock().unwrap();
        for p in paths {
            let path = PathBuf::from(&p);
            if !path.exists() {
                continue;
            }
            if guard.iter().any(|item| item.path.as_deref() == Some(p.as_str())) {
                continue;
            }
            let meta = fs::metadata(&path).ok();
            let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size_bytes = meta.map(|m| m.len()).unwrap_or(0);
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();
            let kind = if is_dir {
                "folder".to_string()
            } else if is_image_extension(&ext) {
                "image".to_string()
            } else {
                "file".to_string()
            };
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("File")
                .to_string();
            let preview_data_url = if kind == "image" {
                build_image_preview(&path, size_bytes)
            } else {
                None
            };

            guard.insert(
                0,
                ShelfItem {
                    id: Uuid::new_v4().to_string(),
                    name,
                    kind,
                    path: Some(p),
                    text_content: None,
                    size_bytes,
                    preview_data_url,
                    added_at: Utc::now().to_rfc3339(),
                    pinned: false,
                },
            );
        }
        self.persist(&guard);
        guard.clone()
    }

    pub fn add_text(&self, text: String) -> Vec<ShelfItem> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return self.list();
        }
        let mut guard = self.items.lock().unwrap();
        let preview_name: String = trimmed.chars().take(36).collect();
        guard.insert(
            0,
            ShelfItem {
                id: Uuid::new_v4().to_string(),
                name: preview_name,
                kind: "text".to_string(),
                path: None,
                size_bytes: text.len() as u64,
                text_content: Some(text),
                preview_data_url: None,
                added_at: Utc::now().to_rfc3339(),
                pinned: false,
            },
        );
        self.persist(&guard);
        guard.clone()
    }

    pub fn remove(&self, id: &str) -> Vec<ShelfItem> {
        let mut guard = self.items.lock().unwrap();
        guard.retain(|i| i.id != id);
        self.persist(&guard);
        guard.clone()
    }

    pub fn toggle_pin(&self, id: &str) -> Vec<ShelfItem> {
        let mut guard = self.items.lock().unwrap();
        if let Some(item) = guard.iter_mut().find(|i| i.id == id) {
            item.pinned = !item.pinned;
        }
        self.persist(&guard);
        guard.clone()
    }

    pub fn clear_unpinned(&self) -> Vec<ShelfItem> {
        let mut guard = self.items.lock().unwrap();
        guard.retain(|i| i.pinned);
        self.persist(&guard);
        guard.clone()
    }

    pub fn poll_new_screenshots(&self) -> Option<Vec<ShelfItem>> {
        let mut candidates = Vec::new();
        if let Some(desktop) = dirs::desktop_dir() {
            candidates.push(desktop);
        }
        if let Some(pics) = dirs::picture_dir() {
            candidates.push(pics.join("Screenshots"));
        }

        let now = std::time::SystemTime::now();
        let mut new_paths = Vec::new();
        for dir in candidates {
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                let is_screenshot = name.starts_with("Screenshot ")
                    || name.starts_with("Tangkapan Layar ")
                    || name.starts_with("Screenshot_");
                if !is_screenshot || !name.to_ascii_lowercase().ends_with(".png") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(age) = now.duration_since(modified) {
                            if age.as_secs() <= 10 {
                                new_paths.push(path.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }

        if new_paths.is_empty() {
            return None;
        }
        let before_len = self.items.lock().map(|g| g.len()).unwrap_or(0);
        let updated = self.add_files(new_paths);
        if updated.len() > before_len {
            Some(updated)
        } else {
            None
        }
    }
}

#[tauri::command]
pub fn get_shelf_items(state: tauri::State<ShelfStore>) -> Vec<ShelfItem> {
    state.list()
}

#[tauri::command]
pub fn add_shelf_files(state: tauri::State<ShelfStore>, paths: Vec<String>) -> Vec<ShelfItem> {
    state.add_files(paths)
}

#[tauri::command]
pub fn add_shelf_text(state: tauri::State<ShelfStore>, text: String) -> Vec<ShelfItem> {
    state.add_text(text)
}

#[tauri::command]
pub fn remove_shelf_item(state: tauri::State<ShelfStore>, id: String) -> Vec<ShelfItem> {
    state.remove(&id)
}

#[tauri::command]
pub fn toggle_pin_shelf_item(state: tauri::State<ShelfStore>, id: String) -> Vec<ShelfItem> {
    state.toggle_pin(&id)
}

#[tauri::command]
pub fn clear_shelf_items(state: tauri::State<ShelfStore>) -> Vec<ShelfItem> {
    state.clear_unpinned()
}

#[tauri::command]
pub fn open_shelf_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let escaped = path.replace('"', "\\\"");
        let script = format!(
            r#"set the clipboard to (read (POSIX file "{escaped}") as «class PNGf»)"#
        );
        std::process::Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let escaped = path.replace('\'', "''");
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('{escaped}'))"
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_image_extension() {
        assert!(is_image_extension("PNG"));
        assert!(is_image_extension("webp"));
        assert!(!is_image_extension("pdf"));
    }

    #[test]
    fn test_shelf_add_and_clear_text() {
        let tmp = std::env::temp_dir().join(format!("orbitnotch-test-{}", Uuid::new_v4()));
        let store = ShelfStore::new(tmp.clone());
        let items = store.add_text("Hello OrbitNotch".to_string());
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "text");
        let after_clear = store.clear_unpinned();
        assert_eq!(after_clear.len(), 0);
        let _ = fs::remove_dir_all(tmp);
    }
}
