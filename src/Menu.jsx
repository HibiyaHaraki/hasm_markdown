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
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import hasmMarkdownLogo from "./assets/logo/hasm_markdown_logo_transparent.png";
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
  textScale,
  onTextScaleChange,
  viewMode,
  onViewModeChange,
  editorColorMode,
  onEditorColorModeChange,
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
    <header className="Menu">
      <div className="Menu_Brand">
        <img className="Menu_Mark" src={hasmMarkdownLogo} alt="HASM Markdown" />
        <div><strong className="Menu_Title">HASM Markdown</strong><span className="Menu_Subtitle">Markdown Editor for HASM</span></div>
      </div>
      <OverlayTrigger placement="bottom" overlay={<Tooltip id="workspace-target-path">{currentPackage?.targetPath || "No workspace target selected"}</Tooltip>}>
        <span className="Menu_Status" role={statusText.startsWith("Local autosave failed") ? "alert" : "status"} aria-live="polite" aria-atomic="true">{statusText}</span>
      </OverlayTrigger>
      <button type="button" className="Menu_Toggle" onClick={() => setIsGlobalMenuOpen(true)} aria-label="Open workspace menu" aria-expanded={isGlobalMenuOpen}>
        <span aria-hidden="true"><i /><i /><i /></span><b>Menu</b>
      </button>
    </header>
    {isGlobalMenuOpen && (
      <div className="Menu_Overlay" onClick={() => setIsGlobalMenuOpen(false)}>
      <aside className="GlobalMenu" aria-label="Workspace menu" onClick={(event) => event.stopPropagation()}>
        <div className="GlobalMenu_Header">
          <div>
            <span className="GlobalMenu_Kicker">HASM MARKDOWN / CONTROL</span>
            <h2>Workspace menu</h2>
          </div>
          <button type="button" className="QuietButton" onClick={() => setIsGlobalMenuOpen(false)} aria-label="Close menu">Close</button>
        </div>
        <div className="GlobalMenu_SaveState" role="status" aria-live="polite">
          <strong>{saveState?.label ?? editorStatus}</strong>
          {saveState?.timestamp && <time dateTime={saveState.timestamp}>{saveState.timestamp}</time>}
        </div>
        <section className="GlobalMenu_Section">
          <h3>File</h3>
          <div className="Menu_ActionGrid">
            <button type="button" onClick={handleOpen}>Open archive</button>
            <button type="button" onClick={() => onWorkspaceOpen?.("folder")}>Open folder</button>
            <button type="button" onClick={onSave} disabled={saveDisabled}>Save</button>
            <button type="button" onClick={onSaveAs} disabled={saveDisabled}>Save as</button>
            <button type="button" onClick={onExportFolder} disabled={saveDisabled}>Export folder</button>
            <button type="button" onClick={onCloseWorkspace} disabled={saveDisabled}>Close workspace</button>
          </div>
        </section>
        <section className="GlobalMenu_Section">
          <h3>Appearance</h3>
          <label className="Menu_Field"><span>Color pattern</span><select value={colorPattern} onChange={(event) => onColorPatternChange?.(event.target.value)}>{(colorPatternOptions ?? []).map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.markdownLabel ?? pattern.label}</option>)}</select></label>
          <div className="Menu_Segmented" aria-label="Text size">{["small", "medium", "large"].map((size) => <button key={size} type="button" className={textScale === size ? "is-active" : ""} onClick={() => onTextScaleChange?.(size)}>{size}</button>)}</div>
          <div className="Menu_Segmented" aria-label="View mode">{[["split", "Split"], ["editor", "Editor"], ["preview", "Preview"]].map(([mode, label]) => <button key={mode} type="button" className={viewMode === mode ? "is-active" : ""} onClick={() => onViewModeChange?.(mode)}>{label}</button>)}</div>
          <div className="Menu_Segmented" aria-label="Editor appearance">{[["light", "Editor light"], ["dark", "Editor dark"]].map(([mode, label]) => <button key={mode} type="button" className={editorColorMode === mode ? "is-active" : ""} onClick={() => onEditorColorModeChange?.(mode)}>{label}</button>)}</div>
          <button type="button" className="Menu_AssetsButton" onClick={() => { onAssetsOpen?.(); setIsGlobalMenuOpen(false); }} disabled={!onAssetsOpen}>Open asset library</button>
        </section>
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
      </aside></div>
    )}
    </>
  );
}

export default Menu;
