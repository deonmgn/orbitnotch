import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, Battery, BatteryCharging, Bluetooth, Camera, Cpu, Lock, MemoryStick, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotchStore } from "../../store/useNotchStore";
import type { BluetoothDeviceBattery } from "../../types/notch";

function formatRate(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  return `${kbps.toFixed(0)} KB/s`;
}

export function SystemModule() {
  const stats = useNotchStore((s) => s.systemStats);
  const setSystemStats = useNotchStore((s) => s.setSystemStats);
  const isPro = useNotchStore((s) => s.isPro);
  const [btDevices, setBtDevices] = useState<BluetoothDeviceBattery[]>([]);

  useEffect(() => {
    if (!isPro) return;
    invoke<BluetoothDeviceBattery[]>("get_bluetooth_batteries")
      .then(setBtDevices)
      .catch(() => {});
  }, [isPro]);

  const handleVolumeChange = async (val: number) => {
    setSystemStats({ ...stats, volumePercent: val, isMuted: val === 0 });
    try {
      await invoke("set_system_volume", { volume: val });
    } catch {
      // Ignore in browser preview
    }
  };

  const handleToggleMute = async () => {
    setSystemStats({ ...stats, isMuted: !stats.isMuted });
    try {
      await invoke("toggle_system_mute");
    } catch {
      // Ignore
    }
  };

  return (
    <div className="flex flex-col justify-center h-full gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        {/* CPU Card */}
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" /> CPU Load
            </span>
            <span className="font-mono font-semibold text-white">
              {stats.cpuPercent.toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, stats.cpuPercent)}%` }}
            />
          </div>
        </div>

        {/* Memory Card */}
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <MemoryStick className="w-3.5 h-3.5 text-violet-400" /> Memory
            </span>
            <span className="font-mono font-semibold text-white">
              {stats.memoryUsedGb.toFixed(1)}/{stats.memoryTotalGb.toFixed(0)} GB
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${Math.min(100, stats.memoryPercent)}%` }}
            />
          </div>
        </div>

        {/* Network Card */}
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>{formatRate(stats.netDownKbps)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
            <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
            <span>{formatRate(stats.netUpKbps)}</span>
          </div>
        </div>

        {/* Battery Card */}
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            {stats.isCharging ? (
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
            ) : (
              <Battery className="w-4 h-4 text-amber-400" />
            )}
            Battery
          </span>
          <span className="text-xs font-mono font-semibold text-white">
            {stats.batteryPercent !== null ? `${stats.batteryPercent}%` : "AC Power"}
          </span>
        </div>
      </div>

      {/* Quick System Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => invoke("trigger_screenshot").catch(() => {})}
          className="py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Camera className="w-3.5 h-3.5 text-cyan-400" />
          Screenshot
        </button>
        <button
          onClick={handleToggleMute}
          className="py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
        >
          <VolumeX className="w-3.5 h-3.5 text-amber-400" />
          {stats.isMuted ? "Unmute" : "Mute Audio"}
        </button>
        <button
          onClick={() => invoke("lock_screen").catch(() => {})}
          className="py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Lock className="w-3.5 h-3.5 text-violet-400" />
          Lock Screen
        </button>
      </div>

      {/* Volume Control Bar */}
      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
        <button
          onClick={handleToggleMute}
          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/15 text-slate-200 transition-colors"
          title={stats.isMuted ? "Unmute" : "Mute"}
        >
          {stats.isMuted ? (
            <VolumeX className="w-4 h-4 text-rose-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-cyan-400" />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={stats.volumePercent ?? 50}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          className="flex-1 accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
        />

        <span className="text-xs font-mono text-slate-300 w-9 text-right">
          {stats.isMuted ? "Mute" : `${stats.volumePercent ?? 50}%`}
        </span>
      </div>

      {isPro && btDevices.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto notch-scroll pb-0.5">
          {btDevices.map((d) => (
            <div
              key={d.name}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-1.5 shrink-0 text-[10px] text-slate-200"
            >
              <Bluetooth className="w-3 h-3 text-cyan-400 shrink-0" />
              <span className="truncate max-w-[110px] font-medium">{d.name}</span>
              {d.batteryPercent !== null && (
                <span className="font-mono text-emerald-300">{d.batteryPercent}%</span>
              )}
              {d.casePercent !== null && (
                <span className="font-mono text-slate-400">· Case {d.casePercent}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
