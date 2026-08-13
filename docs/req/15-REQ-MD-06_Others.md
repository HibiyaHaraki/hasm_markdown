# REQ-MD-06: Global Menu Notifications, Save State Indicator, and Dynamic Color Theme Switching Requirements

## 1. Functional Requirements

### 1.1 Global Menu & Diagnostic Notifications

* **`REQ-MD-06-001` (Persistent Global Menu Accessibility):** The system shall render a persistent Global Menu trigger inside the root application shell (`AppLayout`), making it accessible across all route pages (`/select`, `/editor`, `/loading-model`, `/error-model`, `/error-app`).
* **`REQ-MD-06-002` (Error List Notification):** The Global Menu shall aggregate and display active error records (`missingAssets` tags referenced in `main.md` but missing physically, plus process lock conflicts) in a dedicated Error List view with badge count indicators.
* **`REQ-MD-06-003` (Warning List Notification):** The Global Menu shall aggregate and display active warning records (unregistered orphan files in `assets/` and soft-deleted asset references) in a dedicated Warning List view.
* **`REQ-MD-06-004` (Direct Error Navigation):** Clicking an item in the Error List shall scroll the main code editor to the relevant line decorator and highlight the missing asset tag.

---

### 1.2 Real-Time Save State Indicator

* **`REQ-MD-06-010` (Unsaved Changes Status Readout):** When `isDirty === true`, the header and Global Menu shall immediately render an "Unsaved Changes (*)" indicator status.
* **`REQ-MD-06-011` (Active Save/Autosave Progress Readout):** When an autosave or explicit save IPC command is executing (`isSaving === true`), the system shall display a "Saving / Syncing..." indicator with a spinner animation.
* **`REQ-MD-06-012` (Autosave Timestamp Readout):** Upon successful local autosave completion (`isDirty === false`), the system shall display "Autosaved Locally at HH:mm:ss" using the formatted epoch timestamp.
* **`REQ-MD-06-013` (Master Target Sync Readout):** Upon successful completion of an explicit save/export (`SEQ-MD-04`), the system shall display "Master Target Synced".

---

### 1.3 App-Wide 3-Color Theme Selector

* **`REQ-MD-06-020` (Three Color Palette Support):** The system shall support three standardized UI color themes: **`Light`**, **`Dark`**, and **`High-Contrast`**.
* **`REQ-MD-06-021` (App-Wide Theme Application):** Selecting a theme shall dynamically update the CSS variables (`data-theme`) across the entire root application DOM without requiring a page reload or window restart.
* **`REQ-MD-06-022` (High-Contrast Red Warning Accessibility):** In `High-Contrast` mode, all error decorators, missing asset warning spans, and badge indicators shall enforce pure high-visibility red (`#ff0000` text / `#ffffff` contrast background) for accessibility compliance.
* **`REQ-MD-06-023` (Theme Preference Persistence):** The system shall persist the selected theme preference in `localStorage` and pass it to the Rust backend to store in `AppConfig`. Upon application boot (`SEQ-MD-01`), the saved theme shall be applied automatically.

---

## 2. Non-Functional Requirements

### 2.1 Performance and Usability

* **`REQ-MD-06-100` (Instant Theme Switch SLA):** Theme palette switching shall complete DOM style re-calculation within **16ms (1 frame)** across all active components.
* **`REQ-MD-06-101` (Non-Blocking Diagnostic Subscription):** Subscribing to store updates for live error/warning badge counts and save state readouts shall not introduce rendering lag in the main Markdown editor during continuous keystrokes.

## 3. Implementation Traceability

The requirements are implemented by the root shell in `src/main.jsx`, the diagnostics/theme surface in `src/Menu.jsx`, variables consumed from `src/hasm_color_pattern`, and the `get_app_theme_config` / `update_app_theme_config` commands in `src-tauri/src/commands/mod.rs`. The shell is rendered on boot and editor states. Soft-deleted referenced assets are presented in the Warning List while physically missing or unknown aliases remain in the Error List.

---