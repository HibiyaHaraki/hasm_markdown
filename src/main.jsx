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
import {
  DEFAULT_COLOR_PATTERN,
  buildThemeClassCss,
} from "./hasm_color_pattern/src/index.js";

// CSS
import "./main.css";

// Bootstrap
import { Container } from "react-bootstrap";
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

// Logger
import { traceLog, debugLog, infoLog, warnLog, errorLog } from "./hasm_logger/src/react/logger.js";

const GENERATED_THEME_CSS = buildThemeClassCss(".Main");
const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
const EMPTY_MARKDOWN = "# HASM Markdown\n\nCreate or open a workspace to begin.";

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

// ###################################################
// Function : App
// Description : Definition of App Componentincluding all component
// ###################################################
function App() {

  // Define Markdown Status
  const [markdown, setMarkdown] = useState(EMPTY_MARKDOWN);

  // Define HASMMD Package Status
  const [currentPackage, setCurrentPackage] = useState(null);

  // Define Color Pattern Status
  const [colorPattern, setColorPattern] = useState(DEFAULT_COLOR_PATTERN);
  const [phase, setPhase] = useState(
    isTauriRuntime || window.location.pathname === "/editor" ? "select" : "editor",
  );
  const [bootError, setBootError] = useState("");

  const commitPackage = useCallback((result) => {
    const payload = normalizePackagePayload(result);
    setCurrentPackage(payload);
    setMarkdown(payload.rawContent);
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
        />
        <HASM_Markdown_Editor
          markdown={markdown}
          setMarkdown={setMarkdown}
          onPackageChange={setCurrentPackage}
          currentPackage={currentPackage}
        />
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
