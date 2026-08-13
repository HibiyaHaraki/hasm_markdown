// ###################################################
// File Name : Menu.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define Component of Global Menu Component
// Description : Define Component of Global Menu Component
// ###################################################

// Bootstrap
import { useState } from "react";
import { Navbar, Nav, NavDropdown } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

// CSS
import "./main.css";

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
  colorPatternOptions,
  onColorPatternChange,
  onWorkspaceOpen,
  editorStatus,
  onAssetsOpen,
  onSave,
  onSaveAs,
  onExportFolder,
  saveDisabled,
  onCloseWorkspace,
  saveState,
  onDiagnosticSelect,
}) {
  const [isGlobalMenuOpen, setIsGlobalMenuOpen] = useState(false);
  const missingAssets = currentPackage?.missingAssets ?? [];
  const warnings = currentPackage?.warnings ?? [];
  const softDeletedReferences = missingAssets.filter((asset) => currentPackage?.manifest?.assets?.[asset.alias]?.isDeleted);
  const errorAssets = missingAssets.filter((asset) => !currentPackage?.manifest?.assets?.[asset.alias]?.isDeleted);
  const statusText = saveState?.label === "Autosaved Locally" && saveState.timestamp
    ? `Autosaved Locally at ${new Date(saveState.timestamp).toLocaleTimeString()}`
    : saveState?.label ?? editorStatus;

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
  infoLog("[SEQ-MD-06][UI] render global shell", {
    errors: errorAssets.length,
    warnings: warnings.length + softDeletedReferences.length,
  });
  return (
    <>
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
        role={statusText.startsWith("Local autosave failed") ? "alert" : "status"}
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </span>
      <Nav className="me-auto">
        <NavDropdown title="File" id="basic-nav-dropdown" className="m-2">
          <NavDropdown.Item onClick={handleOpen}>Open Archive</NavDropdown.Item>
          <NavDropdown.Item onClick={() => onWorkspaceOpen?.("folder")}>Open Folder</NavDropdown.Item>
          <NavDropdown.Divider />
          <NavDropdown.Item onClick={onSave} disabled={saveDisabled}>Save</NavDropdown.Item>
          <NavDropdown.Item onClick={onSaveAs} disabled={saveDisabled}>Save As</NavDropdown.Item>
          <NavDropdown.Item onClick={onExportFolder} disabled={saveDisabled}>Export Folder</NavDropdown.Item>
          <NavDropdown.Divider />
          <NavDropdown.Item onClick={onCloseWorkspace} disabled={saveDisabled}>Close Workspace</NavDropdown.Item>
        </NavDropdown>
        <button type="button" className="Menu_AssetsButton" onClick={onAssetsOpen} disabled={!onAssetsOpen}>Assets</button>
        <NavDropdown title="Theme" id="theme-nav-dropdown" className="m-2">
          {(colorPatternOptions ?? []).map((pattern) => (
            <NavDropdown.Item
              key={pattern.id}
              active={colorPattern === pattern.id}
              onClick={() => {
                onColorPatternChange?.(pattern.id);
              }}
            >
              {pattern.markdownLabel ?? pattern.label}
            </NavDropdown.Item>
          ))}
        </NavDropdown>
        <button
          type="button"
          className="Menu_DiagnosticsButton"
          onClick={() => setIsGlobalMenuOpen(true)}
          aria-label="Open diagnostics menu"
          aria-expanded={isGlobalMenuOpen}
        >
          Diagnostics <span className="Menu_Badge">{errorAssets.length + warnings.length + softDeletedReferences.length}</span>
        </button>
      </Nav>      
    </Navbar>
    {isGlobalMenuOpen && (
      <aside className="GlobalMenu" aria-label="Global diagnostics menu">
        <div className="GlobalMenu_Header">
          <div>
            <span className="GlobalMenu_Kicker">WORKSPACE STATUS</span>
            <h2>Diagnostics</h2>
          </div>
          <button type="button" onClick={() => setIsGlobalMenuOpen(false)} aria-label="Close diagnostics">Close</button>
        </div>
        <div className="GlobalMenu_SaveState" role="status" aria-live="polite">
          <strong>{saveState?.label ?? editorStatus}</strong>
          {saveState?.timestamp && <time dateTime={saveState.timestamp}>{saveState.timestamp}</time>}
        </div>
        <section className="GlobalMenu_Section" aria-labelledby="global-errors-title">
          <h3 id="global-errors-title">Errors <span className="Menu_Badge">{errorAssets.length}</span></h3>
          {errorAssets.length === 0 ? <p className="GlobalMenu_Empty">Zero errors</p> : (
            <ul>
              {errorAssets.map((asset) => (
                <li key={`${asset.alias}-${asset.expectedRelativePath}`}>
                  <button type="button" onClick={() => {
                    onDiagnosticSelect?.(asset);
                    setIsGlobalMenuOpen(false);
                  }}>
                    <strong>{asset.alias}</strong>
                    <span>Missing file{asset.referencedLines?.length ? ` on line${asset.referencedLines.length === 1 ? "" : "s"} ${asset.referencedLines.join(", ")}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="GlobalMenu_Section" aria-labelledby="global-warnings-title">
          <h3 id="global-warnings-title">Warnings <span className="Menu_Badge">{warnings.length + softDeletedReferences.length}</span></h3>
          {warnings.length + softDeletedReferences.length === 0 ? <p className="GlobalMenu_Empty">Zero warnings</p> : (
            <ul>
              {softDeletedReferences.map((asset) => <li key={`deleted-${asset.alias}`}>Soft-deleted reference: {asset.alias}</li>)}
              {warnings.map((warning, index) => <li key={`${warning.alias ?? warning.path ?? "warning"}-${index}`}>{warning.alias ?? warning.path ?? String(warning)}</li>)}
            </ul>
          )}
        </section>
      </aside>
    )}
    </>
  );
}

export default Menu;
