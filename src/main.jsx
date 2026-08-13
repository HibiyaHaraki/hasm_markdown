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
  DEFAULT_COLOR_PATTERN,
  buildThemeClassCss,
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

const GENERATED_THEME_CSS = buildThemeClassCss(".Main");
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
  missingAssets: [{ alias: "unknown", expectedRelativePath: "assets/unknown.png" }],
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
const evaluationMode = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).get("eval")
  : null;
const isEditorEvaluation = evaluationMode === "md02";
const isAssetEvaluation = evaluationMode === "md03";
const isSaveEvaluation = evaluationMode === "md04";

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

// ###################################################
// Function : App
// Description : Definition of App Componentincluding all component
// ###################################################
function App() {

  // Define Markdown Status
  const initialFixture = isEditorEvaluation ? EVALUATION_FIXTURE : isAssetEvaluation ? ASSET_EVALUATION_FIXTURE : isSaveEvaluation ? SAVE_EVALUATION_FIXTURE : null;
  const [markdown, setMarkdown] = useState(initialFixture?.lastSavedContent ?? EMPTY_MARKDOWN);

  // Define HASMMD Package Status
  const [currentPackage, setCurrentPackage] = useState(initialFixture);

  // Define Color Pattern Status
  const [colorPattern, setColorPattern] = useState(DEFAULT_COLOR_PATTERN);
  const [editorStatus, setEditorStatus] = useState("Ready");
  const [saveProgress, setSaveProgress] = useState(null);
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [isAssetWindowOpen, setIsAssetWindowOpen] = useState(false);
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
      setEditorStatus("Workspace saved successfully");
    } catch (error) {
      errorLog("[SEQ-MD-04][SAVE][ERROR] package save failed", error);
      setEditorStatus(`Save failed: ${String(error)}`);
    } finally {
      setSaveProgress(null);
      setIsSavingPackage(false);
    }
  }, [currentPackage, isSavingPackage, markdown]);

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
  if (phase !== "editor") {
    return <BootScreen phase={phase} error={bootError} onOpen={loadWorkspace} />;
  }
  return (
    <>
      <style>{GENERATED_THEME_CSS}</style>
      <Container fluid className={`Main theme-${colorPattern} p-0 d-flex flex-column`}>
        <Menu
          markdown={markdown}
          currentPackage={currentPackage}
          onPackageChange={setCurrentPackage}
          setMarkdown={setMarkdown}
          colorPattern={colorPattern}
          onColorPatternChange={setColorPattern}
          onWorkspaceOpen={loadWorkspace}
          editorStatus={editorStatus}
          onAssetsOpen={() => setIsAssetWindowOpen(true)}
          onSave={() => savePackage()}
          onSaveAs={saveAsPackage}
          onExportFolder={exportFolder}
          saveDisabled={isSavingPackage}
        />
        <HASM_Markdown_Editor
          markdown={markdown}
          setMarkdown={setMarkdown}
          onPackageChange={setCurrentPackage}
          onStatusChange={setEditorStatus}
          onEditorReady={(element) => { editorRef.current = element; }}
          currentPackage={currentPackage}
        />
        {isAssetWindowOpen && (
          <AssetWindow
            currentPackage={currentPackage}
            markdown={markdown}
            onPackageChange={setCurrentPackage}
            onInsertAsset={insertAssetAtCursor}
            onClose={() => setIsAssetWindowOpen(false)}
          />
        )}
        <SaveProgress progress={saveProgress} />
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
