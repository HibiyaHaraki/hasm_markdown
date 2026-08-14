# EVL-MD-06: Global Menu Notifications, Save State Indicator, and Dynamic Color Theme Switching Evaluation Specification

This document defines the test matrix, acceptance criteria, and traceability mapping for validating cross-cutting UI services across all application routes. It covers Global Menu diagnostic aggregation (Error List / Warning List), real-time save state readouts, and app-wide color-pattern switching using the complete `hasm_color_pattern` catalog with local persistence.

---

## Preconditions and Verification

The Global Menu must be opened through its actual accessible trigger before diagnostics, theme, or save-state controls can be evaluated. Waiting longer cannot satisfy a selector that does not name a rendered control.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies, Playwright Chromium, Rust, and port `4178` are available. | CI installs prerequisites; the script launches Vite with `--strictPort` and polls the server URL. | Satisfied when startup succeeds. |
| The root application shell and Global Menu trigger are rendered on the boot/editor page. | Verify one `.Menu` and the button with accessible name `Open workspace menu` before opening the drawer. | Satisfied by the application and `check-seq-md-06.mjs`. |
| Diagnostics, theme, and save-state assertions run only after the Global Menu trigger has opened the drawer. | Click `getByRole("button", { name: /open workspace menu/i })`, then wait for the drawer heading or content. | Satisfied by the `openWorkspaceMenu` helper. |
| Theme cases have Tauri theme mocks registered before the relevant page load or reload. | Register `get_app_theme_config` and `update_app_theme_config` through `addInitScript` before navigation/reload. | Satisfied for the mocked theme fixture. |
| Autosave cases start with a mounted editor and an IPC mock that records one `save_local_markdown_buffer` call. | The autosave fixture registers the mock before navigation, edits the textarea, and waits for the status change. | Satisfied by the fixture. |
| Native persistent theme configuration and real ten-second autosave storage are available for desktop verification. | Run the desktop application and inspect its configuration/App Local files. | Not established by mocked browser IPC. |

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Precondition | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-E2E-001`** | `REQ-MD-06-001` `REQ-MD-06-002` | Positive (Error List Display) | The boot route is loaded with no workspace, and `Open workspace menu` is visible. | Aggregate Missing Asset Errors in Global Menu | 1. Insert invalid asset reference `![alt](asset:missing.png)` in `main.md`. 2. Open Global Menu. 3. Inspect Error List badge. | 1. Badge indicator displays active error count (`1`). 2. Error List renders detail card for `missing.png`. |
| **`TC-MD-06-E2E-002`** | `REQ-MD-06-004` | Positive (Direct Error Jump) | The `?eval=md02` fixture is loaded with `unknown` in `missingAssets` and a mounted textarea. | Click Error Item in Global Menu | 1. Open Global Menu with active missing asset errors. 2. Click the error item card. | 1. Global Menu closes automatically. 2. Main editor scrolls directly to the line decorator containing the missing asset tag. |
| **`TC-MD-06-E2E-003`** | `REQ-MD-06-010` `REQ-MD-06-012` | Positive (Save State Readout) | The `?eval=md02&autosave=1` fixture has a writable textarea and a mocked local-autosave IPC response. | Verify Real-Time Save Status Transitions | 1. Type text into editor (`isDirty = true`). 2. Wait for 10s local autosave loop execution. | 1. Status displays "Unsaved Changes (*)" during editing. 2. Status transitions to "Autosaved Locally at HH:mm:ss" immediately after autosave completion. |
| **`TC-MD-06-E2E-004`** | `REQ-MD-06-020` `REQ-MD-06-023` | Positive (Theme Switch & Boot Persistence) | A theme-config IPC mock and browser local storage are available before the boot-page reload. | Select High-Contrast Theme and Restart App | 1. Open Global Menu. 2. Select "High-Contrast" theme. 3. Relaunch application. | 1. UI color scheme transitions to High-Contrast instantly without reload. 2. Upon relaunch (`SEQ-MD-01`), High-Contrast theme is retained automatically. |

---

## 2. React Level Tests (Frontend Component & UI Theme Provider)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-REACT-001`** | `REQ-MD-06-021` `REQ-MD-06-100` | Positive (Instant Pattern Switching SLA) | The workspace menu is open and exposes the complete `COLOR_PATTERN_OPTIONS` select control. | `src/main.jsx` + `src/hasm_color_pattern/src/index.js` | 1. Trigger pattern selection from the complete submodule option list. 2. Measure root shell variable update latency. | 1. Root `<html>` element `data-theme` attribute updates instantly. 2. Root shell variables come from the shared submodule and style recalculation completes within 16ms (1 frame). |
| **`TC-MD-06-REACT-002`** | `REQ-MD-06-022` | Positive (High-Contrast Red Contrast) | The high-contrast pattern is selected and the root application shell is mounted. | `src/main.css` + `src/HASM_Markdown_Editor.jsx` | 1. Switch to "High-Contrast" theme. 2. Render missing asset error spans and editor decorators. | 1. Error spans enforce high-visibility pure red (`#ff0000` text / `#ffffff` contrast background) adhering to accessibility standards. |
| **`TC-MD-06-REACT-003`** | `REQ-MD-06-013` | Positive (Master Sync Status) | A successful explicit-save result updates the active package state. | `src/Menu.jsx` + `src/main.jsx` | 1. Execute explicit save action (`SEQ-MD-04`). | 1. Save state indicator updates readout to "Master Target Synced". |
| **`TC-MD-06-REACT-004`** | `REQ-MD-06-001` `REQ-MD-06-002` `REQ-MD-06-003` | Positive (Zero Diagnostic State) | The boot route has no active workspace and the workspace menu is open. | `src/Menu.jsx` | 1. Open Global Menu during boot with no workspace. | 1. Error and warning counts are zero. 2. Global save-state readout is visible. |

