import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  BluetoothDeviceBattery,
  ClipboardEntry,
  DisplayEnvironment,
  HudPayload,
  MediaState,
  MeetingEvent,
  MonitorSummary,
  NotchMode,
  NotchTab,
  NotchTheme,
  PeekEvent,
  ShelfItem,
  SystemStats,
} from "../types/notch";

interface PomodoroState {
  running: boolean;
  phase: "work" | "break";
  secondsLeft: number;
  workMinutes: number;
  breakMinutes: number;
}

interface NotchStore {
  isExpanded: boolean;
  isDraggingFile: boolean;
  isDialogOpen: boolean;
  isPro: boolean;
  licenseKey: string;
  hideInFullscreen: boolean;
  replaceSystemHud: boolean;
  weatherLabel: string | null;
  enabledTabs: NotchTab[];
  peekEvent: PeekEvent | null;
  hudOverlay: HudPayload | null;
  btBanner: BluetoothDeviceBattery | null;
  activeTab: NotchTab;
  notchMode: NotchMode;
  theme: NotchTheme;
  displayEnv: DisplayEnvironment;
  monitors: MonitorSummary[];
  selectedMonitor: number;
  systemStats: SystemStats;
  mediaState: MediaState;
  clipboard: ClipboardEntry[];
  shelf: ShelfItem[];
  meetings: MeetingEvent[];
  notes: string;
  pomodoro: PomodoroState;

  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setDraggingFile: (dragging: boolean) => void;
  setDialogOpen: (open: boolean) => void;
  setHideInFullscreen: (hide: boolean) => void;
  setReplaceSystemHud: (enabled: boolean) => void;
  setWeatherLabel: (label: string | null) => void;
  toggleTabEnabled: (tab: NotchTab) => void;
  activatePro: (key: string) => void;
  deactivatePro: () => void;
  triggerPeek: (event: PeekEvent) => void;
  triggerHud: (hud: HudPayload) => void;
  triggerBtBanner: (device: BluetoothDeviceBattery) => void;
  setActiveTab: (tab: NotchTab) => void;
  setNotchMode: (mode: NotchMode) => void;
  setTheme: (theme: NotchTheme) => void;
  setDisplayEnv: (env: DisplayEnvironment) => void;
  setMonitors: (monitors: MonitorSummary[]) => void;
  setSelectedMonitor: (index: number) => void;
  setSystemStats: (stats: SystemStats) => void;
  setMediaState: (media: MediaState) => void;
  setClipboard: (entries: ClipboardEntry[]) => void;
  setShelf: (items: ShelfItem[]) => void;
  setMeetings: (events: MeetingEvent[]) => void;
  setNotes: (notes: string) => void;

  startPausePomodoro: () => void;
  resetPomodoro: (workMinutes?: number) => void;
  tickPomodoro: () => void;
}

const savedNotes =
  typeof window !== "undefined" ? localStorage.getItem("orbitnotch_notes") ?? "" : "";
const savedMode =
  (typeof window !== "undefined"
    ? (localStorage.getItem("orbitnotch_mode") as NotchMode | null)
    : null) ?? "auto";
const savedTheme =
  (typeof window !== "undefined"
    ? (localStorage.getItem("orbitnotch_theme") as NotchTheme | null)
    : null) ?? "obsidian";
const savedLicense =
  typeof window !== "undefined" ? localStorage.getItem("orbitnotch_license") ?? "" : "";
const savedHideFs =
  typeof window !== "undefined" ? localStorage.getItem("orbitnotch_hide_fs") === "true" : false;
const savedReplaceHud =
  typeof window !== "undefined"
    ? localStorage.getItem("orbitnotch_replace_hud") !== "false"
    : true;
const DEFAULT_TABS: NotchTab[] = ["shelf", "media", "productivity", "quick", "system", "meeting"];
const savedTabs: NotchTab[] = (() => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("orbitnotch_tabs") : null;
    if (!raw) return DEFAULT_TABS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TABS;
  } catch {
    return DEFAULT_TABS;
  }
})();

