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
| **`TC-MD-06-REACT-001`** | `REQ-MD-06-021` `REQ-MD-06-100` | Positive (Instant Theme Switching SLA) | `ThemeProvider.tsx` | 1. Trigger theme toggle between `Light`, `Dark`, and `High-Contrast`. 2. Measure DOM attribute update latency. | 1. Root `<html>` element `data-theme` attribute updates instantly. 2. CSS style recalculation completes within 16ms (1 frame). |
| **`TC-MD-06-REACT-002`** | `REQ-MD-06-022` | Positive (High-Contrast Red Contrast) | `MarkdownEditor.tsx` / `MarkdownPreview.tsx` | 1. Switch to "High-Contrast" theme. 2. Render missing asset error spans and editor decorators. | 1. Error spans enforce high-visibility pure red (`#ff0000` text / `#ffffff` contrast background) adhering to accessibility standards. |
| **`TC-MD-06-REACT-003`** | `REQ-MD-06-013` | Positive (Master Sync Status) | `Header.tsx` | 1. Execute explicit save action (`SEQ-MD-04`). | 1. Save state indicator updates readout to "Master Target Synced". |

---

## 3. Rust Level Tests (Backend Engine & Theme Config)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-06-RUST-001`** | `REQ-MD-06-023` | Positive (Theme Preference Config Write) | `commands::update_app_theme_config` | 1. Send theme update IPC invocation (`High-Contrast`). 2. Inspect `AppConfig` file on disk. | 1. Config JSON payload is updated with `"themeMode": "High-Contrast"`. 2. Returns `Ok(())`. |