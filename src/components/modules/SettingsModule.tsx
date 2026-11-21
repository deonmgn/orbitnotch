import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Crown,
  Keyboard,
  MessageSquarePlus,
  Monitor,
  Palette,
  Power,
  PowerOff,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { DisplayEnvironment, NotchMode, NotchTheme } from "../../types/notch";

type SetupTab = "appearance" | "behavior" | "account";

export function SettingsModule() {
  const notchMode = useNotchStore((s) => s.notchMode);
  const setNotchMode = useNotchStore((s) => s.setNotchMode);
  const theme = useNotchStore((s) => s.theme);
  const setTheme = useNotchStore((s) => s.setTheme);
  const monitors = useNotchStore((s) => s.monitors);
  const selectedMonitor = useNotchStore((s) => s.selectedMonitor);
  const setSelectedMonitor = useNotchStore((s) => s.setSelectedMonitor);
  const setDisplayEnv = useNotchStore((s) => s.setDisplayEnv);
  const displayEnv = useNotchStore((s) => s.displayEnv);
  const isPro = useNotchStore((s) => s.isPro);
  const licenseKey = useNotchStore((s) => s.licenseKey);
  const hideInFullscreen = useNotchStore((s) => s.hideInFullscreen);
  const setHideInFullscreen = useNotchStore((s) => s.setHideInFullscreen);
  const replaceSystemHud = useNotchStore((s) => s.replaceSystemHud);
  const setReplaceSystemHud = useNotchStore((s) => s.setReplaceSystemHud);
  const enabledTabs = useNotchStore((s) => s.enabledTabs);
  const toggleTabEnabled = useNotchStore((s) => s.toggleTabEnabled);
  const activatePro = useNotchStore((s) => s.activatePro);
  const deactivatePro = useNotchStore((s) => s.deactivatePro);

  const [subTab, setSubTab] = useState<SetupTab>("appearance");
  const [autostartOn, setAutostartOn] = useState(false);
  const [accessibilityOk, setAccessibilityOk] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState(licenseKey);
  const [verifying, setVerifying] = useState(false);

  const refreshAccessibility = () => {
    invoke<boolean>("get_accessibility_status")
      .then(setAccessibilityOk)
      .catch(() => {});
  };

  useEffect(() => {
    isEnabled()
      .then(setAutostartOn)
      .catch(() => {});
    refreshAccessibility();
    if (subTab === "behavior") {
      const id = window.setInterval(refreshAccessibility, 1500);
      return () => window.clearInterval(id);
    }
  }, [subTab]);

  const showNotice = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 2200);
  };

  const handleToggleAutostart = async () => {
    try {
      if (autostartOn) {
        await disable();
        setAutostartOn(false);
        showNotice("Autostart disabled");
      } else {
        await enable();
        setAutostartOn(true);
        showNotice("Autostart enabled");
      }
    } catch {
      showNotice("Autostart unavailable in dev");
    }
  };

  const handleSelectMonitor = async (idx: number) => {
    setSelectedMonitor(idx);
    try {
      const env = await invoke<DisplayEnvironment | null>("move_to_monitor", {
        monitorIndex: idx,
      });
      if (env) setDisplayEnv(env);
      showNotice(`Moved to Display ${idx + 1}`);
    } catch {
      // Ignore
    }
  };

  const handleActivatePro = async () => {
    const code = keyInput.trim();
    if (code.length < 6) {
      showNotice("Enter a valid key");
      return;
    }
    setVerifying(true);
    try {
      const resp = await fetch("https://orbitnotch.vercel.app/api/verify-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode: code }),
      });
      const json = await resp.json();
      if (json.valid) {
        activatePro(code);
        showNotice("Pro unlocked!");
      } else {
        showNotice(json.message || "Invalid license key");
      }
    } catch {
      showNotice("Network error verifying key");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2.5">
      {/* Sub-navigation + Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
          {[
            { id: "appearance", label: "Appearance", icon: Palette },
            { id: "behavior", label: "Behavior", icon: Sliders },
            { id: "account", label: "Pro & App", icon: Crown },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSubTab(id as SetupTab)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                subTab === id
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {statusMsg && (
          <span className="text-[11px] font-medium text-cyan-300 truncate">{statusMsg}</span>
        )}
      </div>

      {/* 1. Appearance */}
      {subTab === "appearance" && (
        <div className="flex-1 flex flex-col justify-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              Notch Style ({displayEnv.platform.toUpperCase()})
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "auto", label: "Auto-Adaptive" },
                  { id: "hardware", label: "Hardware Notch" },
                  { id: "floating", label: "Floating Pill" },
                ] as { id: NotchMode; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setNotchMode(opt.id);
                    showNotice(`Mode: ${opt.label}`);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-all ${
                    notchMode === opt.id
                      ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                      : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-violet-400" />
              Surface Theme
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "obsidian", label: "Obsidian" },
                  { id: "oled", label: "Pure OLED" },
                  { id: "frosted", label: "Frosted" },
                ] as { id: NotchTheme; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setTheme(opt.id);
                    showNotice(`Theme: ${opt.label}`);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border transition-all ${
                    theme === opt.id
                      ? "bg-violet-500/20 border-violet-400/50 text-violet-200"
                      : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-200">Active Display</span>
            <div className="flex flex-wrap gap-1.5">
              {(monitors.length > 0
                ? monitors
                : [{ index: 0, name: "Primary Display", width: 1440, height: 900, isPrimary: true }]
              ).map((m) => (
                <button
                  key={m.index}
                  onClick={() => handleSelectMonitor(m.index)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                    selectedMonitor === m.index
                      ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                      : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  {m.name} ({Math.round(m.width)}×{Math.round(m.height)})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Behavior & Modules */}
      {subTab === "behavior" && (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-200">Replace System Volume/Brightness HUD</p>
              <p className="text-[10px] text-slate-400">
                {displayEnv.platform === "macos" && !accessibilityOk
                  ? "Grant Accessibility + Input Monitoring, then refresh"
                  : "HUD Tap Active ✓ — Dynamic Island replaces OS popup"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {displayEnv.platform === "macos" && !accessibilityOk && (
                <>
                  <button
                    onClick={async () => {
                      const ok = await invoke<boolean>("request_accessibility_permission").catch(
                        () => false
                      );
                      setAccessibilityOk(ok);
                      showNotice(ok ? "Accessibility granted!" : "Enable OrbitNotch in Settings");
                    }}
                    className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] font-medium border border-amber-400/30"
                  >
                    Grant
                  </button>
                  <button
                    onClick={() => {
                      refreshAccessibility();
                      showNotice("Checked Accessibility");
                    }}
                    title="Refresh Accessibility status"
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </>
              )}
              <button
                onClick={async () => {
                  const next = !replaceSystemHud;
                  setReplaceSystemHud(next);
                  invoke("set_replace_system_hud", { enabled: next }).catch(() => {});
                  if (next && displayEnv.platform === "macos" && !accessibilityOk) {
                    const ok = await invoke<boolean>("request_accessibility_permission").catch(
                      () => false
                    );
                    setAccessibilityOk(ok);
                    showNotice(ok ? "HUD Tap Active!" : "Enable OrbitNotch in System Settings");
                  } else {
                    showNotice(next ? "System HUD replaced" : "System HUD restored");
                  }
                }}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  replaceSystemHud ? "bg-cyan-500" : "bg-white/15"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    replaceSystemHud ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-200">Hide in Fullscreen</p>
                <p className="text-[10px] text-slate-400">Movies &amp; games</p>
              </div>
              <button
                onClick={() => {
                  setHideInFullscreen(!hideInFullscreen);
                  showNotice(!hideInFullscreen ? "Fullscreen hide ON" : "Fullscreen hide OFF");
                }}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  hideInFullscreen ? "bg-cyan-500" : "bg-white/15"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    hideInFullscreen ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-200 flex items-center gap-1">
                  <Power className="w-3 h-3 text-emerald-400" /> Launch at Login
                </p>
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Keyboard className="w-3 h-3" />
                  {displayEnv.platform === "macos" ? "⌘⇧Space" : "Ctrl+Shift+Space"}
                </p>
              </div>
              <button
                onClick={handleToggleAutostart}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  autostartOn ? "bg-emerald-500" : "bg-white/15"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    autostartOn ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-200">Visible Modules</span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "shelf", label: "Shelf" },
                  { id: "media", label: "Media" },
                  { id: "productivity", label: "Focus" },
                  { id: "quick", label: "Quick" },
                  { id: "system", label: "System" },
                  { id: "meeting", label: "Meet" },
                ] as const
              ).map((t) => {
                const on = enabledTabs.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTabEnabled(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      on
                        ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-200"
                        : "bg-white/[0.03] border-white/10 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Pro & App */}
      {subTab === "account" && (
        <div className="flex-1 flex flex-col justify-center gap-2.5">
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                <Crown className={`w-3.5 h-3.5 ${isPro ? "text-amber-400" : "text-slate-400"}`} />
                {isPro ? "OrbitNotch Pro Active" : "OrbitNotch Pro License"}
              </span>
              <button
                onClick={() =>
                  openUrl("https://modedesk.myr.id/pl/orbitnotch-pro-lifetime-license").catch(
                    () => {}
                  )
                }
                className="text-[11px] text-amber-300 hover:text-amber-200 font-medium"
              >
                Buy Pro (Rp 49.000)
              </button>
            </div>

            {isPro ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-emerald-300 font-mono truncate">Key: {licenseKey}</span>
                <button
                  onClick={() => {
                    deactivatePro();
                    setKeyInput("");
                    showNotice("License removed");
                  }}
                  className="text-rose-400 hover:text-rose-300 ml-2 shrink-0"
                >
                  Deactivate
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Paste Mayar.id License Key..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  onClick={handleActivatePro}
                  disabled={verifying}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-semibold text-[11px] disabled:opacity-60"
                >
                  {verifying ? "..." : "Activate"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                openUrl("https://github.com/deonmgn/orbitnotch/issues/new").catch(() => {})
              }
              className="p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-cyan-300 flex items-center justify-center gap-2 text-xs font-medium transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Request Feature
            </button>

            <button
              onClick={() => invoke("quit_app").catch(() => {})}
              className="p-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 flex items-center justify-center gap-2 text-xs font-medium transition-colors"
            >
              <PowerOff className="w-3.5 h-3.5" />
              Quit OrbitNotch
            </button>
          </div>

          <p className="text-center text-[10px] text-slate-500">
            OrbitNotch v0.1.0 · macOS &amp; Windows
          </p>
        </div>
      )}
    </div>
  );
}
