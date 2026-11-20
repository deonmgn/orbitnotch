use chrono::{DateTime, Duration, Local, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingEvent {
    pub id: String,
    pub title: String,
    pub start_iso: String,
    pub end_iso: Option<String>,
    pub meeting_url: Option<String>,
}

pub struct CalendarStore {
    events: Mutex<Vec<MeetingEvent>>,
    storage_path: PathBuf,
}

pub fn extract_meeting_url(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
        if let Some(idx) = word.find("https://") {
            let candidate = &word[idx..];
            let clean = candidate
                .trim_matches(|c: char| matches!(c, '<' | '>' | '"' | '\'' | ',' | ')' | ';'));
            if clean.contains("meet.google.com")
                || clean.contains("zoom.us")
                || clean.contains("teams.microsoft.com")
                || clean.contains("whereby.com")
            {
                return Some(clean.to_string());
            }
        }
    }
    None
}

pub fn parse_ics_datetime(raw: &str) -> Option<DateTime<Utc>> {
    let val = raw.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(val) {
        return Some(dt.with_timezone(&Utc));
    }
    if val.ends_with('Z') && val.len() >= 16 {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&val[..15], "%Y%m%dT%H%M%S") {
            return Some(Utc.from_utc_datetime(&naive));
        }
    }
    if val.len() >= 15 {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&val[..15], "%Y%m%dT%H%M%S") {
            return Local.from_local_datetime(&naive).single().map(|d| d.with_timezone(&Utc));
        }
    }
    None
}

pub fn parse_ics_events(ics_content: &str) -> Vec<MeetingEvent> {
    let mut events = Vec::new();
    let mut in_event = false;
    let mut title = String::new();
    let mut start: Option<DateTime<Utc>> = None;
    let mut end: Option<DateTime<Utc>> = None;
    let mut url: Option<String> = None;

    // Unfold RFC 5545 folded lines
    let unfolded = ics_content.replace("\r\n ", "").replace("\n ", "");
    for line in unfolded.lines() {
        let line = line.trim();
        if line == "BEGIN:VEVENT" {
            in_event = true;
            title.clear();
            start = None;
            end = None;
            url = None;
        } else if line == "END:VEVENT" && in_event {
            in_event = false;
            if let Some(st) = start {
                events.push(MeetingEvent {
                    id: Uuid::new_v4().to_string(),
                    title: if title.is_empty() {
                        "Meeting".to_string()
                    } else {
                        title.clone()
                    },
                    start_iso: st.to_rfc3339(),
                    end_iso: end.map(|e| e.to_rfc3339()),
                    meeting_url: url.clone(),
                });
            }
        } else if in_event {
            if let Some(rest) = line.strip_prefix("SUMMARY:") {
                title = rest.to_string();
            } else if line.starts_with("DTSTART") {
                if let Some((_, val)) = line.split_once(':') {
                    start = parse_ics_datetime(val);
                }
            } else if line.starts_with("DTEND") {
                if let Some((_, val)) = line.split_once(':') {
                    end = parse_ics_datetime(val);
                }
            } else if line.starts_with("LOCATION:") || line.starts_with("DESCRIPTION:") || line.starts_with("URL:") {
                if url.is_none() {
                    url = extract_meeting_url(line);
                }
            }
        }
    }
    events.sort_by(|a, b| a.start_iso.cmp(&b.start_iso));
    events
}

impl CalendarStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&app_data_dir);
        let storage_path = app_data_dir.join("meetings.json");
        let events = fs::read_to_string(&storage_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<MeetingEvent>>(&s).ok())
            .unwrap_or_default();
        Self {
            events: Mutex::new(events),
            storage_path,
        }
    }

    fn persist(&self, events: &[MeetingEvent]) {
        if let Ok(json) = serde_json::to_string_pretty(events) {
            let _ = fs::write(&self.storage_path, json);
        }
    }

    pub fn list_upcoming(&self) -> Vec<MeetingEvent> {
        let now = Utc::now() - Duration::minutes(15);
        let guard = self.events.lock().unwrap();
        let mut upcoming: Vec<MeetingEvent> = guard
            .iter()
            .filter(|e| {
                DateTime::parse_from_rfc3339(&e.start_iso)
                    .map(|d| d.with_timezone(&Utc) >= now)
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        upcoming.sort_by(|a, b| a.start_iso.cmp(&b.start_iso));
        upcoming
    }

    pub fn add_manual(&self, title: String, start_iso: String, meeting_url: Option<String>) -> Vec<MeetingEvent> {
        let mut guard = self.events.lock().unwrap();
        guard.push(MeetingEvent {
            id: Uuid::new_v4().to_string(),
            title,
            start_iso,
            end_iso: None,
            meeting_url: meeting_url.filter(|u| !u.trim().is_empty()),
        });
        guard.sort_by(|a, b| a.start_iso.cmp(&b.start_iso));
        self.persist(&guard);
        self.list_upcoming_locked(&guard)
    }

    pub fn import_ics_text(&self, ics: &str) -> Vec<MeetingEvent> {
        let parsed = parse_ics_events(ics);
        let mut guard = self.events.lock().unwrap();
        for ev in parsed {
            if !guard
                .iter()
                .any(|existing| existing.title == ev.title && existing.start_iso == ev.start_iso)
            {
                guard.push(ev);
            }
        }
        guard.sort_by(|a, b| a.start_iso.cmp(&b.start_iso));
        self.persist(&guard);
        self.list_upcoming_locked(&guard)
    }

    pub fn remove(&self, id: &str) -> Vec<MeetingEvent> {
        let mut guard = self.events.lock().unwrap();
        guard.retain(|e| e.id != id);
        self.persist(&guard);
        self.list_upcoming_locked(&guard)
    }

    fn list_upcoming_locked(&self, guard: &[MeetingEvent]) -> Vec<MeetingEvent> {
        let now = Utc::now() - Duration::minutes(15);
        guard
            .iter()
            .filter(|e| {
                DateTime::parse_from_rfc3339(&e.start_iso)
                    .map(|d| d.with_timezone(&Utc) >= now)
                    .unwrap_or(false)
            })
            .cloned()
            .collect()
    }
}

#[tauri::command]
pub fn get_upcoming_meetings(state: tauri::State<CalendarStore>) -> Vec<MeetingEvent> {
    state.list_upcoming()
}

#[tauri::command]
pub fn add_meeting(
    state: tauri::State<CalendarStore>,
    title: String,
    start_iso: String,
    meeting_url: Option<String>,
) -> Vec<MeetingEvent> {
    state.add_manual(title, start_iso, meeting_url)
}

#[tauri::command]
pub fn import_ics_content(state: tauri::State<CalendarStore>, ics_content: String) -> Vec<MeetingEvent> {
    state.import_ics_text(&ics_content)
}

#[tauri::command]
pub fn import_ics_file(state: tauri::State<CalendarStore>, path: String) -> Result<Vec<MeetingEvent>, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(state.import_ics_text(&content))
}

#[tauri::command]
pub fn remove_meeting(state: tauri::State<CalendarStore>, id: String) -> Vec<MeetingEvent> {
    state.remove(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ics_events() {
        let sample = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Design Sync\r\nDTSTART:20261201T090000Z\r\nLOCATION:https://meet.google.com/abc-defg-hij\r\nEND:VEVENT\r\nEND:VCALENDAR";
        let events = parse_ics_events(sample);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].title, "Design Sync");
        assert_eq!(
            events[0].meeting_url.as_deref(),
            Some("https://meet.google.com/abc-defg-hij")
        );
    }
}
