import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Calendar, ExternalLink, Mic, Plus, Trash2, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { MeetingEvent } from "../../types/notch";

function formatCountdown(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (diffMin <= 0) return "Now";
  if (diffMin < 60) return `In ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `In ${h}h ${m}m`;
}

export function MeetingModule() {
  const meetings = useNotchStore((s) => s.meetings);
  const setMeetings = useNotchStore((s) => s.setMeetings);
  const setDialogOpen = useNotchStore((s) => s.setDialogOpen);

  const [camActive, setCamActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [meetUrl, setMeetUrl] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let rafId = 0;
    let audioCtx: AudioContext | null = null;

    if (!camActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setMicLevel(0);
      return;
    }

    const startStream = async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch {
          // Fallback to video-only if microphone permission is unavailable
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        streamRef.current = stream;
        setCamError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        if (stream.getAudioTracks().length > 0) {
          audioCtx = new AudioContext();
          if (audioCtx.state === "suspended") {
            await audioCtx.resume().catch(() => {});
          }
          const src = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
            rafId = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Camera permission needed";
        setCamError(msg.includes("Permission") || msg.includes("NotAllowed") ? "Allow Camera in System Settings" : "Camera unavailable");
        setCamActive(false);
      }
    };

    startStream();

    return () => {
      cancelAnimationFrame(rafId);
      audioCtx?.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [camActive]);

  const handleImportIcs = async () => {
    setDialogOpen(true);
    try {
      const file = await open({
        filters: [{ name: "Calendar", extensions: ["ics"] }],
      });
      if (!file || Array.isArray(file)) return;
      const updated = await invoke<MeetingEvent[]>("import_ics_file", {
        path: file,
      });
      setMeetings(updated);
    } catch {
      // Ignore
    } finally {
      setDialogOpen(false);
    }
  };

  const handleAddMeeting = async () => {
    if (!title.trim()) return;
    const startIso = timeStr
      ? new Date(timeStr).toISOString()
      : new Date(Date.now() + 30 * 60000).toISOString();
    const updated = await invoke<MeetingEvent[]>("add_meeting", {
      title,
      startIso,
      meetingUrl: meetUrl || null,
    });
    setMeetings(updated);
    setTitle("");
    setTimeStr("");
    setMeetUrl("");
    setShowAdd(false);
  };

  const handleRemove = async (id: string) => {
    const updated = await invoke<MeetingEvent[]>("remove_meeting", { id });
    setMeetings(updated);
  };

  return (
    <div className="grid grid-cols-5 gap-3 h-full">
      {/* Camera & Mic Mirror */}
      <div className="col-span-2 flex flex-col gap-2 rounded-2xl bg-white/[0.04] border border-white/10 p-2.5">
        <div className="relative flex-1 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center border border-white/10">
          {camActive ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover -scale-x-100"
            />
          ) : (
            <div className="text-center px-2">
              <VideoOff className="w-6 h-6 text-slate-600 mx-auto mb-1" />
              <p className="text-[10px] text-slate-400">
                {camError ?? "Quick pre-call mirror"}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCamActive((v) => !v)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
              camActive
                ? "bg-rose-500/20 text-rose-300 border border-rose-400/30"
                : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            {camActive ? "Stop" : "Mirror"}
          </button>

          <div className="flex items-center gap-1 w-14">
            <Mic className="w-3 h-3 text-slate-400 shrink-0" />
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Meetings */}
      <div className="col-span-3 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            Upcoming Schedule
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleImportIcs}
              className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 text-[10px] text-slate-300 border border-white/10"
            >
              Import .ics
            </button>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="p-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/25"
              title="Add meeting"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="p-2 rounded-xl bg-white/[0.05] border border-white/10 flex flex-col gap-1.5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none"
            />
            <div className="flex items-center gap-1">
              {[15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    const d = new Date(Date.now() + mins * 60000);
                    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16);
                    setTimeStr(local);
                  }}
                  className="px-2 py-0.5 rounded bg-white/[0.06] hover:bg-cyan-500/20 text-[10px] font-mono text-slate-300 hover:text-cyan-200"
                >
                  +{mins >= 60 ? "1h" : `${mins}m`}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                type="datetime-local"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-slate-200 focus:outline-none"
              />
              <button
                onClick={handleAddMeeting}
                className="px-2.5 py-1 rounded-md bg-cyan-500 text-slate-950 font-semibold text-[11px]"
              >
                Add
              </button>
            </div>
            <input
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              placeholder="Optional Zoom/Meet URL"
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto notch-scroll space-y-1.5 pr-1">
          {meetings.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-6">
              <p className="text-xs text-slate-400">No upcoming meetings</p>
              <p className="text-[10px] text-slate-500">
                Add one or import an .ics calendar file
              </p>
            </div>
          ) : (
            meetings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.04] border border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-100 truncate">{m.title}</p>
                  <p className="text-[10px] text-cyan-300 font-mono">
                    {formatCountdown(m.startIso)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {m.meetingUrl && (
                    <button
                      onClick={() => openUrl(m.meetingUrl!).catch(() => {})}
                      className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10px] font-medium flex items-center gap-1"
                    >
                      Join <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