---

## 3. Rust Level Tests (Backend Engine & Theme Config)

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-RUST-001`** | `REQ-MD-06-023` | Positive (Theme Preference Config Write) | A writable isolated AppConfig location is supplied to the command test. | `commands::update_app_theme_config` | 1. Send theme update IPC invocation (`High-Contrast`). 2. Inspect `AppConfig` file on disk. | 1. Config JSON payload is updated with `"themeMode": "High-Contrast"`. 2. Returns `Ok(())`. |
| **`TC-MD-06-RUST-002`** | `REQ-MD-06-020` | Negative (Unknown Theme Rejection) | The theme-config helper is callable with the unsupported value `Solarized`. | `commands::theme_config_for` | 1. Submit unsupported theme mode `Solarized`. | 1. Helper rejects the unsupported mode. |
| **`TC-MD-06-RUST-003`** | `REQ-MD-06-022` `REQ-MD-06-023` | Positive (High-Contrast Config Serialization) | A High-Contrast theme configuration can be constructed without filesystem I/O. | `commands::theme_config_for` | 1. Build a High-Contrast config. 2. Serialize it as AppConfig JSON. | 1. JSON contains `themeMode: High-Contrast`. 2. JSON contains `warningColor: #ff0000`. |

## 4. Automated Evaluation Script

`scripts/check-seq-md-06.mjs` follows the existing sequence-evaluation harness. It starts Vite on port `4178`, drives Playwright, records each test result, writes `.eval-reports/md-06-evaluation-report.html`, prints a `REPORT_FILE` marker, and exits non-zero if any case fails.

| Test ID | Automated assertion |
| --- | --- |
| `TC-MD-06-E2E-001` | The root `Menu` and diagnostics trigger remain visible on `/editor` boot state; workspace-only actions are disabled. |
| `TC-MD-06-REACT-001` | The selector is populated from `COLOR_PATTERN_OPTIONS`; `sand`, `classic`, and `high-contrast` resolve to submodule values, with standard backend persistence and local pattern-ID persistence. |
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