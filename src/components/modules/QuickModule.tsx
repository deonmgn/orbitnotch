import { invoke } from "@tauri-apps/api/core";
import { Calculator, Check, Copy, ExternalLink, Plus, Rocket, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

interface ShortcutItem {
  id: string;
  label: string;
  target: string;
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: "1", label: "Chrome", target: "Google Chrome" },
  { id: "2", label: "Terminal", target: "Terminal" },
  { id: "3", label: "Finder", target: "Finder" },
  { id: "4", label: "GitHub", target: "https://github.com" },
  { id: "5", label: "ChatGPT", target: "https://chatgpt.com" },
  { id: "6", label: "YouTube", target: "https://youtube.com" },
];

function evaluateQuickExpression(raw: string): string | null {
  const input = raw.trim().toLowerCase();
  if (!input) return null;

  // Unit & currency conversions: "<num> <from> to <to>"
  const convMatch = input.match(/^(-?\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:to|in)\s+([a-z]+)$/);
  if (convMatch) {
    const val = parseFloat(convMatch[1]);
    const from = convMatch[2];
    const to = convMatch[3];
    if (from === "c" && to === "f") return `${((val * 9) / 5 + 32).toFixed(1)} °F`;
    if (from === "f" && to === "c") return `${(((val - 32) * 5) / 9).toFixed(1)} °C`;
    if (from === "km" && to === "m") return `${(val * 1000).toLocaleString()} m`;
    if (from === "m" && to === "km") return `${(val / 1000).toFixed(3)} km`;
    if (from === "km" && to === "mi") return `${(val * 0.621371).toFixed(2)} mi`;
    if (from === "mi" && to === "km") return `${(val * 1.60934).toFixed(2)} km`;
    if (from === "kg" && to === "lb") return `${(val * 2.20462).toFixed(2)} lb`;
    if (from === "lb" && to === "kg") return `${(val / 2.20462).toFixed(2)} kg`;
    if (from === "gb" && to === "mb") return `${(val * 1024).toLocaleString()} MB`;
    if (from === "mb" && to === "gb") return `${(val / 1024).toFixed(2)} GB`;
    if (from === "usd" && to === "idr") return `Rp ${(val * 15850).toLocaleString()}`;
    if (from === "idr" && to === "usd") return `$${(val / 15850).toFixed(2)}`;
  }

  // Safe arithmetic parser (numbers, + - * / % ( ) .)
  if (/^[0-9+\-*/().%\s]+$/.test(input)) {
    try {
      const normalized = input.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
      const fn = new Function(`"use strict"; return (${normalized});`);
      const res = fn();
      if (typeof res === "number" && Number.isFinite(res)) {
        return Number.isInteger(res) ? res.toLocaleString() : res.toFixed(4).replace(/\.?0+$/, "");
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function QuickModule() {
  const [expr, setExpr] = useState("");
  const [copiedResult, setCopiedResult] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const raw = localStorage.getItem("orbitnotch_shortcuts");
      return raw ? JSON.parse(raw) : DEFAULT_SHORTCUTS;
    } catch {
      return DEFAULT_SHORTCUTS;
    }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const result = useMemo(() => evaluateQuickExpression(expr), [expr]);

  const saveShortcuts = (next: ShortcutItem[]) => {
    setShortcuts(next);
    localStorage.setItem("orbitnotch_shortcuts", JSON.stringify(next));
  };

  const handleCopyResult = async () => {
    if (!result) return;
    await invoke("copy_text_to_clipboard", { text: result }).catch(() =>
      navigator.clipboard.writeText(result).catch(() => {})
    );
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 1200);
  };

  const handleAddShortcut = () => {
    if (!newLabel.trim() || !newTarget.trim()) return;
    const next = [
      ...shortcuts.slice(0, 5),
      { id: Date.now().toString(), label: newLabel.trim(), target: newTarget.trim() },
    ];
    saveShortcuts(next);
    setNewLabel("");
    setNewTarget("");
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Instant Calculator & Converter */}
      <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="Calc or convert: 250000 * 1.11  or  100 usd to idr  or  32 c to f"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none font-mono"
          />
          {result && (
            <button
              onClick={handleCopyResult}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-mono font-semibold transition-colors"
            >
              <span>= {result}</span>
              {copiedResult ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["100 usd to idr", "32 c to f", "250000 * 1.11", "5 km to mi"].map((sample) => (
            <button
              key={sample}
              onClick={() => setExpr(sample)}
              className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/10 text-[10px] font-mono text-slate-400 hover:text-cyan-300 transition-colors"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* 1-Click App & Link Launcher */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5 text-violet-400" />
            Quick Launcher
          </span>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-2 py-0.5 rounded-lg bg-white/[0.06] hover:bg-white/15 text-[11px] text-slate-300 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {showAdd && (
          <div className="flex items-center gap-1.5">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Name (e.g. VS Code)"
              className="w-28 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none"
            />
            <input
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="App name or https://..."
              className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none"
            />
            <button
              onClick={handleAddShortcut}
              className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-[11px]"
            >
              Save
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 overflow-y-auto notch-scroll pr-1">
          {shortcuts.map((item) => (
            <div
              key={item.id}
              onClick={() =>
                invoke("launch_shortcut_target", { target: item.target }).catch(() => {})
              }
              className="group relative flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 cursor-pointer transition-all"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-100 truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.target}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    saveShortcuts(shortcuts.filter((s) => s.id !== item.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
