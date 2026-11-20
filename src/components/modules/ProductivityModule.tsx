import { invoke } from "@tauri-apps/api/core";
import { Check, Clipboard, Copy, Pause, Pin, Play, RotateCcw, Search, StickyNote, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { ClipboardEntry } from "../../types/notch";

type SubTab = "timer" | "clipboard" | "notes";

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ProductivityModule() {
  const [subTab, setSubTab] = useState<SubTab>("timer");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pomodoro = useNotchStore((s) => s.pomodoro);
  const startPausePomodoro = useNotchStore((s) => s.startPausePomodoro);
  const resetPomodoro = useNotchStore((s) => s.resetPomodoro);

  const clipboard = useNotchStore((s) => s.clipboard);
  const setClipboard = useNotchStore((s) => s.setClipboard);

  const notes = useNotchStore((s) => s.notes);
  const setNotes = useNotchStore((s) => s.setNotes);

  const filteredClipboard = clipboard.filter((c) =>
    c.content.toLowerCase().includes(query.toLowerCase())
  );

  const handleCopyEntry = async (id: string) => {
    try {
      await invoke("copy_clipboard_entry", { id });
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // Ignore
    }
  };

  const handleTogglePin = async (id: string) => {
    const updated = await invoke<ClipboardEntry[]>("toggle_pin_clipboard_entry", { id });
    setClipboard(updated);
  };

  const handleClearClipboard = async () => {
    const updated = await invoke<ClipboardEntry[]>("clear_clipboard_history");
    setClipboard(updated);
  };

  return (
    <div className="flex flex-col h-full gap-2.5">
      {/* Sub-navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
        {[
          { id: "timer", label: "Focus Timer", icon: Timer },
          { id: "clipboard", label: "Clipboard", icon: Clipboard },
          { id: "notes", label: "Scratchpad", icon: StickyNote },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id as SubTab)}
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

      {/* Timer View */}
      {subTab === "timer" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
          <span className="text-[10px] uppercase tracking-widest font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300">
            {pomodoro.phase === "work" ? "Deep Focus" : "Short Break"}
          </span>

          <div className="text-4xl font-mono font-bold tracking-tight text-white">
            {formatClock(pomodoro.secondsLeft)}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startPausePomodoro}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-semibold text-xs hover:brightness-110 transition-all"
            >
              {pomodoro.running ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Start
                </>
              )}
            </button>
            <button
              onClick={() => resetPomodoro()}
              className="p-2 rounded-full bg-white/[0.06] hover:bg-white/15 text-slate-300 transition-colors"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 mt-1">
            {[15, 25, 45].map((mins) => (
              <button
                key={mins}
                onClick={() => resetPomodoro(mins)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  pomodoro.workMinutes === mins
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clipboard View */}
      {subTab === "clipboard" && (
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clipboard history..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
              />
            </div>
            <button
              onClick={handleClearClipboard}
              title="Clear unpinned"
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto notch-scroll space-y-1.5 pr-1">
            {filteredClipboard.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                Copy anything on your computer to see it here automatically.
              </p>
            ) : (
              filteredClipboard.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => handleCopyEntry(entry.id)}
                  className="group flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 cursor-pointer transition-all"
                >
                  {entry.kind === "color" ? (
                    <span
                      className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: entry.content.trim() }}
                    />
                  ) : (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 shrink-0">
                      {entry.kind}
                    </span>
                  )}

                  <p className="text-xs text-slate-200 truncate flex-1 font-mono">
                    {entry.content}
                  </p>

                  {copiedId === entry.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-200 shrink-0" />
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin(entry.id);
                    }}
                    className={`p-1 rounded hover:bg-white/10 ${
                      entry.pinned ? "text-cyan-400" : "text-slate-500"
                    }`}
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Notes Scratchpad View */}
      {subTab === "notes" && (
        <div className="flex-1 flex flex-col gap-1.5 min-h-0">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot down quick thoughts, commands, or reminders... (auto-saved)"
            className="flex-1 w-full resize-none rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50 notch-scroll leading-relaxed"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
            <span>{notes.length} chars • Saved locally</span>
            <button
              onClick={() =>
                invoke("copy_text_to_clipboard", { text: notes }).catch(() =>
                  navigator.clipboard.writeText(notes).catch(() => {})
                )
              }
              className="text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Copy All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
