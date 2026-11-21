import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { NotchContainer } from "./components/NotchContainer";
import { useNotchStore } from "./store/useNotchStore";
import type {
  ClipboardEntry,
  DisplayEnvironment,
  HudPayload,
  MediaState,
  MeetingEvent,
  MonitorSummary,
  ShelfItem,
  SystemStats,
} from "./types/notch";

export function App() {
  const setDisplayEnv = useNotchStore((s) => s.setDisplayEnv);
  const setMonitors = useNotchStore((s) => s.setMonitors);
  const setSystemStats = useNotchStore((s) => s.setSystemStats);
  const setMediaState = useNotchStore((s) => s.setMediaState);
  const setClipboard = useNotchStore((s) => s.setClipboard);
  const setShelf = useNotchStore((s) => s.setShelf);
  const setMeetings = useNotchStore((s) => s.setMeetings);
  const toggleExpanded = useNotchStore((s) => s.toggleExpanded);
  const triggerPeek = useNotchStore((s) => s.triggerPeek);
  const triggerHud = useNotchStore((s) => s.triggerHud);
  const tickPomodoro = useNotchStore((s) => s.tickPomodoro);
  const hideInFullscreen = useNotchStore((s) => s.hideInFullscreen);
  const replaceSystemHud = useNotchStore((s) => s.replaceSystemHud);
  const activatePro = useNotchStore((s) => s.activatePro);
  const setWeatherLabel = useNotchStore((s) => s.setWeatherLabel);
  const prevStatsRef = useRef<SystemStats | null>(null);

  useEffect(() => {
    // Initial hydration from Rust backend
    invoke<DisplayEnvironment>("get_display_environment")
      .then(setDisplayEnv)
      .catch(() => {});
    invoke<MonitorSummary[]>("list_monitors")
      .then(setMonitors)
      .catch(() => {});
    invoke<SystemStats>("get_system_stats")
      .then(setSystemStats)
      .catch(() => {});
    invoke<MediaState>("get_media_state")
      .then(setMediaState)
      .catch(() => {});
    invoke<ClipboardEntry[]>("get_clipboard_history")
      .then(setClipboard)
      .catch(() => {});
    invoke<ShelfItem[]>("get_shelf_items")
      .then(setShelf)
      .catch(() => {});
    invoke<MeetingEvent[]>("get_upcoming_meetings")
      .then(setMeetings)
      .catch(() => {});
    invoke("set_replace_system_hud", { enabled: replaceSystemHud }).catch(() => {});
    invoke<string>("get_saved_license_key")
      .then((savedKey) => {
        if (savedKey && savedKey.trim().length >= 8) {
          activatePro(savedKey);
        }
      })
      .catch(() => {});

    const unlisteners: Promise<() => void>[] = [
      listen("notch://toggle", () => toggleExpanded()),
      listen<HudPayload>("notch://hud", (e) => triggerHud(e.payload)),
      listen<SystemStats>("system://stats", (e) => {
        const next = e.payload;
        const prev = prevStatsRef.current;
        if (prev) {
          if (next.isCharging && !prev.isCharging) {
            triggerPeek({ kind: "charging", label: `Charging ${next.batteryPercent ?? ""}%` });
          } else if (
            !replaceSystemHud &&
            next.volumePercent !== null &&
            prev.volumePercent !== null &&
            next.volumePercent !== prev.volumePercent
          ) {
            triggerPeek({ kind: "volume", label: `Vol ${next.volumePercent}%` });
          } else if (
            next.batteryPercent !== null &&
            next.batteryPercent <= 20 &&
            !next.isCharging &&
            (prev.batteryPercent === null || prev.batteryPercent > 20)
          ) {
            triggerPeek({ kind: "battery", label: `Low ${next.batteryPercent}%` });
          }
        }
        prevStatsRef.current = next;
        setSystemStats(next);
      }),
      listen<MediaState>("media://state", (e) => setMediaState(e.payload)),
      listen<ClipboardEntry[]>("clipboard://updated", (e) => setClipboard(e.payload)),
      listen<ShelfItem[]>("shelf://updated", (e) => {
        setShelf(e.payload);
        triggerPeek({ kind: "screenshot", label: "Screenshot" });
      }),
    ];

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, [
    setClipboard,
    setDisplayEnv,
    setMediaState,
    setMeetings,
    setMonitors,
    setShelf,
    setSystemStats,
    toggleExpanded,
    triggerHud,
    triggerPeek,
    replaceSystemHud,
  ]);

  // 1-second Pomodoro ticker
  useEffect(() => {
    const id = window.setInterval(tickPomodoro, 1000);
    return () => window.clearInterval(id);
  }, [tickPomodoro]);

  // Mini Weather Badge (Open-Meteo, free & no API key, refreshed every 30m)
  useEffect(() => {
    const loadWeather = async () => {
      try {
        const geo = await fetch("https://ipapi.co/json/").then((r) => r.json());
        if (!geo?.latitude || !geo?.longitude) return;
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current_weather=true`
        ).then((r) => r.json());
        const temp = w?.current_weather?.temperature;
        const code = w?.current_weather?.weathercode ?? 0;
        if (typeof temp === "number") {
          const icon = code >= 51 ? "🌧" : code >= 2 ? "⛅" : "☀";
          setWeatherLabel(`${Math.round(temp)}°C ${icon}`);
        }
      } catch {
        // Ignore offline
      }
    };
    loadWeather();
    const id = window.setInterval(loadWeather, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [setWeatherLabel]);

  // Optional Auto-Hide in Fullscreen
  useEffect(() => {
    if (!hideInFullscreen) {
      invoke("set_notch_visible", { visible: true }).catch(() => {});
      return;
    }
    const id = window.setInterval(async () => {
      try {
        const fs = await invoke<boolean>("is_fullscreen_active");
        await invoke("set_notch_visible", { visible: !fs });
      } catch {
        // Ignore
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [hideInFullscreen]);

  return <NotchContainer />;
}

export default App;
