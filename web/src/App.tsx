import { motion } from "framer-motion";
import {
  Activity,
  Apple,
  Calendar,
  Check,
  Disc3,
  Download,
  FolderKanban,
  Laptop,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { useState } from "react";

const RELEASE_URL = "https://github.com/deonmgn/orbitnotch/releases/latest";
const FEEDBACK_URL = "https://github.com/deonmgn/orbitnotch/issues/new";
const MAYAR_PRO_URL = "https://modedesk.myr.id/pl/orbitnotch-pro-lifetime-license";

const DEMO_TABS = [
  {
    id: "shelf",
    label: "Shelf",
    icon: FolderKanban,
    title: "Auto-Catch Screenshots & File Dropzone",
    desc: "Drag files onto the notch or auto-catch new screenshots. Copy images straight to clipboard or reveal in Finder/Explorer.",
  },
  {
    id: "media",
    label: "Media",
    icon: Disc3,
    title: "Universal Media & CoreAudio Visualizer",
    desc: "Control Spotify, Apple Music, Chrome, Safari, and Windows GSMTC with instant CoreAudio pause detection.",
  },
  {
    id: "quick",
    label: "Quick",
    icon: Zap,
    title: "Instant Calc, Converter & 1-Click Launcher",
    desc: "Type 250000 * 1.11 or 100 usd to idr right inside the notch, or launch favorite apps & links in one click.",
  },
  {
    id: "focus",
    label: "Focus",
    icon: Timer,
    title: "Pomodoro, Clipboard History & Scratchpad",
    desc: "Live focus timer in the compact pill, searchable clipboard history, and auto-saved scratchpad notes.",
  },
  {
    id: "system",
    label: "System",
    icon: Activity,
    title: "Live CPU, RAM, Network & Dynamic Peek HUD",
    desc: "Real-time telemetry plus automatic 2.4s peek alerts when plugging in your charger or hitting low battery.",
  },
  {
    id: "meet",
    label: "Meet",
    icon: Calendar,
    title: "Pre-Call Camera Mirror & ICS Schedule",
    desc: "Instant webcam & mic level check before joining calls, plus upcoming meeting countdowns.",
  },
];

export function App() {
  const [expanded, setExpanded] = useState(true);
  const [activeDemo, setActiveDemo] = useState("shelf");
  const isWindows =
    typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

  const currentTab = DEMO_TABS.find((t) => t.id === activeDemo) ?? DEMO_TABS[0];

  return (
    <div className="min-h-screen bg-[#04060B] text-slate-100 relative overflow-x-hidden">
      {/* Background radial glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.14),transparent_55%)]" />

      {/* Nav */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-black border border-white/15 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.25)]">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-400" />
          </div>
          <span className="font-semibold tracking-tight text-white">OrbitNotch</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <a href="#features" className="text-slate-400 hover:text-white transition-colors">
            Features
          </a>
          <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">
            Free &amp; Pro
          </a>
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-cyan-300 transition-colors"
          >
            Request Feature
          </a>
          <a
            href={RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-1.5 rounded-full bg-white text-slate-950 font-semibold text-xs hover:bg-cyan-300 transition-colors"
          >
            Download
          </a>
        </div>
      </header>

      {/* Hero + Interactive Notch Simulator */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-10 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs text-cyan-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Built with Rust &amp; Tauri v2 · Only ~13 MB · macOS &amp; Windows</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.1]">
          Make your{" "}
          <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Mac &amp; Windows Notch
          </span>{" "}
          actually useful.
        </h1>

        <p className="mt-4 text-slate-400 max-w-2xl mx-auto text-base sm:text-lg">
          One lightweight Dynamic Island for File Shelf, Auto-Catch Screenshots, Universal
          Media Visualizer, Quick Calculator, Pomodoro Focus, System HUD, and Camera Mirror.
        </p>

        {/* Download CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-semibold text-sm shadow-lg shadow-cyan-500/25 hover:brightness-110 transition-all"
          >
            {isWindows ? <Laptop className="w-4 h-4" /> : <Apple className="w-4 h-4" />}
            Download for {isWindows ? "Windows (.exe)" : "macOS (.dmg)"}
          </a>
          <a
            href={RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/[0.06] hover:bg-white/10 border border-white/15 text-slate-200 text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            {isWindows ? "macOS (.dmg)" : "Windows (.exe / .msi)"}
          </a>
        </div>

        {/* Interactive Notch Playground */}
        <div className="mt-14 max-w-3xl mx-auto rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/70 to-black/90 p-4 sm:p-6 shadow-2xl">
          <div className="text-[11px] text-slate-400 mb-3 flex items-center justify-between">
            <span>Interactive Preview — Hover or click the Notch below</span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-cyan-400 hover:text-cyan-300 font-medium"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>

          <div className="min-h-[270px] rounded-2xl bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center flex justify-center items-start overflow-hidden relative border border-white/10">
            <motion.div
              layout
              onMouseEnter={() => setExpanded(true)}
              animate={{
                width: expanded ? 580 : 280,
                height: expanded ? 235 : 34,
                borderBottomLeftRadius: expanded ? 24 : 14,
                borderBottomRightRadius: expanded ? 24 : 14,
              }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="bg-black text-white overflow-hidden shadow-2xl flex flex-col"
            >
              {!expanded ? (
                <div className="w-full h-full flex items-center justify-between px-4 text-xs">
                  <span className="font-medium text-slate-200">Orbit</span>
                  <div className="w-28" />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-3 h-full text-left">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">OrbitNotch</span>
                    <span className="text-[10px] text-cyan-300 font-mono">⌘⇧Space</span>
                  </div>

                  <div className="flex flex-wrap gap-1 bg-white/[0.05] p-1 rounded-full w-fit mx-auto">
                    {DEMO_TABS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setActiveDemo(id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          activeDemo === id
                            ? "bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col justify-center">
                    <h3 className="text-sm font-semibold text-white">{currentTab.title}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {currentTab.desc}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Features Grid */}
        <section id="features" className="mt-24 grid sm:grid-cols-3 gap-4 text-left">
          {DEMO_TABS.map(({ id, label, icon: Icon, title, desc }) => (
            <div
              key={id}
              className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-400/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-300 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
                {label}
              </span>
              <h3 className="text-base font-semibold text-white mt-0.5">{title}</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>

        {/* Free & Pro Pricing */}
        <section id="pricing" className="mt-24 max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Simple Pricing</h2>
          <p className="text-sm text-slate-400 mt-2">
            Start free on Mac &amp; Windows. Upgrade once to unlock Pro workflows.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-5 text-left">
            <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">OrbitNotch Free</h3>
                <p className="text-3xl font-bold text-white mt-2">$0</p>
                <ul className="mt-5 space-y-2 text-xs text-slate-300">
                  {[
                    "Adaptive Hardware & Floating Notch",
                    "File Dropzone Shelf",
                    "Media Controller & CoreAudio Visualizer",
                    "System CPU, RAM, Battery & Volume HUD",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href={RELEASE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-6 block text-center py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors"
              >
                Download Free
              </a>
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-b from-cyan-500/15 to-indigo-500/10 border border-cyan-400/40 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950">
                  Lifetime · QRIS / GoPay / BCA
                </span>
                <h3 className="text-lg font-semibold text-white mt-2">OrbitNotch Pro</h3>
                <p className="text-3xl font-bold text-white mt-1">
                  Rp 49.000 <span className="text-xs font-normal text-slate-400">/ one-time</span>
                </p>
                <ul className="mt-5 space-y-2 text-xs text-slate-200">
                  {[
                    "Everything in Free",
                    "Auto-Catch Screenshots + Instant Copy Image",
                    "Quick Calculator, Converter & App Launcher",
                    "Unlimited Clipboard History & Pomodoro",
                    "Pre-Call Camera Mirror & ICS Calendar",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href={MAYAR_PRO_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-6 block text-center py-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 text-xs font-semibold hover:brightness-110 transition-all"
              >
                Get OrbitNotch Pro (Rp 49.000)
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
