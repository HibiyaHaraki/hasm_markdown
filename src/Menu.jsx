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
import { Badge, Button, ButtonGroup, Form, Navbar, Offcanvas, OverlayTrigger, Tooltip } from "react-bootstrap";
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
  const [isFileOpen, setIsFileOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const missingAssets = currentPackage?.missingAssets ?? [];
  const warnings = currentPackage?.warnings ?? [];
  const softDeletedReferences = missingAssets.filter((asset) => currentPackage?.manifest?.assets?.[asset.alias]?.isDeleted);
  const errorAssets = missingAssets.filter((asset) => !currentPackage?.manifest?.assets?.[asset.alias]?.isDeleted);
  const statusText = saveState?.label === "Autosaved Locally" && saveState.timestamp
    ? `Autosaved Locally at ${new Date(saveState.timestamp).toLocaleTimeString()}`
    : saveState?.label ?? editorStatus;
  const hasWorkspace = Boolean(currentPackage?.uuid);
  const isDirty = Boolean(currentPackage?.isDirty) || statusText === "Unsaved Changes (*)";
  const localSyncState = !hasWorkspace ? "unavailable" : isDirty ? "pending" : "current";
  const localPath = currentPackage?.tempDirPath || "Temporal local workspace unavailable";
  const masterPath = currentPackage?.targetPath || "No local folder or archive package selected";

  const masterSyncState = !hasWorkspace ? "unavailable" : isDirty ? "pending" : statusText === "Ready" || saveState?.label === "Master Target Synced" ? "current" : "pending";
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
    <Navbar as="header" className="Menu">
      <Navbar.Brand className="Menu_Brand">
        <img className="Menu_Mark" src={hasmMarkdownLogo} alt="HASM Markdown" />
        <div><strong className="Menu_Title">HASM Markdown</strong><span className="Menu_Subtitle">Markdown Editor for HASM</span></div>
      </Navbar.Brand>
      <OverlayTrigger placement="bottom" overlay={<Tooltip id="workspace-target-path">{currentPackage?.targetPath || "No workspace target selected"}</Tooltip>}>
        <span className="Menu_Status" role={statusText.startsWith("Local autosave failed") ? "alert" : "status"} aria-live="polite" aria-atomic="true">{statusText}</span>
      </OverlayTrigger>
      <div className="Menu_Diagnostics" onMouseEnter={() => setIsDiagnosticsOpen(true)} onMouseLeave={() => setIsDiagnosticsOpen(false)}>
        <Button variant="outline-secondary" className="Menu_DiagnosticsTrigger" onFocus={() => setIsDiagnosticsOpen(true)} onClick={() => setIsDiagnosticsOpen((open) => !open)} aria-expanded={isDiagnosticsOpen} aria-controls="header-diagnostics">Diagnostics <span className="Menu_DiagnosticsCounts"><Badge bg="danger">{errorAssets.length}</Badge><Badge bg="warning" text="dark">{warnings.length + softDeletedReferences.length}</Badge></span></Button>
        {isDiagnosticsOpen && <div id="header-diagnostics" className="Menu_DiagnosticsPanel">
          <section aria-labelledby="header-errors-title">
            <h3 id="header-errors-title">Errors <span className="Menu_Badge">{errorAssets.length}</span></h3>
            {errorAssets.length === 0 ? <p className="GlobalMenu_Empty">Zero errors</p> : <ul>{errorAssets.map((asset) => <li key={`${asset.alias}-${asset.expectedRelativePath}`}><Button variant="link" onClick={() => onDiagnosticSelect?.(asset)}><strong>{asset.alias}</strong><span>Missing file{asset.referencedLines?.length ? ` on line${asset.referencedLines.length === 1 ? "" : "s"} ${asset.referencedLines.join(", ")}` : ""}</span></Button></li>)}</ul>}
          </section>
          <section aria-labelledby="header-warnings-title">
            <h3 id="header-warnings-title">Warnings <span className="Menu_Badge">{warnings.length + softDeletedReferences.length}</span></h3>
            {warnings.length + softDeletedReferences.length === 0 ? <p className="GlobalMenu_Empty">Zero warnings</p> : <ul>{softDeletedReferences.map((asset) => <li key={`deleted-${asset.alias}`}>Soft-deleted reference: {asset.alias}</li>)}{warnings.map((warning, index) => <li key={`${warning.alias ?? warning.path ?? "warning"}-${index}`}>{warning.alias ?? warning.path ?? String(warning)}</li>)}</ul>}
          </section>
        </div>}
      </div>
      <Button variant="outline-secondary" className="Menu_Toggle" onClick={() => setIsGlobalMenuOpen(true)} aria-label="Open workspace menu" aria-expanded={isGlobalMenuOpen}>
        <span aria-hidden="true"><i /><i /><i /></span><b>Menu</b>
      </Button>
    </Navbar>
    {isGlobalMenuOpen && (
      <Offcanvas show placement="end" onHide={() => setIsGlobalMenuOpen(false)} className="GlobalMenu" aria-label="Workspace menu">
        <Offcanvas.Header closeButton>
        <div className="GlobalMenu_Header">
          <div>
            <span className="GlobalMenu_Kicker">HASM MARKDOWN / CONTROL</span>
            <h2>Workspace menu</h2>
          </div>
        </div>
        </Offcanvas.Header>
        <Offcanvas.Body>
        <div className="GlobalMenu_SaveState" role="status" aria-live="polite">
          <strong>{saveState?.label ?? editorStatus}</strong>
          {saveState?.timestamp && <time dateTime={saveState.timestamp}>{saveState.timestamp}</time>}
        </div>
        <section className="GlobalMenu_WorkspaceSummary" aria-label="Workspace paths and synchronization status">
          <div className="GlobalMenu_Path"><span>Temporal local</span><code title={localPath}>{localPath}</code></div>
          <div className="GlobalMenu_Path"><span>Local folder / archive</span><code title={masterPath}>{masterPath}</code></div>
          <div className="GlobalMenu_SyncList">
            <div className={`GlobalMenu_SyncItem is-${localSyncState}`}><i aria-hidden="true" /><span>Temporal local</span><strong>{localSyncState === "current" ? "Current" : localSyncState === "pending" ? "Pending" : "Unavailable"}</strong></div>
            <div className={`GlobalMenu_SyncItem is-${masterSyncState}`}><i aria-hidden="true" /><span>Folder / archive</span><strong>{masterSyncState === "current" ? "Synced" : masterSyncState === "pending" ? "Pending" : "Unavailable"}</strong></div>
          </div>
        </section>
        <section className="GlobalMenu_Section">
          <Button variant="link" className="GlobalMenu_SectionToggle" onClick={() => setIsFileOpen((open) => !open)} aria-expanded={isFileOpen} aria-controls="global-menu-file">File <span aria-hidden="true">{isFileOpen ? "-" : "+"}</span></Button>
          {isFileOpen && <ButtonGroup vertical id="global-menu-file" className="Menu_ActionGrid">
            <Button variant="outline-secondary" onClick={handleOpen}>Open archive</Button>
            <Button variant="outline-secondary" onClick={() => onWorkspaceOpen?.("folder")}>Open folder</Button>
            <Button variant="outline-secondary" onClick={onSave} disabled={saveDisabled}>Save</Button>
            <Button variant="outline-secondary" onClick={onSaveAs} disabled={saveDisabled}>Save as</Button>
            <Button variant="outline-secondary" onClick={onExportFolder} disabled={saveDisabled}>Export folder</Button>
            <Button variant="outline-danger" onClick={onCloseWorkspace} disabled={saveDisabled}>Close workspace</Button>
          </ButtonGroup>}
        </section>
        <section className="GlobalMenu_Section">
          <Button variant="link" className="GlobalMenu_SectionToggle" onClick={() => setIsAppearanceOpen((open) => !open)} aria-expanded={isAppearanceOpen} aria-controls="global-menu-appearance">Appearance <span aria-hidden="true">{isAppearanceOpen ? "-" : "+"}</span></Button>
          {isAppearanceOpen && <div id="global-menu-appearance">
          <Form.Group className="Menu_Field" controlId="color-pattern"><Form.Label>Color pattern</Form.Label><Form.Select value={colorPattern} onChange={(event) => onColorPatternChange?.(event.target.value)}>{(colorPatternOptions ?? []).map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.markdownLabel ?? pattern.label}</option>)}</Form.Select></Form.Group>
          <ButtonGroup className="Menu_Segmented" aria-label="Text size">{["small", "medium", "large"].map((size) => <Button key={size} variant={textScale === size ? "primary" : "outline-secondary"} onClick={() => onTextScaleChange?.(size)}>{size}</Button>)}</ButtonGroup>
          <ButtonGroup className="Menu_Segmented" aria-label="View mode">{[["split", "Split"], ["editor", "Editor"], ["preview", "Preview"]].map(([mode, label]) => <Button key={mode} variant={viewMode === mode ? "primary" : "outline-secondary"} onClick={() => onViewModeChange?.(mode)}>{label}</Button>)}</ButtonGroup>
          <ButtonGroup className="Menu_Segmented" aria-label="Editor appearance">{[["light", "Editor light"], ["dark", "Editor dark"]].map(([mode, label]) => <Button key={mode} variant={editorColorMode === mode ? "primary" : "outline-secondary"} onClick={() => onEditorColorModeChange?.(mode)}>{label}</Button>)}</ButtonGroup>
          <Button variant="outline-primary" className="Menu_AssetsButton" onClick={() => { onAssetsOpen?.(); setIsGlobalMenuOpen(false); }} disabled={!onAssetsOpen}>Open asset library</Button>
          </div>}
        </section>
        </Offcanvas.Body>
      </Offcanvas>
    )}
    </>
  );
}

export default Menu;
