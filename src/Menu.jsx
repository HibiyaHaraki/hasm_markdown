// ###################################################
// File Name : Menu.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define Component of Global Menu Component
// Description : Define Component of Global Menu Component
// ###################################################

// Bootstrap
import { Navbar, Nav, NavDropdown } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

// CSS
import "./main.css";
import { COLOR_PATTERN_OPTIONS, isValidColorPattern } from "./hasm_color_pattern/src/index.js";

// Tauri
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, documentDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

// Logger
import { traceLog, debugLog, infoLog, warnLog, errorLog } from "./hasm_logger/src/react/logger.js";

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
const DEFAULT_HASMMD_FILENAME = "untitled.hasmmd";

const resolveArchiveDefaultPath = async (currentPackage) => {
  if (currentPackage?.hasmmd_local_path) {
    return currentPackage.hasmmd_local_path;
  }

  const docsPath = await documentDir();
  return join(docsPath, DEFAULT_HASMMD_FILENAME);
};

// ###################################################
// Function : Menu
// Description : Definition of Global Menu Component
// ###################################################
function Menu({
  markdown,
  currentPackage,
  onPackageChange,
  setMarkdown,
  colorPattern,
  onColorPatternChange,
  onWorkspaceOpen,
  editorStatus,
  onAssetsOpen,
  onSave,
  onSaveAs,
  onExportFolder,
  saveDisabled,
}) {

  // Tauri : Open Exist Package
  const handleOpen = async () => {
    if (!isTauriRuntime) {
      warnLog("Tauri runtime is not available; skipping package open.");
      return;
    }

    try {
      infoLog("[SEQ-MD-01][UI] archive selection requested");
      onWorkspaceOpen?.("archive");
    } catch (err) {
      errorLog("[SEQ-MD-01][UI][ERROR] failed to open archive", err);
    }
  };

  // Tauri : Save Edit Page as New File
  const handleSaveAs = async () => {
    if (!isTauriRuntime) {
      warnLog("Tauri runtime is not available; skipping save as.");
      return;
    }

    try {
      debugLog("[SEQ-MD-01][UI] save-as flow requested");
      const archiveDefaultPath = await resolveArchiveDefaultPath(currentPackage);

      // Step 1. Select single hasmmd file from file dialog
      const selected = await save({
        filters: [{ name: "HASM Markdown", extensions: ["hasmmd"] }],
        defaultPath: archiveDefaultPath,
      });

      if (selected) {
        // Step 2. Check selected file has correct extension (.hasmmd)
        const targetHasmmdPath = selected.toLowerCase().endsWith(".hasmmd")
          ? selected
          : `${selected}.hasmmd`;

        // Step 3. Update local package
        await invoke("save_local_package", { markdown });

        // Step 4. Save local package into target .hasmmd file
        const pkg = await invoke("save_hasmmd", { targetHasmmdPath });

        // Step 5. Update local Package info
        onPackageChange?.(pkg);
      }
    } catch (err) {
      errorLog("Failed to save as:", err);
    }
  };

  // Return Menu Component
  infoLog("Render Menu");
  return (
    <Navbar 
      variant="dark" 
      expand={false}
      className="Menu"
    >
      <Navbar.Brand 
        href="#"
        className="Menu_Title"
      >
        HASM
      </Navbar.Brand>
      <span
        className="Menu_Status"
        role={editorStatus.startsWith("Local autosave failed") ? "alert" : "status"}
        aria-live="polite"
        aria-atomic="true"
      >
        {editorStatus}
      </span>
      <Nav className="me-auto">
        <NavDropdown title="File" id="basic-nav-dropdown" className="m-2">
          <NavDropdown.Item onClick={handleOpen}>Open Archive</NavDropdown.Item>
          <NavDropdown.Item onClick={() => onWorkspaceOpen?.("folder")}>Open Folder</NavDropdown.Item>
          <NavDropdown.Divider />
          <NavDropdown.Item onClick={onSave} disabled={saveDisabled}>Save</NavDropdown.Item>
          <NavDropdown.Item onClick={onSaveAs} disabled={saveDisabled}>Save As</NavDropdown.Item>
          <NavDropdown.Item onClick={onExportFolder} disabled={saveDisabled}>Export Folder</NavDropdown.Item>
        </NavDropdown>
        <button type="button" className="Menu_AssetsButton" onClick={onAssetsOpen}>Assets</button>
        <NavDropdown title="Theme" id="theme-nav-dropdown" className="m-2">
          {COLOR_PATTERN_OPTIONS.map((pattern) => (
            <NavDropdown.Item
              key={pattern.id}
              active={colorPattern === pattern.id}
              onClick={() => {
                if (isValidColorPattern(pattern.id)) {
                  onColorPatternChange?.(pattern.id);
                }
              }}
            >
              {pattern.markdownLabel ?? pattern.label}
            </NavDropdown.Item>
          ))}
        </NavDropdown>
      </Nav>      
    </Navbar>
  );
}

export default Menu;
