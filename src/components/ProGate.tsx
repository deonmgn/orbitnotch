import { openUrl } from "@tauri-apps/plugin-opener";
import { Crown, Lock } from "lucide-react";
import { useNotchStore } from "../store/useNotchStore";

interface ProGateProps {
  featureName: string;
  description: string;
}

export function ProGate({ featureName, description }: ProGateProps) {
  const setActiveTab = useNotchStore((s) => s.setActiveTab);

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 gap-2.5">
      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400/20 to-cyan-400/20 border border-amber-400/30 flex items-center justify-center">
        <Lock className="w-4 h-4 text-amber-300" />
      </div>
      <div>
        <p className="text-xs font-semibold text-white flex items-center justify-center gap-1.5">
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          {featureName} · OrbitNotch Pro
        </p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs">{description}</p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() =>
            openUrl("https://modedesk.myr.id/pl/orbitnotch-pro-lifetime-license").catch(() => {})
          }
          className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-semibold text-[11px] hover:brightness-110 transition"
        >
          Upgrade Pro (Rp 49.000)
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] font-medium transition"
        >
          Activate Key
        </button>
      </div>
    </div>
  );
}
