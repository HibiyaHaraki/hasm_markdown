# HASM Markdown 🌟

A desktop markdown editor built around a simple idea: keep the document, its media, and its save flow in one portable package.

## 🧭 Architecture at a glance

```mermaid
flowchart LR
    A[Markdown editor] --> B[Local temp workspace]
    B --> C[main.md + assets.json + assets/]
    C --> D[Save / Export]
    D --> E[.hasmmd archive or folder]
    E --> F[Portable package]
```

| Layer | Purpose | Notes |
|---|---|---|
| Temp workspace | Live editing | Fast local save and asset mapping |
| Package target | Final storage | `.hasmmd` archive or regular folder |
| CLI | Validation and preview | `verify`, `preview`, `open` |

## ✅ Current status

| Area | Status |
|---|---|
| Editor | ✅ |
| Preview | ✅ |
| Local save / open flow | ✅ |
| Workspace lock and asset mapping | ✅ |
| Advanced metadata and packaging | 🚧 |

## 🧩 Project structure

```text
hasm_markdown/
├── src/                  # React UI and editor experience
├── src-tauri/            # Tauri + Rust backend and CLI logic
├── docs/                 # architecture, requirements, evaluation docs
├── public/               # static assets
├── scripts/              # smoke/build checks
├── package.json          # frontend scripts and dependencies
├── vite.config.js        # Vite config
├── LICENSE               # GPL v3+
├── index.html            # app entry
└── README.md             # project overview
```

## 🗺️ Roadmap

| Phase | Focus |
|---|---|
| Now | editor, preview, local workspace, asset registration |
| Next | safer save/export flow, archive/folder packaging, validation |
| Later | metadata controls, richer packaging, sharing experience |

## 🛠️ Tech stack

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.7%2B-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?logo=bootstrap&logoColor=white)](https://getbootstrap.com/)
[![Markdown](https://img.shields.io/badge/Markdown-Ready-000000?logo=markdown&logoColor=white)](https://daringfireball.net/projects/markdown/)

## 📚 Docs

- [System overview](docs/arch/01-system-overview.md)
- [Package structure](docs/arch/00-hasm_markdown-structure.md)
- [Directory structure](docs/arch/02-directory-structure.md)
- [CLI interface](docs/00-cli-interface.md)

## ▶️ Quick start

```bash
npm install
npm run tauri dev
```

For production build:

```bash
npm run build
npm run tauri build
```

## 📜 License

This project is licensed under the GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
