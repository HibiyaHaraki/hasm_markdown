// ###################################################
// File Name : main.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : main.jsx
// Description : 
// ###################################################

// React
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

// JSXs
import Menu from "./Menu"; // Menu Component
import HASM_Markdown_Editor from "./HASM_Markdown_Editor"; // HASM Markdown Editor Component
import AssetWindow from "./AssetWindow";
import {
  COLOR_PATTERN_OPTIONS,
  DEFAULT_COLOR_PATTERN,
  getMarkdownThemeVariables,
  getPatternById,
  getThemeVariables,
  isValidColorPattern,
} from "./hasm_color_pattern/src/index.js";

// CSS
import "./main.css";

// Bootstrap
import { Container } from "react-bootstrap";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { appLocalDataDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

// Logger
import { traceLog, debugLog, infoLog, warnLog, errorLog } from "./hasm_logger/src/react/logger.js";

const BACKEND_THEME_MODES = {
  sand: "Light",
  classic: "Dark",
  "high-contrast": "High-Contrast",
};
const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
const EMPTY_MARKDOWN = "# HASM Markdown\n\nCreate or open a workspace to begin.";
const EVALUATION_FIXTURE = {
  uuid: "eval-md-02",
  targetType: "Folder",
  lastSavedContent: "![present](asset:present)\n![deleted](asset:deleted)",
  manifest: {
    version: "1",
    assets: {
      present: { uuid: "present.png", resolvedPath: "C:/eval/assets/present.png" },
      second: { uuid: "second.png", resolvedPath: "C:/eval/assets/second.png" },
      deleted: { uuid: "deleted.png", resolvedPath: "C:/eval/assets/deleted.png", isDeleted: true },
    },
  },
  missingAssets: [{ alias: "unknown", expectedRelativePath: "assets/unknown.png", referencedLines: [2] }],
};
const ASSET_EVALUATION_FIXTURE = {
  uuid: "eval-md-03",
  targetType: "Folder",
  lastSavedContent: "# Assets\n\n![deleted](asset:deleted)",
  manifest: {
    version: "1",
    assets: {
      active: { uuid: "active.png", resolvedPath: "C:/eval/assets/active.png" },
      deleted: { uuid: "deleted.png", resolvedPath: "C:/eval/assets/deleted.png", isDeleted: true },
    },
  },
  missingAssets: [{ alias: "deleted", expectedRelativePath: "assets/deleted.png", referencedLines: [3] }],
  warnings: [],
};
const SAVE_EVALUATION_FIXTURE = {
  uuid: "eval-md-04",
  targetType: "Folder",
  targetPath: "C:/eval/workspace",
  lastSavedContent: "# Save fixture",
  manifest: { version: "1", assets: {} },
  missingAssets: [],
  warnings: [],
};
const CLOSE_EVALUATION_FIXTURE = {
  uuid: "eval-md-05",
  targetType: "Folder",
  targetPath: "C:/eval/workspace",
  lastSavedContent: "# Close fixture",
  manifest: { version: "1", assets: {} },
  missingAssets: [],
  warnings: [],
};
const evaluationMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("eval")
  : null;
const isEditorEvaluation = evaluationMode === "md02";
const isAssetEvaluation = evaluationMode === "md03";
const isSaveEvaluation = evaluationMode === "md04";
const isCloseEvaluation = evaluationMode === "md05";

function getRelativeLuminance(hexColor) {
  const hex = String(hexColor).replace("#", "");
  if (hex.length !== 6) return 0.5;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function getContrastRatio(firstColor, secondColor) {
  const first = getRelativeLuminance(firstColor);
  const second = getRelativeLuminance(secondColor);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableThemeColors(colors) {
  const accent = getContrastRatio(colors.mainColor, colors.textBackgroundColor) >= 4.5
    ? colors.mainColor
    : colors.textColor;
  const onAccent = getContrastRatio(colors.textColor, colors.mainColor) >= getContrastRatio(colors.textBackgroundColor, colors.mainColor)
    ? colors.textColor
    : colors.textBackgroundColor;
  return { accent, onAccent };
}

function normalizePackagePayload(result, fallbackMarkdown = EMPTY_MARKDOWN) {
  const packageValue = Array.isArray(result) ? result[0] : result;
  const markdown = Array.isArray(result)
    ? result[1]
    : packageValue?.rawContent ?? packageValue?.content ?? fallbackMarkdown;

  debugLog("[SEQ-MD-01][STATE] normalize PackageStatePayload", {
    uuid: packageValue?.uuid,
    targetType: packageValue?.targetType,
  });
  return {
    ...packageValue,
    rawContent: markdown,
    isLoaded: true,
    isDirty: false,
    targetType: packageValue?.targetType ?? "Unbound",
    targetPath: packageValue?.targetPath ?? packageValue?.hasmmd_local_path ?? null,
    manifest: packageValue?.manifest ?? { version: "1", assets: {} },
    missingAssets: packageValue?.missingAssets ?? [],
    warnings: packageValue?.warnings ?? [],
  };
}

function getLaunchTarget() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("path") ?? params.get("target");
}

function isUnknownCommandError(error) {
  const message = String(error ?? "").toLowerCase();
  return message.includes("unknown command") || message.includes("command not found");
}

function BootScreen({ phase, error, onOpen }) {
  const isLoading = phase === "loading";
  const title = isLoading ? "Opening workspace" : phase === "error" ? "Workspace could not be opened" : "HASM Markdown";
  const message = isLoading
    ? "Preparing metadata and resolving asset paths..."
    : phase === "error"
      ? error
      : "Open an archive, mount a folder, or create a new workspace.";

  return (
    <main className="BootScreen">
      <section className="BootScreen_Panel" aria-live="polite">
        <p className="BootScreen_Kicker">HASM MARKDOWN</p>
        <h1>{title}</h1>
        <p className="BootScreen_Message">{message}</p>
        {!isLoading && (
          <div className="BootScreen_Actions">
            <button type="button" onClick={() => onOpen("archive")} disabled={!isTauriRuntime}>Open .hasmmd archive</button>
            <button type="button" onClick={() => onOpen("folder")} disabled={!isTauriRuntime}>Open workspace folder</button>
            <button type="button" className="BootScreen_Actions_Primary" onClick={() => onOpen("new")} disabled={!isTauriRuntime}>Create new workspace</button>
          </div>
        )}
        {!isTauriRuntime && <small>Run this application in its Tauri desktop shell to open a workspace.</small>}
      </section>
    </main>
  );
}

function SaveProgress({ progress }) {
  if (!progress) return null;
  return (
    <div className="SaveProgress" role="dialog" aria-modal="true" aria-label="Saving workspace">
      <strong>Saving workspace</strong>
      <span>{progress.stage}</span>
      <progress max="100" value={progress.percentage}>{progress.percentage}%</progress>
      <span>{Math.round(progress.percentage)}%</span>
    </div>
  );
}

function CloseWorkspaceModal({ onSave, onDiscard, onCancel, busy }) {
  return (
    <div className="CloseWorkspaceModal" role="dialog" aria-modal="true" aria-label="Unsaved changes">
      <strong>You have unsaved changes.</strong>
      <span>Save before closing?</span>
      <div className="CloseWorkspaceModal_Actions">
        <button type="button" onClick={onSave} disabled={busy}>Save</button>
        <button type="button" onClick={onDiscard} disabled={busy}>Discard Changes</button>
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

// ###################################################
// Function : App
// Description : Definition of App Componentincluding all component
// ###################################################
function App() {

  // Define Markdown Status
  const initialFixture = isEditorEvaluation ? EVALUATION_FIXTURE : isAssetEvaluation ? ASSET_EVALUATION_FIXTURE : isSaveEvaluation ? SAVE_EVALUATION_FIXTURE : isCloseEvaluation ? CLOSE_EVALUATION_FIXTURE : null;
  const [markdown, setMarkdown] = useState(initialFixture?.lastSavedContent ?? EMPTY_MARKDOWN);

  // Define HASMMD Package Status
  const [currentPackage, setCurrentPackage] = useState(initialFixture);

  // Define Color Pattern Status
  const [colorPattern, setColorPattern] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_COLOR_PATTERN;
    const storedTheme = localStorage.getItem("hasm_theme_preference");
    const restoredPattern = {
      Light: "sand",
      Dark: "classic",
      "High-Contrast": "high-contrast",
    }[storedTheme] ?? storedTheme;
    return isValidColorPattern(restoredPattern) ? restoredPattern : DEFAULT_COLOR_PATTERN;
  });
  const [editorStatus, setEditorStatus] = useState("Ready");
  const [textScale, setTextScale] = useState(() => localStorage.getItem("hasm_text_scale") ?? "medium");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("hasm_view_mode") ?? "split");
  const [lastAutosavedAt, setLastAutosavedAt] = useState(null);
  const [lastMasterSyncedAt, setLastMasterSyncedAt] = useState(null);
  const [saveProgress, setSaveProgress] = useState(null);
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [isAssetWindowOpen, setIsAssetWindowOpen] = useState(false);
  const [isClosePromptOpen, setIsClosePromptOpen] = useState(false);
  const editorRef = React.useRef(null);
  const [phase, setPhase] = useState(
    initialFixture ? "editor" : isTauriRuntime || window.location.pathname === "/editor" ? "select" : "editor",
  );
  const [bootError, setBootError] = useState("");

  const savePackage = useCallback(async (exportTargetPath = null) => {
    if (!isTauriRuntime || !currentPackage?.uuid || isSavingPackage) return;
    setIsSavingPackage(true);
    setSaveProgress({ stage: "Starting", percentage: 0 });
    try {
      const result = await invoke("execute_package_save_or_export", {
        uuid: currentPackage.uuid,
        exportTargetPath,
      });
      const payload = normalizePackagePayload(result, markdown);
      setCurrentPackage(payload);
      setMarkdown(payload.rawContent);
      setEditorStatus("Master Target Synced");
      setLastMasterSyncedAt(new Date().toISOString());
      return true;
    } catch (error) {
      errorLog("[SEQ-MD-04][SAVE][ERROR] package save failed", error);
      setEditorStatus(`Save failed: ${String(error)}`);
      return false;
    } finally {
      setSaveProgress(null);
      setIsSavingPackage(false);
    }
  }, [currentPackage, isSavingPackage, markdown]);

  const handleThemeChange = useCallback(async (theme) => {
    if (!isValidColorPattern(theme)) return;
    setColorPattern(theme);
    localStorage.setItem("hasm_theme_preference", theme);
    document.documentElement.dataset.theme = theme;
    infoLog("[SEQ-MD-06][THEME] color pattern applied", { pattern: theme });
    const backendTheme = BACKEND_THEME_MODES[theme];
    if (isTauriRuntime && backendTheme) {
      try {
        await invoke("update_app_theme_config", { theme: backendTheme });
      } catch (error) {
        warnLog("[SEQ-MD-06][THEME][ERROR] theme persistence failed", error);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = colorPattern.toLowerCase();
  }, [colorPattern]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    invoke("get_app_theme_config")
      .then((theme) => {
        const restoredPattern = BACKEND_THEME_MODES[theme] ? {
          Light: "sand",
          Dark: "classic",
          "High-Contrast": "high-contrast",
        }[theme] : theme;
        if (isValidColorPattern(restoredPattern)) {
          setColorPattern(restoredPattern);
          localStorage.setItem("hasm_theme_preference", restoredPattern);
        }
      })
      .catch((error) => warnLog("[SEQ-MD-06][THEME][ERROR] theme restore failed", error));
  }, []);

  const saveState = isSavingPackage || currentPackage?.isSaving
    ? { label: "Saving / Syncing..." }
    : editorStatus.startsWith("Local autosave failed")
      ? { label: editorStatus }
    : currentPackage?.isDirty || markdown !== (currentPackage?.lastSavedContent ?? markdown)
      ? { label: "Unsaved Changes (*)" }
      : editorStatus.startsWith("Autosaved locally") && lastAutosavedAt
        ? { label: "Autosaved Locally", timestamp: lastAutosavedAt }
        : lastMasterSyncedAt
        ? { label: "Master Target Synced", timestamp: lastMasterSyncedAt }
        : lastAutosavedAt
          ? { label: "Autosaved Locally", timestamp: lastAutosavedAt }
          : { label: editorStatus };

  const themePattern = getPatternById(colorPattern, DEFAULT_COLOR_PATTERN);
  const readableThemeColors = getReadableThemeColors(themePattern.colors);
  const readableDanger = getContrastRatio(themePattern.colors.dangerColor, themePattern.colors.textBackgroundColor) >= 4.5
    ? themePattern.colors.dangerColor
    : themePattern.colors.textColor;
  const themeVariables = {
    ...getThemeVariables(themePattern.id),
    ...getMarkdownThemeVariables(themePattern.id),
    "--theme-warning-background": colorPattern === "high-contrast" ? "#ffffff" : themePattern.colors.softColor,
    "--theme-danger": colorPattern === "high-contrast" ? "#ff0000" : themePattern.colors.dangerColor,
    "--theme-accent-readable": readableThemeColors.accent,
    "--theme-on-accent": readableThemeColors.onAccent,
    "--theme-danger-readable": readableDanger,
    "--base-font-size": textScale === "small" ? "14px" : textScale === "large" ? "18px" : "16px",
  };

  useEffect(() => {
    Object.entries(themeVariables).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
  }, [themeVariables]);

  const handleTextScaleChange = useCallback((scale) => {
    setTextScale(scale);
    localStorage.setItem("hasm_text_scale", scale);
  }, []);

  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    localStorage.setItem("hasm_view_mode", mode);
  }, []);

  const saveAsPackage = useCallback(async () => {
    if (!isTauriRuntime || isSavingPackage) return;
    const selected = await save({
      filters: [{ name: "HASM Markdown", extensions: ["hasmmd"] }],
      defaultPath: currentPackage?.targetPath ?? undefined,
    });
    if (selected) await savePackage(selected.toLowerCase().endsWith(".hasmmd") ? selected : `${selected}.hasmmd`);
  }, [currentPackage?.targetPath, isSavingPackage, savePackage]);

  const exportFolder = useCallback(async () => {
    if (!isTauriRuntime || isSavingPackage) return;
    const selected = await open({ directory: true, multiple: false });
    if (selected && !Array.isArray(selected)) await savePackage(selected);
  }, [isSavingPackage, savePackage]);

  const finishClose = useCallback(async (forceDiscard = false) => {
    if (!isTauriRuntime || !currentPackage?.uuid) return;
    try {
      await invoke("close_and_cleanup_workspace", { uuid: currentPackage.uuid, forceDiscard });
      setCurrentPackage(null);
      setMarkdown(EMPTY_MARKDOWN);
      setEditorStatus("Ready");
      setIsAssetWindowOpen(false);
      setIsClosePromptOpen(false);
      setPhase("select");
      window.history.replaceState({}, "", "/select");
    } catch (error) {
      errorLog("[SEQ-MD-05][CLOSE][ERROR] workspace close failed", error);
      setEditorStatus(`Close failed: ${String(error)}`);
    }
  }, [currentPackage?.uuid]);

  const requestClose = useCallback(() => {
    const dirty = currentPackage?.isDirty ?? markdown !== (currentPackage?.lastSavedContent ?? markdown);
    if (dirty) setIsClosePromptOpen(true);
    else finishClose(false);
  }, [currentPackage, finishClose, markdown]);

  const saveAndClose = useCallback(async () => {
    const saved = await savePackage();
    if (saved) await finishClose(false);
  }, [finishClose, savePackage]);

  useEffect(() => {
    if (!isTauriRuntime) return undefined;
    let disposed = false;
    const cleanup = listen("save_progress", (event) => {
      if (!disposed) setSaveProgress(event.payload);
    });
    return () => {
      disposed = true;
      cleanup.then((dispose) => dispose());
    };
  }, []);

  const insertAssetAtCursor = useCallback((alias) => {
    const editor = editorRef.current;
    const insertion = `![alt](asset:${alias})`;
    if (!editor) {
      setMarkdown((value) => `${value}${value.endsWith("\n") ? "" : "\n"}${insertion}\n`);
      return;
    }
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${markdown.slice(0, start)}${insertion}${markdown.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      editor.focus();
      const position = start + insertion.length;
      editor.setSelectionRange(position, position);
    });
  }, [markdown]);

  const selectDiagnostic = useCallback((asset) => {
    const editor = editorRef.current;
    const line = asset?.referencedLines?.[0];
    if (!editor || !line) return;
    const lines = markdown.split("\n");
    const start = lines.slice(0, line - 1).reduce((total, value) => total + value.length + 1, 0);
    editor.focus();
    editor.setSelectionRange(start, start + lines[line - 1].length);
    editor.scrollTop = Math.max(0, (line - 1) * 24);
  }, [markdown]);

  const commitPackage = useCallback((result) => {
    const payload = normalizePackagePayload(result);
    setCurrentPackage(payload);
    setMarkdown(payload.rawContent);
    setEditorStatus("Ready");
    setPhase("editor");
    setBootError("");
  }, []);

  const loadWorkspace = useCallback(async (kind, selectedPath = null) => {
    if (!isTauriRuntime) {
      setBootError("Workspace loading requires the Tauri desktop runtime.");
      setPhase("error");
      return;
    }

    setPhase("loading");
    setBootError("");
    infoLog("[SEQ-MD-01][BOOT] begin workspace load", { kind, selectedPath });

    try {
      let path = selectedPath;
      if (kind === "archive" || kind === "folder") {
        path = await open({
          directory: kind === "folder",
          multiple: false,
          filters: kind === "archive" ? [{ name: "HASM Markdown", extensions: ["hasmmd"] }] : undefined,
        });
        if (!path || Array.isArray(path)) {
          debugLog("[SEQ-MD-01][BOOT] selection cancelled", { kind });
          setPhase("select");
          return;
        }
      }

      let result;
      if (kind === "archive") {
        try {
          infoLog("[SEQ-MD-01][IMPORT] invoke open_archive_workspace", { path });
          result = await invoke("open_archive_workspace", { archive_path: path });
        } catch (error) {
          if (!isUnknownCommandError(error)) throw error;
          warnLog("[SEQ-MD-01][IMPORT] using legacy archive command", error);
          const basePath = await appLocalDataDir();
          result = await invoke("open_hasmmd", { basePath, hasmmdPath: path });
        }
      } else if (kind === "folder") {
        infoLog("[SEQ-MD-01][IMPORT] invoke open_folder_workspace", { path });
        result = await invoke("open_folder_workspace", { folder_path: path });
      } else {
        try {
          infoLog("[SEQ-MD-01][IMPORT] invoke create_new_package");
          result = await invoke("create_new_package");
        } catch (error) {
          if (!isUnknownCommandError(error)) throw error;
          const basePath = await appLocalDataDir();
          result = await invoke("create_new_hasmmd", { basePath });
        }
      }

      commitPackage(result);
      infoLog("[SEQ-MD-01][STATE] workspace committed; routing editor");
    } catch (error) {
      errorLog("[SEQ-MD-01][BOOT][ERROR] workspace load failed", error);
      setBootError(String(error));
      setPhase("error");
    }
  }, [commitPackage]);

  useEffect(() => {
    let cancelled = false;
    const loadLaunchTarget = async () => {
      let launchTarget = getLaunchTarget();
      if (isTauriRuntime) {
        try {
          debugLog("[SEQ-MD-01][BOOT] reading native launch target");
          launchTarget = await invoke("get_launch_target");
        } catch (error) {
          warnLog("[SEQ-MD-01][BOOT][ERROR] failed to read launch target", error);
        }
      }
      if (!cancelled && launchTarget) {
        const kind = launchTarget.toLowerCase().endsWith(".hasmmd") ? "archive" : "folder";
        loadWorkspace(kind, launchTarget);
      }
    };

    loadLaunchTarget();
    return () => { cancelled = true; };
  }, [loadWorkspace]);

  useEffect(() => {
    if (window.location.pathname === "/editor" && phase !== "editor") {
      warnLog("[REQ-MD-01-040][GUARD] blocked unauthorized /editor navigation");
      window.history.replaceState({}, "", "/select");
    }
  }, [phase]);

  // Return App Component
  infoLog("Render App", { phase });
  return (
    <>
      <Container fluid className={`Main theme-${themePattern.id} p-0 d-flex flex-column`} style={themeVariables}>
        <Menu
          markdown={markdown}
          currentPackage={currentPackage}
          onPackageChange={setCurrentPackage}
          setMarkdown={setMarkdown}
          colorPattern={colorPattern}
          colorPatternOptions={COLOR_PATTERN_OPTIONS}
          onColorPatternChange={handleThemeChange}
          onWorkspaceOpen={loadWorkspace}
          editorStatus={editorStatus}
          onAssetsOpen={currentPackage ? () => setIsAssetWindowOpen(true) : undefined}
          onSave={() => savePackage()}
          onSaveAs={saveAsPackage}
          onExportFolder={exportFolder}
          saveDisabled={!currentPackage || isSavingPackage}
          onCloseWorkspace={requestClose}
          saveState={saveState}
          onDiagnosticSelect={selectDiagnostic}
          textScale={textScale}
          onTextScaleChange={handleTextScaleChange}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        {phase !== "editor" ? <BootScreen phase={phase} error={bootError} onOpen={loadWorkspace} /> : <HASM_Markdown_Editor
          markdown={markdown}
          setMarkdown={setMarkdown}
          onPackageChange={setCurrentPackage}
          onStatusChange={setEditorStatus}
          onAutosaveComplete={setLastAutosavedAt}
          onInsertAsset={insertAssetAtCursor}
          onEditorReady={(element) => { editorRef.current = element; }}
          currentPackage={currentPackage}
          viewMode={viewMode}
        />}
        {phase === "editor" && isAssetWindowOpen && (
          <AssetWindow
            currentPackage={currentPackage}
            markdown={markdown}
            onPackageChange={setCurrentPackage}
            onInsertAsset={insertAssetAtCursor}
            onClose={() => setIsAssetWindowOpen(false)}
          />
        )}
        {phase === "editor" && <SaveProgress progress={saveProgress} />}
        {phase === "editor" && isClosePromptOpen && (
          <CloseWorkspaceModal
            onSave={saveAndClose}
            onDiscard={() => finishClose(true)}
            onCancel={() => setIsClosePromptOpen(false)}
            busy={isSavingPackage}
          />
        )}
      </Container>
    </>
  );
}

// ###################################################
// App Initialization
// Description : App Initialization
// ###################################################
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
