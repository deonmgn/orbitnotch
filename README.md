# OrbitNotch

A lightweight, fast, animated **Dynamic Island & Notch** utility for **macOS** and **Windows 10/11**, built with **Tauri v2 + Rust + React + Framer Motion**.

## Features
- **Adaptive Hardware & Floating Notch:** Seamlessly blends into the physical MacBook camera notch, and renders as a sleek floating pill on non-notch Macs, external monitors, and Windows 10/11.
- **File Shelf & Auto-Catch Screenshots:** Drag & drop files or text snippets, auto-catch new screenshots, copy images straight to clipboard, and reveal in Finder/Explorer.
- **Universal Media Controller & CoreAudio Visualizer:** Controls Spotify, Apple Music, Chrome, Safari, Arc, Brave, and Windows GSMTC with instant CoreAudio pause detection.
- **Quick Calculator, Converter & App Launcher:** Evaluate math (`250000 * 1.11`), convert units (`100 usd to idr`, `32 c to f`), and launch favorite apps/sites in 1 click.
- **Focus Hub:** Pomodoro timer (live in compact pill), searchable Clipboard History, and auto-saved Scratchpad Notes.
- **System HUD & Dynamic Peek:** Real-time CPU, RAM, Battery, Network RX/TX, Volume control, and automatic 2.4s peek alerts on charging/low battery/screenshots.
- **Meeting & Camera Mirror:** Instant pre-call webcam & mic level check + upcoming `.ics` / manual meeting countdown.

## Development
```bash
npm install
npm run tauri dev
```

## Landing Page (`web/`)
Deploy the `web/` directory directly to **Vercel** (Framework: Vite, Root Directory: `web`).
