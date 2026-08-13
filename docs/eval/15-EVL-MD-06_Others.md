# EVL-MD-06: Global Menu Notifications, Save State Indicator, and Dynamic Color Theme Switching Evaluation Specification

This document defines the test matrix, acceptance criteria, and traceability mapping for validating cross-cutting UI services across all application routes. It covers Global Menu diagnostic aggregation (Error List / Warning List), real-time save state readouts, and app-wide 3-color theme switching (`Light`, `Dark`, `High-Contrast`) with local persistence.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-E2E-001`** | `REQ-MD-06-001` `REQ-MD-06-002` | Positive (Error List Display) | Aggregate Missing Asset Errors in Global Menu | 1. Insert invalid asset reference `![alt](asset:missing.png)` in `main.md`. 2. Open Global Menu. 3. Inspect Error List badge. | 1. Badge indicator displays active error count (`1`). 2. Error List renders detail card for `missing.png`. |
| **`TC-MD-06-E2E-002`** | `REQ-MD-06-004` | Positive (Direct Error Jump) | Click Error Item in Global Menu | 1. Open Global Menu with active missing asset errors. 2. Click the error item card. | 1. Global Menu closes automatically. 2. Main editor scrolls directly to the line decorator containing the missing asset tag. |
| **`TC-MD-06-E2E-003`** | `REQ-MD-06-010` `REQ-MD-06-012` | Positive (Save State Readout) | Verify Real-Time Save Status Transitions | 1. Type text in editor (`isDirty = true`). 2. Wait for 10s local autosave loop execution. | 1. Status displays "Unsaved Changes (*)" during editing. 2. Status transitions to "Autosaved Locally at HH:mm:ss" immediately after autosave completion. |
| **`TC-MD-06-E2E-004`** | `REQ-MD-06-020` `REQ-MD-06-023` | Positive (Theme Switch & Boot Persistence) | Select High-Contrast Theme and Restart App | 1. Open Global Menu. 2. Select "High-Contrast" theme. 3. Relaunch application. | 1. UI color scheme transitions to High-Contrast instantly without reload. 2. Upon relaunch (`SEQ-MD-01`), High-Contrast theme is retained automatically. |

---

## 2. React Level Tests (Frontend Component & UI Theme Provider)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-REACT-001`** | `REQ-MD-06-021` `REQ-MD-06-100` | Positive (Instant Theme Switching SLA) | `src/main.jsx` + `src/hasm_color_pattern/src/index.js` | 1. Trigger theme toggle between `Light`, `Dark`, and `High-Contrast`. 2. Measure root shell variable update latency. | 1. Root `<html>` element `data-theme` attribute updates instantly. 2. Root shell variables come from the shared submodule and style recalculation completes within 16ms (1 frame). |
| **`TC-MD-06-REACT-002`** | `REQ-MD-06-022` | Positive (High-Contrast Red Contrast) | `src/main.css` + `src/HASM_Markdown_Editor.jsx` | 1. Switch to "High-Contrast" theme. 2. Render missing asset error spans and editor decorators. | 1. Error spans enforce high-visibility pure red (`#ff0000` text / `#ffffff` contrast background) adhering to accessibility standards. |
| **`TC-MD-06-REACT-003`** | `REQ-MD-06-013` | Positive (Master Sync Status) | `src/Menu.jsx` + `src/main.jsx` | 1. Execute explicit save action (`SEQ-MD-04`). | 1. Save state indicator updates readout to "Master Target Synced". |
| **`TC-MD-06-REACT-004`** | `REQ-MD-06-001` `REQ-MD-06-002` `REQ-MD-06-003` | Positive (Zero Diagnostic State) | `src/Menu.jsx` | 1. Open Global Menu during boot with no workspace. | 1. Error and warning counts are zero. 2. Global save-state readout is visible. |

---

## 3. Rust Level Tests (Backend Engine & Theme Config)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-RUST-001`** | `REQ-MD-06-023` | Positive (Theme Preference Config Write) | `commands::update_app_theme_config` | 1. Send theme update IPC invocation (`High-Contrast`). 2. Inspect `AppConfig` file on disk. | 1. Config JSON payload is updated with `"themeMode": "High-Contrast"`. 2. Returns `Ok(())`. |
| **`TC-MD-06-RUST-002`** | `REQ-MD-06-020` | Negative (Unknown Theme Rejection) | `commands::theme_config_for` | 1. Submit unsupported theme mode `Solarized`. | 1. Helper rejects the unsupported mode. |
| **`TC-MD-06-RUST-003`** | `REQ-MD-06-022` `REQ-MD-06-023` | Positive (High-Contrast Config Serialization) | `commands::theme_config_for` | 1. Build a High-Contrast config. 2. Serialize it as AppConfig JSON. | 1. JSON contains `themeMode: High-Contrast`. 2. JSON contains `warningColor: #ff0000`. |

## 4. Automated Evaluation Script

`scripts/check-seq-md-06.mjs` follows the existing sequence-evaluation harness. It starts Vite on port `4178`, drives Playwright, records each test result, writes `.eval-reports/md-06-evaluation-report.html`, prints a `REPORT_FILE` marker, and exits non-zero if any case fails.

| Test ID | Automated assertion |
| --- | --- |
| `TC-MD-06-E2E-001` | The root `Menu` and diagnostics trigger remain visible on `/editor` boot state; workspace-only actions are disabled. |
| `TC-MD-06-REACT-001` | Light, Dark, and High-Contrast resolve to the `sand`, `classic`, and `high-contrast` patterns exported by `hasm_color_pattern`; localStorage and backend persistence are invoked. |
| `TC-MD-06-REACT-002` | High-Contrast applies `#ff0000` warning text and `#ffffff` warning background variables. |
| `TC-MD-06-E2E-002` | Missing asset diagnostics render, close the drawer, and select the referenced editor line. |
| `TC-MD-06-E2E-003` | Dirty editor state changes to a local autosave timestamp after one autosave IPC call. |
| `TC-MD-06-E2E-004` | High-Contrast remains selected after boot reload through the persisted preference. |
| `TC-MD-06-REACT-003` | The submodule theme-variable API remains the source of the root palette values. |
| `TC-MD-06-REACT-004` | Boot diagnostics show zero errors, zero warnings, and a save-state readout. |
| `TC-MD-06-RUST-001` | Rust accepts Light, Dark, and High-Contrast modes. |
| `TC-MD-06-RUST-002` | Rust rejects an unsupported theme mode. |
| `TC-MD-06-RUST-003` | Rust serializes High-Contrast with the required warning color. |

## 5. Current Automated Validation

| Check | Result |
| --- | --- |
| `npm run check:react-render` | PASS: React rendering smoke test has no runtime errors (`checkReactRendering`) |
| `npm run check:tauri-build` | PASS: Tauri backend build check; 22 tests passed, 0 failed (`checkTauriBuild`) |
| `npm run check:seq-md-06` | PASS: 11/11 SEQ-MD-06 cases passed (`checkSeqMd06`) |
| `.eval-reports/md-06-evaluation-report.html` | HTML report containing all 11 case results and pass/fail details |