export const useNotchStore = create<NotchStore>((set) => ({
  isExpanded: false,
  isDraggingFile: false,
  isDialogOpen: false,
  isPro: savedLicense.trim().length >= 8,
  licenseKey: savedLicense,
  hideInFullscreen: savedHideFs,
  replaceSystemHud: savedReplaceHud,
  weatherLabel: null,
  enabledTabs: savedTabs,
  peekEvent: null,
  hudOverlay: null,
  btBanner: null,
  activeTab: "shelf",
  notchMode: savedMode,
  theme: savedTheme,
  displayEnv: {
    hasHardwareNotch: false,
    notchWidth: 200,
    notchHeight: 34,
    screenWidth: 1440,
    screenHeight: 900,
    scaleFactor: 1,
    platform: "macos",
    monitorCount: 1,
  },
  monitors: [],
  selectedMonitor: 0,
  systemStats: {
    cpuPercent: 0,
    memoryUsedGb: 0,
    memoryTotalGb: 16,
    memoryPercent: 0,
    netDownKbps: 0,
    netUpKbps: 0,
    batteryPercent: null,
    isCharging: false,
    volumePercent: 50,
    isMuted: false,
  },
  mediaState: {
    title: "",
    artist: "",
    album: "",
    artworkUrl: "",
    isPlaying: false,
    appName: "",
    durationSec: 0,
    positionSec: 0,
    hasMedia: false,
  },
  clipboard: [],
  shelf: [],
  meetings: [],
  notes: savedNotes,
  pomodoro: {
    running: false,
    phase: "work",
    secondsLeft: 25 * 60,
    workMinutes: 25,
    breakMinutes: 5,
  },

  setExpanded: (isExpanded) => set({ isExpanded }),
  toggleExpanded: () => set((s) => ({ isExpanded: !s.isExpanded })),
  setDraggingFile: (isDraggingFile) => set({ isDraggingFile }),
  setDialogOpen: (isDialogOpen) => set({ isDialogOpen }),
  setHideInFullscreen: (hideInFullscreen) => {
    localStorage.setItem("orbitnotch_hide_fs", String(hideInFullscreen));
    set({ hideInFullscreen });
  },
  setReplaceSystemHud: (replaceSystemHud) => {
    localStorage.setItem("orbitnotch_replace_hud", String(replaceSystemHud));
    set({ replaceSystemHud });
  },
  setWeatherLabel: (weatherLabel) => set({ weatherLabel }),
  toggleTabEnabled: (tab) =>
    set((s) => {
      const exists = s.enabledTabs.includes(tab);
      if (exists && s.enabledTabs.length <= 2) return s; // keep at least 2 tabs
      const next = exists
        ? s.enabledTabs.filter((t) => t !== tab)
        : [...s.enabledTabs, tab];
      localStorage.setItem("orbitnotch_tabs", JSON.stringify(next));
      return { enabledTabs: next };
    }),
  activatePro: (key) => {
    const clean = key.trim();
    localStorage.setItem("orbitnotch_license", clean);
    invoke("save_license_key", { key: clean }).catch(() => {});
    set({ isPro: clean.length >= 8, licenseKey: clean });
  },
  deactivatePro: () => {
    localStorage.removeItem("orbitnotch_license");
    invoke("clear_license_key").catch(() => {});
    set({ isPro: false, licenseKey: "" });
  },
  triggerPeek: (peekEvent) => {
    set({ peekEvent });
    window.setTimeout(() => {
      set((s) => (s.peekEvent === peekEvent ? { peekEvent: null } : s));
    }, 2400);
  },
  triggerHud: (hudOverlay) => {
    set({ hudOverlay });
    window.setTimeout(() => {
      set((s) => (s.hudOverlay === hudOverlay ? { hudOverlay: null } : s));
    }, 1800);
  },
  triggerBtBanner: (btBanner) => {
    set({ btBanner });
    window.setTimeout(() => {
      set((s) => (s.btBanner === btBanner ? { btBanner: null } : s));
    }, 3200);
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setNotchMode: (notchMode) => {
    localStorage.setItem("orbitnotch_mode", notchMode);
    set({ notchMode });
  },
  setTheme: (theme) => {
    localStorage.setItem("orbitnotch_theme", theme);
    set({ theme });
  },
  setDisplayEnv: (displayEnv) => set({ displayEnv }),
  setMonitors: (monitors) => set({ monitors }),
  setSelectedMonitor: (selectedMonitor) => set({ selectedMonitor }),
  setSystemStats: (systemStats) => set({ systemStats }),
  setMediaState: (mediaState) => set({ mediaState }),
  setClipboard: (clipboard) => set({ clipboard }),
  setShelf: (shelf) => set({ shelf }),
  setMeetings: (meetings) => set({ meetings }),
  setNotes: (notes) => {
    localStorage.setItem("orbitnotch_notes", notes);
    set({ notes });
  },

  startPausePomodoro: () =>
    set((s) => ({
      pomodoro: { ...s.pomodoro, running: !s.pomodoro.running },
    })),

  resetPomodoro: (workMinutes) =>
    set((s) => {
      const mins = workMinutes ?? s.pomodoro.workMinutes;
      return {
        pomodoro: {
          ...s.pomodoro,
          running: false,
          phase: "work",
          workMinutes: mins,
          secondsLeft: mins * 60,
        },
      };
    }),

  tickPomodoro: () =>
    set((s) => {
      if (!s.pomodoro.running) return s;
      if (s.pomodoro.secondsLeft > 1) {
        return {
          pomodoro: { ...s.pomodoro, secondsLeft: s.pomodoro.secondsLeft - 1 },
        };
      }
      const nextPhase = s.pomodoro.phase === "work" ? "break" : "work";
      const nextSeconds =
        (nextPhase === "work" ? s.pomodoro.workMinutes : s.pomodoro.breakMinutes) * 60;
      return {
        pomodoro: {
          ...s.pomodoro,
          phase: nextPhase,
          secondsLeft: nextSeconds,
          running: false,
        },
      };
    }),
}));
