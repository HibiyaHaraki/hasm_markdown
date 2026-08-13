// ###################################################
// File Name : HASM_Markdown_Editor.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define Component of HASM Markdown Editor
// Description : Define Component of HASM Markdown Editor
// ###################################################

// React
import { useMemo, useRef, useEffect, useState } from "react"; // React hooks for state and lifecycle management
import { Row, Col, Form } from "react-bootstrap"; // Bootstrap layout and form components
import "bootstrap/dist/css/bootstrap.min.css";

// CSS
import "./main.css";

// Tauri
import { invoke } from "@tauri-apps/api/core"; // Tauri command invocation

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// Markdown parser and asset resolution
import { createAssetMarkdownIt, findMissingAssetLines } from "./assetResolverPlugin.js";

// Logger
import { traceLog, debugLog, infoLog, warnLog, errorLog } from "./hasm_logger/src/react/logger.js";

// ###################################################
// Function : HASM_Markdown_Editor
// Description : Definition of HASM Markdown Editor Component
// ###################################################
function HASM_Markdown_Editor({ markdown, setMarkdown, onPackageChange, onStatusChange, currentPackage }) {

  // Define Refs for component state management
  // * lineNumbersRef: Reference to the line numbers display container
  // * initializedRef: Track whether component has been initialized
  // * saveTimerRef: Reference to auto-save timer interval
  // * lastSavedMarkdownRef: Track last saved markdown to prevent unnecessary saves
  const lineNumbersRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastSavedMarkdownRef = useRef(currentPackage?.lastSavedContent ?? markdown);
  const markdownRef = useRef(markdown);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const manifest = currentPackage?.manifest ?? { assets: {} };
  const missingAssets = currentPackage?.missingAssets ?? [];
  const isDirty = markdown !== (currentPackage?.lastSavedContent ?? lastSavedMarkdownRef.current);
  const missingLines = useMemo(
    () => findMissingAssetLines(markdown, manifest, missingAssets),
    [markdown, manifest, missingAssets],
  );

  useEffect(() => {
    markdownRef.current = markdown;
    if (currentPackage?.lastSavedContent !== undefined) {
      lastSavedMarkdownRef.current = currentPackage.lastSavedContent;
    }
  }, [markdown, currentPackage?.lastSavedContent]);

  useEffect(() => {
    onPackageChange?.((previous) => ({
      ...previous,
      rawContent: markdown,
      isDirty,
    }));
  }, [isDirty, markdown, onPackageChange]);

  // Synchronize line numbers scroll with editor scroll
  const handleScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };
  // Generate line numbers based on current markdown content
  const lineNumbers = useMemo(() => {
    const lines = markdown.split("\n").length;
    return Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  }, [markdown]);

  // Auto-save markdown content at regular intervals (every 10 seconds)
  useEffect(() => {
    const saveCurrentMarkdown = async () => {
      const content = markdownRef.current;
      if (lastSavedMarkdownRef.current === content || isSavingRef.current || !isTauriRuntime || !currentPackage?.uuid) {
        return;
      }

      isSavingRef.current = true;
      setIsSaving(true);
      onStatusChange?.("Saving locally...");
      try {
        debugLog("[SEQ-MD-02][AUTOSAVE] invoke save_local_markdown_buffer", { uuid: currentPackage.uuid });
        const pkg = await invoke("save_local_markdown_buffer", {
          uuid: currentPackage.uuid,
          content,
        });
        onPackageChange?.(pkg);
        lastSavedMarkdownRef.current = content;
        onStatusChange?.(`Autosaved locally at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        errorLog("[SEQ-MD-02][AUTOSAVE][ERROR] local markdown save failed", err);
        onStatusChange?.("Local autosave failed: Disk write error");
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    };

    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
    }

    saveTimerRef.current = setInterval(() => {
      saveCurrentMarkdown();
    }, 10000);

    return () => {
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [currentPackage?.uuid, onPackageChange, onStatusChange]);

  const md = useMemo(() => createAssetMarkdownIt({
    manifest,
    missingAssets,
    uuid: currentPackage?.uuid,
    targetType: currentPackage?.targetType,
  }), [currentPackage?.targetType, currentPackage?.uuid, manifest, missingAssets]);

  // Convert markdown text to HTML for preview rendering
  const html = useMemo(() => md.render(markdown), [markdown, md]);

  // Render HASM Markdown Editor with editor and preview panels
  infoLog("Render HASM Markdown Editor");
  return (
    <Row 
      className="HASM_Markdown_Editor flex-grow-1 g-0 overflow-hidden"
    >
      {/* Left Panel: Markdown Editor */}
      <Col 
        md={6} 
        className="HASM_Markdown_Editor_EditorCol d-flex flex-column border-end" 
      >
        <div 
          className="HASM_Markdown_Editor_EditorCol_Title"
        >
          EDITOR
        </div>
        <div 
          className="HASM_Markdown_Editor_EditorCol_Editor d-flex flex-grow-1 overflow-hidden" 
        >
          <div
            ref={lineNumbersRef}
            className="HASM_Markdown_Editor_EditorCol_Editor_LineNum"
          >
            {lineNumbers.split("\n").map((lineNumber) => (
              <span key={lineNumber} className={missingLines.has(Number(lineNumber)) ? "editor-warning-line" : ""}>
                {lineNumber}
                {"\n"}
              </span>
            ))}
          </div>
          <Form.Control
            as="textarea"
            onScroll={handleScroll}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            className="HASM_Markdown_Editor_EditorCol_Editor_Form flex-grow-1 border-0 rounded-0 shadow-none"
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value);
              onStatusChange?.("Unsaved changes *");
            }}
            placeholder="Type your markdown here..."
          />
        </div>
      </Col>

      {/* Right Panel: Markdown Preview */}
      <Col 
        md={6} 
        className="HASM_Markdown_Editor_ViewerCol d-flex flex-column h-100"
      >
        <div 
          className="HASM_Markdown_Editor_ViewerCol_Title"
        >
          PREVIEW
        </div>
        <div 
          className="HASM_Markdown_Editor_ViewerCol_Viewer p-4 overflow-auto flex-grow-1 text-start bg-white text-dark"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Col>
    </Row>
  );
}

export default HASM_Markdown_Editor;
