import { invoke } from "@tauri-apps/api/core";
import { Disc3, Mic2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { MediaState } from "../../types/notch";
import { AudioVisualizer } from "../AudioVisualizer";

interface LyricLine {
  timeSec: number;
  text: string;
}

function formatTime(sec: number): string {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of lrc.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) {
      const timeSec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      const text = m[3].trim();
      if (text) out.push({ timeSec, text });
    }
  }
  return out;
}

export function MediaModule() {
  const media = useNotchStore((s) => s.mediaState);
  const setMediaState = useNotchStore((s) => s.setMediaState);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  useEffect(() => {
    if (!showLyrics || !media.hasMedia || !media.title) {
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    const q = new URLSearchParams({
      track_name: media.title,
      artist_name: media.artist,
    });
    fetch(`https://lrclib.net/api/get?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const parsed = data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
        setLyrics(parsed);
      })
      .catch(() => {
        if (!cancelled) setLyrics([]);
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showLyrics, media.title, media.artist, media.hasMedia]);

  const activeLyricIdx = useMemo(() => {
    if (lyrics.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].timeSec <= media.positionSec + 0.3) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, media.positionSec]);

  const sendControl = async (action: "play_pause" | "next" | "previous") => {
    try {
      const updated = await invoke<MediaState>("media_control", { action });
      setMediaState(updated);
    } catch {
      // Ignore in browser preview
    }
  };

  const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!media.durationSec || media.durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * media.durationSec;
    setMediaState({ ...media, positionSec: targetSec });
    try {
      const updated = await invoke<MediaState>("media_seek", { positionSec: targetSec });
      setMediaState(updated);
    } catch {
      // Ignore
    }
  };

  const progress =
    media.durationSec > 0 ? Math.min(100, (media.positionSec / media.durationSec) * 100) : 0;

  return (
    <div className="flex flex-col justify-center h-full gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-slate-900/80 to-violet-500/15 p-3.5 flex items-center gap-4">
        {media.artworkUrl && (
          <img
            src={media.artworkUrl}
            alt=""
            className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-125"
          />
        )}

        {media.artworkUrl ? (
          <img
            src={media.artworkUrl}
            alt={media.album || media.title}
            className="relative z-10 w-16 h-16 rounded-2xl object-cover border border-white/15 shadow-xl shrink-0"
          />
        ) : (
          <div
            className={`relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-violet-600/30 border border-white/15 flex items-center justify-center shrink-0 ${
              media.isPlaying ? "animate-[spin_9s_linear_infinite]" : ""
            }`}
          >
            <Disc3 className="w-7 h-7 text-cyan-300" />
          </div>
        )}

        <div className="relative z-10 min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-cyan-300/90 bg-cyan-500/15 px-2 py-0.5 rounded-full">
              {media.hasMedia ? media.appName : "No Active Player"}
            </span>
            <div className="flex items-center gap-2">
              {media.hasMedia && (
                <button
                  onClick={() => setShowLyrics((v) => !v)}
                  title="Toggle Synced Lyrics"
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 transition-colors ${
                    showLyrics
                      ? "bg-cyan-400 text-slate-950"
                      : "bg-white/10 text-slate-300 hover:text-white"
                  }`}
                >
                  <Mic2 className="w-3 h-3" />
                  Lyrics
                </button>
              )}
              <AudioVisualizer playing={media.isPlaying} />
            </div>
          </div>

          <h3 className="text-sm font-semibold text-white truncate mt-1.5">
            {media.hasMedia ? media.title : "Play Spotify, Apple Music, or Media"}
          </h3>
          <p className="text-xs text-slate-300/80 truncate mt-0.5">
            {media.hasMedia
              ? `${media.artist}${media.album ? ` • ${media.album}` : ""}`
              : "Waiting for audio session..."}
          </p>
        </div>
      </div>

      {/* Live Synced Lyrics Strip */}
      {showLyrics && (
        <div className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-center min-h-[44px] flex flex-col justify-center">
          {lyricsLoading ? (
            <span className="text-[11px] text-slate-400">Loading synced lyrics...</span>
          ) : activeLyricIdx >= 0 ? (
            <>
              <p className="text-xs font-medium text-cyan-300 truncate">
                {lyrics[activeLyricIdx].text}
              </p>
              {lyrics[activeLyricIdx + 1] && (
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {lyrics[activeLyricIdx + 1].text}
                </p>
              )}
            </>
          ) : (
            <span className="text-[11px] text-slate-500">No synced lyrics found for this track</span>
          )}
        </div>
      )}

      {/* Click-to-Seek Progress & Controls */}
      <div className="flex flex-col gap-2.5 px-1">
        <div className="flex flex-col gap-1">
          <div
            onClick={handleSeek}
            title="Click to seek"
            className="group h-2 w-full rounded-full bg-white/10 overflow-hidden cursor-pointer flex items-center"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all duration-300 group-hover:brightness-110"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>{formatTime(media.positionSec)}</span>
            <span>{formatTime(media.durationSec)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => sendControl("previous")}
            className="p-2 rounded-full bg-white/[0.06] hover:bg-white/15 text-slate-200 transition-colors"
            title="Previous"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => sendControl("play_pause")}
            className="p-3 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-slate-950 shadow-lg shadow-cyan-500/25 transition-all active:scale-95"
            title={media.isPlaying ? "Pause" : "Play"}
          >
            {media.isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => sendControl("next")}
            className="p-2 rounded-full bg-white/[0.06] hover:bg-white/15 text-slate-200 transition-colors"
            title="Next"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
