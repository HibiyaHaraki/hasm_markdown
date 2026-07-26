// ###################################################
// File Name : HASM_Markdown_Editor.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define Component of HASM Markdown Editor
// Description : Define Component of HASM Markdown Editor
// ###################################################

// React
import { useMemo, useRef, useEffect } from "react"; // React hooks for state and lifecycle management
import { Row, Col, Form } from "react-bootstrap"; // Bootstrap layout and form components
import "bootstrap/dist/css/bootstrap.min.css";

// CSS
import "./main.css";

// Tauri
import { invoke } from "@tauri-apps/api/core"; // Tauri command invocation
import { appLocalDataDir } from "@tauri-apps/api/path"; // Get application local data directory

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// Markdown Parser
import MarkdownIt from "markdown-it"; // Markdown to HTML parser

// Logger
import {traceLog, debugLog, infoLog, warnLog, errorLog} from "./logger"

// ###################################################
// Function : HASM_Markdown_Editor
// Description : Definition of HASM Markdown Editor Component
// ###################################################
function HASM_Markdown_Editor({ markdown, setMarkdown, onPackageChange }) {

  // Define Refs for component state management
  // * lineNumbersRef: Reference to the line numbers display container
  // * initializedRef: Track whether component has been initialized
  // * saveTimerRef: Reference to auto-save timer interval
  // * lastSavedMarkdownRef: Track last saved markdown to prevent unnecessary saves
  const lineNumbersRef = useRef(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedMarkdownRef = useRef(markdown);

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

  // Initialize new document if no file is specified
  useEffect(() => {
    if (!isTauriRuntime) {
      warnLog("Tauri runtime is not available; skipping package open.");
      return;
    }
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    const initializeNewDocument = async () => {
      try {
        const basePath = await appLocalDataDir();
        const pkg = await invoke("create_new_hasmmd", { basePath });
        onPackageChange?.(pkg);
        setMarkdown("# New HASM Markdown\n\nStart editing here.");
      } catch (err) {
        console.error("Failed to initialize new document:", err);
      }
    };

    initializeNewDocument();
  }, []);

  // Auto-save markdown content at regular intervals (every 10 seconds)
  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    const saveCurrentMarkdown = async () => {
      if (lastSavedMarkdownRef.current === markdown || !isTauriRuntime) {
        return;
      }

      try {
        const pkg = await invoke("save_local_package", { markdown });
        onPackageChange?.(pkg);
        lastSavedMarkdownRef.current = markdown;
      } catch (err) {
        errorLog("Failed to auto-save markdown:", err);
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
  }, [markdown]);

  // Create markdown parser instance (memoized to avoid recreation)
  const md = useMemo(() => new MarkdownIt(), []);

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
            {lineNumbers}
          </div>
          <Form.Control
            as="textarea"
            onScroll={handleScroll}
            className="HASM_Markdown_Editor_EditorCol_Editor_Form flex-grow-1 border-0 rounded-0 shadow-none"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
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
