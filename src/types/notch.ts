export type NotchTab =
  | "shelf"
  | "media"
  | "productivity"
  | "quick"
  | "system"
  | "meeting"
  | "settings";

export interface PeekEvent {
  kind: "charging" | "battery" | "volume" | "screenshot";
  label: string;
}

export type NotchMode = "auto" | "hardware" | "floating";
export type NotchTheme = "obsidian" | "oled" | "frosted";

export interface DisplayEnvironment {
  hasHardwareNotch: boolean;
  notchWidth: number;
  notchHeight: number;
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
  platform: string;
  monitorCount: number;
}

export interface MonitorSummary {
  index: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface SystemStats {
  cpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  memoryPercent: number;
  netDownKbps: number;
  netUpKbps: number;
  batteryPercent: number | null;
  isCharging: boolean;
  volumePercent: number | null;
  isMuted: boolean;
}

export interface MediaState {
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  isPlaying: boolean;
  appName: string;
  durationSec: number;
  positionSec: number;
  hasMedia: boolean;
}

export interface ClipboardEntry {
  id: string;
  content: string;
  kind: "url" | "color" | "code" | "text";
  createdAt: string;
  pinned: boolean;
}

export interface ShelfItem {
  id: string;
  name: string;
  kind: "image" | "file" | "folder" | "text";
  path: string | null;
  textContent: string | null;
  sizeBytes: number;
  previewDataUrl: string | null;
  addedAt: string;
  pinned: boolean;
}

export interface MeetingEvent {
  id: string;
  title: string;
  startIso: string;
  endIso: string | null;
  meetingUrl: string | null;
}
