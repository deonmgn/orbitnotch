import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Calendar,
  Disc3,
  FolderKanban,
  Settings,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useNotchStore } from "../store/useNotchStore";
import type { NotchTab, ShelfItem } from "../types/notch";
import { CompactPill } from "./CompactPill";
import { OrbitLogo } from "./OrbitLogo";
import { MediaModule } from "./modules/MediaModule";
import { MeetingModule } from "./modules/MeetingModule";
import { ProductivityModule } from "./modules/ProductivityModule";
import { QuickModule } from "./modules/QuickModule";
import { SettingsModule } from "./modules/SettingsModule";
import { ShelfModule } from "./modules/ShelfModule";
import { SystemModule } from "./modules/SystemModule";

const TABS: { id: NotchTab; label: string; icon: typeof FolderKanban }[] = [
  { id: "shelf", label: "Shelf", icon: FolderKanban },
  { id: "media", label: "Media", icon: Disc3 },
  { id: "productivity", label: "Focus", icon: Timer },
  { id: "quick", label: "Quick", icon: Zap },
  { id: "system", label: "System", icon: Activity },
  { id: "meeting", label: "Meet", icon: Calendar },
];

export function NotchContainer() {
  const isExpanded = useNotchStore((s) => s.isExpanded);
  const setExpanded = useNotchStore((s) => s.setExpanded);
  const setDraggingFile = useNotchStore((s) => s.setDraggingFile);
  const isDialogOpen = useNotchStore((s) => s.isDialogOpen);
  const activeTab = useNotchStore((s) => s.activeTab);
  const setActiveTab = useNotchStore((s) => s.setActiveTab);
  const setShelf = useNotchStore((s) => s.setShelf);
  const theme = useNotchStore((s) => s.theme);
  const notchMode = useNotchStore((s) => s.notchMode);
  const displayEnv = useNotchStore((s) => s.displayEnv);
  const selectedMonitor = useNotchStore((s) => s.selectedMonitor);

  const hoverTimeoutRef = useRef<number | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);

  const isHardwareNotch =
    notchMode === "hardware" ||
    (notchMode === "auto" && displayEnv.hasHardwareNotch);

  const notchW = Math.max(176, Math.round(displayEnv.notchWidth));
  const compactWidth = isHardwareNotch ? notchW + 132 : 236;
  const compactHeight = isHardwareNotch ? Math.max(32, Math.round(displayEnv.notchHeight)) : 34;
  const expandedWidth = 640;
  const expandedHeight = isHardwareNotch ? 392 : 368;

  // Escape key collapses the notch
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, setExpanded]);

  // Native global hover events (works even when Chrome or another app is focused)
  useEffect(() => {
    const unlisteners = [
      listen("notch://hover-enter", () => {
        if (collapseTimeoutRef.current) {
          window.clearTimeout(collapseTimeoutRef.current);
          collapseTimeoutRef.current = null;
        }
        if (!useNotchStore.getState().isExpanded) {
          hoverTimeoutRef.current = window.setTimeout(() => {
            useNotchStore.getState().setExpanded(true);
          }, 90);
        }
      }),
      listen("notch://hover-leave", () => {
        if (hoverTimeoutRef.current) {
          window.clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        const state = useNotchStore.getState();
        if (state.isExpanded && !state.isDialogOpen) {
          collapseTimeoutRef.current = window.setTimeout(() => {
            useNotchStore.getState().setExpanded(false);
          }, 260);
        }
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, []);

  // Sync native window size without stealing typing focus on passive hover
  useEffect(() => {
    if (isExpanded) {
      invoke("set_notch_window_size", {
        width: isHardwareNotch ? expandedWidth : expandedWidth + 64,
        height: isHardwareNotch ? expandedHeight : expandedHeight + 48,
        hasNotch: isHardwareNotch,
        monitorIndex: selectedMonitor,
        focus: false,
      }).catch(() => {});
    } else {
      const timer = window.setTimeout(() => {
        invoke("set_notch_window_size", {
          width: compactWidth,
          height: compactHeight,
          hasNotch: isHardwareNotch,
          monitorIndex: selectedMonitor,
          focus: false,
        }).catch(() => {});
      }, 240);
      return () => window.clearTimeout(timer);
    }
  }, [isExpanded, isHardwareNotch, compactWidth, compactHeight, expandedHeight, selectedMonitor]);

  // Listen for native OS file drag-and-drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent(async (event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setDraggingFile(true);
            setActiveTab("shelf");
            setExpanded(true);
          } else if (event.payload.type === "leave") {
            setDraggingFile(false);
          } else if (event.payload.type === "drop") {
            setDraggingFile(false);
            setActiveTab("shelf");
            setExpanded(true);
            const updated = await invoke<ShelfItem[]>("add_shelf_files", {
              paths: event.payload.paths,
            });
            setShelf(updated);
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {});
    } catch {
      // Ignore in browser preview
    }
    return () => unlisten?.();
  }, [setActiveTab, setDraggingFile, setExpanded, setShelf]);

  const handleMouseEnter = () => {
    if (collapseTimeoutRef.current) {
      window.clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    if (!isExpanded) {
      hoverTimeoutRef.current = window.setTimeout(() => {
        setExpanded(true);
      }, 130);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Always auto-collapse when mouse moves away (unless a native OS file dialog is open)
    if (isExpanded && !isDialogOpen) {
      collapseTimeoutRef.current = window.setTimeout(() => {
        setExpanded(false);
      }, 260);
    }
  };

  // Seamless pure black for hardware notch; subtle glass only for floating / frosted
  const surfaceClass = isHardwareNotch
    ? theme === "frosted" && isExpanded
      ? "bg-slate-950/95 backdrop-blur-2xl"
      : "bg-black"
    : theme === "oled"
    ? "bg-black ring-1 ring-white/10"
    : theme === "frosted"
    ? "bg-slate-900/85 backdrop-blur-2xl ring-1 ring-white/15"
    : "bg-[#070A11]/95 backdrop-blur-2xl ring-1 ring-white/10";

  return (
    <div
      className={`w-full h-full flex justify-center items-start ${
        isHardwareNotch ? "pt-0" : "pt-0.5"
      }`}
    >
      <motion.div
        layout
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={() => {
          if (isExpanded) {
            invoke("focus_notch_window").catch(() => {});
          }
        }}
        onClick={() => !isExpanded && setExpanded(true)}
        animate={{
          width: isExpanded ? expandedWidth : compactWidth,
          height: isExpanded ? expandedHeight : compactHeight,
          borderTopLeftRadius: isHardwareNotch ? 0 : isExpanded ? 24 : 999,
          borderTopRightRadius: isHardwareNotch ? 0 : isExpanded ? 24 : 999,
          borderBottomLeftRadius: isExpanded ? 26 : isHardwareNotch ? 14 : 999,
          borderBottomRightRadius: isExpanded ? 26 : isHardwareNotch ? 14 : 999,
        }}
        transition={{
          type: "spring",
          stiffness: 440,
          damping: 34,
          mass: 0.85,
        }}
        className={`relative overflow-hidden ${surfaceClass} ${
          isExpanded && !isHardwareNotch ? "shadow-[0_10px_20px_rgba(0,0,0,0.45)]" : ""
        } ${!isExpanded ? "cursor-pointer" : ""}`}
      >
        <AnimatePresence mode="wait">
          {!isExpanded ? (
            <motion.div
              key="compact"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="w-full h-full"
            >
              <CompactPill />
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="w-full h-full flex flex-col px-4 pb-3.5 pt-0 gap-2.5"
            >
              {/* Top Notch Header Row (sits alongside the physical notch, never overlapped by it) */}
              <div
                className="flex items-center justify-between shrink-0"
                style={{ height: `${isHardwareNotch ? compactHeight : 38}px` }}
              >
                <div className="flex items-center gap-2 shrink-0">
                  <OrbitLogo size={18} active />
                  <span className="text-xs font-semibold tracking-tight text-white">
                    OrbitNotch
                  </span>
                </div>

                {isHardwareNotch && (
                  <div className="shrink-0" style={{ width: `${notchW}px` }} />
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab(activeTab === "settings" ? "shelf" : "settings");
                    }}
                    className={`p-1 rounded-full transition-colors ${
                      activeTab === "settings"
                        ? "bg-cyan-500/25 text-cyan-300"
                        : "bg-white/[0.06] hover:bg-white/15 text-slate-400 hover:text-white"
                    }`}
                    title="Setup & Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(false);
                    }}
                    className="p-1 rounded-full bg-white/[0.06] hover:bg-white/15 text-slate-400 hover:text-white transition-colors"
                    title="Collapse (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs — cleanly positioned below the physical notch */}
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-full border border-white/10">
                  {TABS.map(({ id, label, icon: Icon }) => {
                    const active = activeTab === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`relative flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          active ? "text-slate-950" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="activeTabPill"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                          />
                        )}
                        <Icon className="w-3.5 h-3.5 relative z-10" />
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Module Content */}
              <div className="flex-1 min-h-0">
                {activeTab === "shelf" && <ShelfModule />}
                {activeTab === "media" && <MediaModule />}
                {activeTab === "productivity" && <ProductivityModule />}
                {activeTab === "quick" && <QuickModule />}
                {activeTab === "system" && <SystemModule />}
                {activeTab === "meeting" && <MeetingModule />}
                {activeTab === "settings" && <SettingsModule />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
