use arboard::Clipboard;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: String,
    pub content: String,
    pub kind: String, // "url" | "color" | "code" | "text"
    pub created_at: String,
    pub pinned: bool,
}

pub struct ClipboardStore {
    pub entries: Mutex<Vec<ClipboardEntry>>,
    pub last_seen: Mutex<String>,
    storage_path: PathBuf,
}

pub fn classify_clipboard_text(text: &str) -> &'static str {
    let trimmed = text.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        "url"
    } else if (trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7 || trimmed.len() == 9))
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        "color"
    } else if trimmed.contains('\n')
        || trimmed.contains("=>")
        || trimmed.contains("function ")
        || trimmed.contains("const ")
        || trimmed.contains("fn ")
    {
        "code"
    } else {
        "text"
    }
}

pub fn insert_entry_dedup(entries: &mut Vec<ClipboardEntry>, content: String, max_items: usize) -> bool {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return false;
    }
    if let Some(first) = entries.first() {
        if first.content == content {
            return false;
        }
    }
    // Preserve pinned state if the exact same text existed earlier
    let was_pinned = entries
        .iter()
        .find(|e| e.content == content)
        .map(|e| e.pinned)
        .unwrap_or(false);
    entries.retain(|e| e.content != content);

    let entry = ClipboardEntry {
        id: Uuid::new_v4().to_string(),
        kind: classify_clipboard_text(&content).to_string(),
        content,
        created_at: Utc::now().to_rfc3339(),
        pinned: was_pinned,
    };
    entries.insert(0, entry);

    // Keep pinned items plus up to max_items total
    if entries.len() > max_items {
        let mut kept = Vec::with_capacity(max_items);
        let mut unpinned_count = 0usize;
        for item in entries.drain(..) {
            if item.pinned {
                kept.push(item);
            } else if unpinned_count < max_items {
                unpinned_count += 1;
                kept.push(item);
            }
        }
        *entries = kept;
    }
    true
}

impl ClipboardStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&app_data_dir);
        let storage_path = app_data_dir.join("clipboard.json");
        let entries = fs::read_to_string(&storage_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<ClipboardEntry>>(&s).ok())
            .unwrap_or_default();

        let last = entries.first().map(|e| e.content.clone()).unwrap_or_default();
        Self {
            entries: Mutex::new(entries),
            last_seen: Mutex::new(last),
            storage_path,
        }
    }

    fn persist(&self, entries: &[ClipboardEntry]) {
        if let Ok(json) = serde_json::to_string_pretty(entries) {
            let _ = fs::write(&self.storage_path, json);
        }
    }

    pub fn poll_once(&self) -> Option<Vec<ClipboardEntry>> {
        let mut cb = Clipboard::new().ok()?;
        let text = cb.get_text().ok()?;
        if text.trim().is_empty() || text.len() > 50_000 {
            return None;
        }
        {
            let mut last = self.last_seen.lock().ok()?;
            if *last == text {
                return None;
            }
            *last = text.clone();
        }
        let mut guard = self.entries.lock().ok()?;
        if insert_entry_dedup(&mut guard, text, 40) {
            self.persist(&guard);
            Some(guard.clone())
        } else {
            None
        }
    }

    pub fn list(&self) -> Vec<ClipboardEntry> {
        self.entries.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn copy_back(&self, id: &str) -> Result<(), String> {
        let content = {
            let guard = self.entries.lock().map_err(|e| e.to_string())?;
            guard
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.content.clone())
                .ok_or_else(|| "Clipboard entry not found".to_string())?
        };
        if let Ok(mut last) = self.last_seen.lock() {
            *last = content.clone();
        }
        let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_text(content).map_err(|e| e.to_string())
    }

    pub fn toggle_pin(&self, id: &str) -> Vec<ClipboardEntry> {
        let mut guard = self.entries.lock().unwrap();
        if let Some(item) = guard.iter_mut().find(|e| e.id == id) {
            item.pinned = !item.pinned;
        }
        self.persist(&guard);
        guard.clone()
    }

    pub fn clear_unpinned(&self) -> Vec<ClipboardEntry> {
        let mut guard = self.entries.lock().unwrap();
        guard.retain(|e| e.pinned);
        self.persist(&guard);
        guard.clone()
    }
}

#[tauri::command]
pub fn get_clipboard_history(state: tauri::State<ClipboardStore>) -> Vec<ClipboardEntry> {
    state.list()
}

#[tauri::command]
pub fn copy_clipboard_entry(state: tauri::State<ClipboardStore>, id: String) -> Result<(), String> {
    state.copy_back(&id)
}

#[tauri::command]
pub fn toggle_pin_clipboard_entry(
    state: tauri::State<ClipboardStore>,
    id: String,
) -> Vec<ClipboardEntry> {
    state.toggle_pin(&id)
}

#[tauri::command]
pub fn clear_clipboard_history(state: tauri::State<ClipboardStore>) -> Vec<ClipboardEntry> {
    state.clear_unpinned()
}

#[tauri::command]
pub fn copy_text_to_clipboard(
    state: tauri::State<ClipboardStore>,
    text: String,
) -> Result<(), String> {
    if let Ok(mut last) = state.last_seen.lock() {
        *last = text.clone();
    }
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_clipboard_text() {
        assert_eq!(classify_clipboard_text("https://orbitnotch.app"), "url");
        assert_eq!(classify_clipboard_text("#22D3EE"), "color");
        assert_eq!(classify_clipboard_text("const x = () => 1;"), "code");
        assert_eq!(classify_clipboard_text("hello world"), "text");
    }

    #[test]
    fn test_insert_entry_dedup_preserves_pin() {
        let mut list = vec![];
        assert!(insert_entry_dedup(&mut list, "first".into(), 10));
        list[0].pinned = true;
        assert!(insert_entry_dedup(&mut list, "second".into(), 10));
        assert!(insert_entry_dedup(&mut list, "first".into(), 10));
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].content, "first");
        assert!(list[0].pinned);
    }
}
