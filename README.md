# ⏳ Countdown Manager

A beautiful, minimal desktop countdown timer application built with **Tauri v2** and vanilla HTML/CSS/JavaScript.

Track your most important events — birthdays, launches, deadlines, vacations — all in one place with live second-by-second countdowns.

---

## ✨ Features

- **Multiple events** — Add as many countdowns as you like
- **Live countdown** — Updates every second (days, hours, minutes, seconds)
- **Color tags** — 6 colors to visually differentiate events  
- **Progress tracking** — See how much time has elapsed since you added the event
- **Persistent storage** — Events survive app restarts via `localStorage`
- **Edit & Delete** — Full CRUD with delete confirmation
- **Expired event detection** — See how long ago an event passed
- **Accessible** — ARIA roles, keyboard navigation, semantic HTML

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
npm run tauri build
```

---

## 📁 Project Structure

```
TickTock/
├── src/                    # Frontend (HTML/CSS/JS)
│   ├── index.html          # App shell & markup
│   ├── styles.css          # Design system & all styles
│   └── app.js              # Application logic
│
├── src-tauri/              # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs         # App entry point
│   │   └── lib.rs          # Library crate
│   ├── capabilities/
│   │   └── default.json    # Permission capabilities
│   ├── tauri.conf.json     # Tauri configuration
│   ├── Cargo.toml          # Rust dependencies
│   └── build.rs            # Tauri build script
│
├── package.json            # NPM scripts & dependencies
└── README.md
```

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