# ⏳ Tick...Tock — Full-Featured Time Management Suite

A beautiful, premium desktop time management application built with **Tauri v2** and vanilla HTML/CSS/JavaScript.

Track your events, set daily alarms, manage your focus with Pomodoro breaks, and measure time precisely—all offline, fast, and secure.

---

## ✨ Features

### 📅 Countdowns
- **Multiple Views** — Switch between List, Calendar, and Statistics views.
- **Advanced Events** — Support for recurrence (daily, weekly, monthly, yearly), timezones, color tags, and notes.
- **Live Progress** — Visual progress bars and live second-by-second countdowns.
- **Count-Up** — Automatically tracks how long an event has passed after it expires.
- **Organization** — Sort (soonest, latest, alphabetical, recently added), filter (categories, active/expired), and search.

### 🔔 Alarms & Reminders
- **Custom Alarms** — Set alarms that repeat once, daily, on weekdays, or on weekends.
- **Break Time Reminder** — Built-in Pomodoro-style break reminders (e.g., 25 min work, 5 min break) with screen blur and animated overlays.
- **Custom Sounds** — Choose between Chime, Bell, Beep, or Melody with adjustable volume.
- **Desktop Notifications** — Native OS notifications when time is up.

### ⏱️ Stopwatch & Timer
- **Precision Stopwatch** — Tracks milliseconds with lap/split support and highlights best/worst laps.
- **Versatile Timer** — Quick preset buttons (1m, 5m, 15m, etc.) or custom time input, featuring a smooth circular progress ring.

### ⚙️ Power User Tools
- **System Tray Integration** — App minimizes to the system tray and runs quietly in the background.
- **Keyboard Shortcuts** — Navigate the app quickly (press `Ctrl+/` for the cheat sheet).
- **Import / Export** — Backup and restore your events securely.
- **Themes** — Toggle between a sleek Dark mode and crisp Light mode.
- **Fun Extras** — Confetti animations when you reach your goals!

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) + Cargo
- [Tauri Prerequisites](https://tauri.app/start/prerequisites/) for your platform

### Install & Run

```bash
# Install JS dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Build for Production

```bash
# Build the optimized release + installers
npm run tauri build
```

---

## 📁 Project Structure

```
TickTock/
├── src/                    # Frontend (HTML/CSS/JS)
│   ├── index.html          # App shell, modal dialogs, and tab panels
│   ├── styles.css          # Design system, glassmorphism, responsive UI
│   └── app.js              # Application logic (events, alarms, stopwatch, timer)
│
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs         # App entry point & System Tray logic
│   │   └── lib.rs          # Library crate
│   ├── capabilities/
│   │   └── default.json    # Permission capabilities
│   ├── tauri.conf.json     # Tauri configuration & CSP rules
│   └── Cargo.toml          # Rust dependencies
│
├── package.json            # NPM scripts & dependencies
└── README.md
```

---

## 🔒 Security & Privacy

Tick...Tock is designed with privacy and security in mind:
- **100% Offline** — No network requests, API tracking, or external CDNs.
- **Local Storage** — All data is strictly kept on your machine via `localStorage`.
- **Hardened CSP** — Strict Content Security Policy enforces local-only execution.
- **Input Sanitization** — Rigorous validation and XSS protection on all imported data.

---

## 🎨 Tech Stack

| Layer     | Technology           |
|-----------|----------------------|
| Shell     | Tauri v2             |
| Backend   | Rust                 |
| Frontend  | Vanilla HTML/CSS/JS  |
| Fonts     | Inter (Google Fonts) |
| Storage   | localStorage         |

---

## 📝 License

MIT