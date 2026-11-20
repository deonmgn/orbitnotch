import { useNotchStore } from "../store/useNotchStore";
import { AudioVisualizer } from "./AudioVisualizer";
import { OrbitLogo } from "./OrbitLogo";

function formatShortTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getNextMeetingBadge(startIso?: string): string | null {
  if (!startIso) return null;
  const diffMin = Math.round((new Date(startIso).getTime() - Date.now()) / 60000);
  if (diffMin < -5 || diffMin > 120) return null;
  if (diffMin <= 0) return "Now";
  return `${diffMin}m`;
}

export function CompactPill() {
  const media = useNotchStore((s) => s.mediaState);
  const pomodoro = useNotchStore((s) => s.pomodoro);
  const meetings = useNotchStore((s) => s.meetings);
  const shelfCount = useNotchStore((s) => s.shelf.length);
  const peekEvent = useNotchStore((s) => s.peekEvent);
  const notchWidth = useNotchStore((s) => s.displayEnv.notchWidth);
  const isHardwareNotch = useNotchStore(
    (s) =>
      s.notchMode === "hardware" ||
      (s.notchMode === "auto" && s.displayEnv.hasHardwareNotch)
  );

  const meetingBadge = getNextMeetingBadge(meetings[0]?.startIso);

  return (
    <div className="w-full h-full flex items-center justify-between px-3 gap-1.5">
      {/* Left Wing */}
      <div className="flex items-center gap-1.5 min-w-0">
        {media.hasMedia && media.artworkUrl ? (
          <img
            src={media.artworkUrl}
            alt=""
            className="w-4 h-4 rounded-[4px] object-cover shrink-0 ring-1 ring-white/20"
          />
        ) : (
          <OrbitLogo size={15} active={media.isPlaying || pomodoro.running} />
        )}
        {pomodoro.running ? (
          <span className="text-[11px] font-mono font-semibold text-cyan-300">
            {formatShortTimer(pomodoro.secondsLeft)}
          </span>
        ) : media.hasMedia && media.isPlaying ? (
          <span className="text-[10px] font-medium text-slate-200 truncate max-w-[44px]">
            {media.title}
          </span>
        ) : shelfCount > 0 && !isHardwareNotch ? (
          <span className="text-[11px] font-medium text-slate-300">
            {shelfCount} {shelfCount === 1 ? "item" : "items"}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-200 tracking-tight">
            Orbit
          </span>
        )}
      </div>

      {/* Center spacer matching the exact physical MacBook camera notch */}
      {isHardwareNotch && (
        <div
          className="shrink-0"
          style={{ width: `${Math.max(160, Math.round(notchWidth))}px` }}
        />
      )}

      {/* Right Wing */}
      <div className="flex items-center gap-1.5 shrink-0">
        {peekEvent ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 animate-pulse">
            {peekEvent.label}
          </span>
        ) : (
          <>
            {meetingBadge && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                {meetingBadge}
              </span>
            )}
            {media.hasMedia && media.isPlaying ? (
              <AudioVisualizer playing={true} />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/90 shadow-[0_0_8px_#22d3ee]" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
