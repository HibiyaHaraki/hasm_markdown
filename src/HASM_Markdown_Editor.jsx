// ###################################################
// File Name : HASM_Markdown_Editor.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define Component of HASM Markdown Editor
// Description : Define Component of HASM Markdown Editor
// ###################################################

// React
import { useMemo, useRef, useEffect, useLayoutEffect, useState } from "react"; // React hooks for state and lifecycle management
import { Row, Col, OverlayTrigger, Tooltip } from "react-bootstrap"; // Bootstrap layout and form components
import "bootstrap/dist/css/bootstrap.min.css";

// CSS
import "./main.css";

// Tauri
import { invoke } from "@tauri-apps/api/core"; // Tauri command invocation

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
const autosaveIntervalMs = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("eval") === "md02"
  && new URLSearchParams(window.location.search).get("autosave") === "1"
  ? 100
  : 3000;

// Markdown parser and asset resolution
import { createAssetMarkdownIt, findMissingAssetLines } from "./assetResolverPlugin.js";

// Logger
import { traceLog, debugLog, infoLog, warnLog, errorLog } from "./hasm_logger/src/react/logger.js";

function highlightMarkdown(markdown) {
  const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return markdown.split("\n").map((line) => {
    const escaped = escapeHtml(line);
    if (/^#{1,6}\s/.test(line)) return `<span class="MarkdownSyntax_Heading">${escaped}</span>`;
    if (/^\s*[-*+]\s/.test(line)) return escaped.replace(/^(\s*[-*+]\s)/, '<span class="MarkdownSyntax_Marker">$1</span>');
    if (/^\s*>\s?/.test(line)) return `<span class="MarkdownSyntax_Quote">${escaped}</span>`;
    return escaped
      .replace(/(!?\[[^\]]*\]\([^)]*\))/g, '<span class="MarkdownSyntax_Link">$1</span>')
      .replace(/(`[^`]*`)/g, '<span class="MarkdownSyntax_Code">$1</span>')
      .replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span class="MarkdownSyntax_Strong">$1</span>')
      .replace(/(\*[^*]+\*|_[^_]+_)/g, '<span class="MarkdownSyntax_Emphasis">$1</span>');
  }).join("\n");
}

function getSelectionOffsets(element) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return null;
  const measure = (node, offset) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(node, offset);
    return range.toString().length;
  };
  return { start: measure(selection.anchorNode, selection.anchorOffset), end: measure(selection.focusNode, selection.focusOffset) };
}

function setSelectionOffsets(element, start, end) {
  const locate = (offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node = walker.nextNode();
    while (node) {
      if (remaining <= node.textContent.length) return { node, offset: remaining };
      remaining -= node.textContent.length;
      node = walker.nextNode();
    }
    return { node: element, offset: element.childNodes.length };
  };
  const range = document.createRange();
  const startPosition = locate(start);
  const endPosition = locate(end);
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function recalculateMissingAssets(markdown, manifest) {
  const missingByAlias = new Map();
  markdown.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/asset:([^\s)]+)/g)) {
      const alias = match[1];
      const asset = manifest?.assets?.[alias];
      if (!asset || asset.isDeleted) {
        const existing = missingByAlias.get(alias) ?? { alias, expectedRelativePath: asset?.relativePath ?? "", referencedLines: [] };
        existing.referencedLines.push(index + 1);
        missingByAlias.set(alias, existing);
      }
    }
  });
  return [...missingByAlias.values()];
}

// ###################################################
// Function : HASM_Markdown_Editor
// Description : Definition of HASM Markdown Editor Component
// ###################################################
function HASM_Markdown_Editor({ markdown, setMarkdown, onPackageChange, onStatusChange, onEditorReady, onAutosaveComplete, onInsertAsset, currentPackage, viewMode = "split", editorColorMode = "light" }) {

  // Define Refs for component state management
  // * lineNumbersRef: Reference to the line numbers display container
  // * initializedRef: Track whether component has been initialized
  // * saveTimerRef: Reference to auto-save timer interval
  // * lastSavedMarkdownRef: Track last saved markdown to prevent unnecessary saves
  const lineNumbersRef = useRef(null);
  const editorElementRef = useRef(null);
  const lastUserInputRef = useRef(markdown);
  const saveTimerRef = useRef(null);
  const lastSavedMarkdownRef = useRef(currentPackage?.lastSavedContent ?? markdown);
  const markdownRef = useRef(markdown);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssetShelfOpen, setIsAssetShelfOpen] = useState(true);
  const [assetSources, setAssetSources] = useState({});
  const [editorHtml, setEditorHtml] = useState(() => highlightMarkdown(markdown));

  const manifest = currentPackage?.manifest ?? { assets: {} };
  const missingAssets = currentPackage?.missingAssets ?? [];
  const isDirty = markdown !== (currentPackage?.lastSavedContent ?? lastSavedMarkdownRef.current);
  const missingLines = useMemo(
    () => findMissingAssetLines(markdown, manifest, missingAssets),
    [markdown, manifest, missingAssets],
  );
  const errorLines = useMemo(() => {
    const lines = new Set();
    for (const asset of missingAssets) {
      if (!manifest.assets?.[asset.alias]?.isDeleted) asset.referencedLines?.forEach((line) => lines.add(line));
    }
    return lines;
  }, [manifest.assets, missingAssets]);
  const assets = useMemo(
    () => Object.entries(manifest.assets ?? {}).filter(([, asset]) => !asset.isDeleted),
    [manifest.assets],
  );
  const assetUsage = useMemo(() => {
    const usage = new Map();
    for (const match of markdown.matchAll(/asset:([^\s)]+)/g)) {
      usage.set(match[1], (usage.get(match[1]) ?? 0) + 1);
    }
    return usage;
  }, [markdown]);

  useEffect(() => {
    if (!isTauriRuntime || assets.length === 0) {
      setAssetSources((current) => Object.keys(current).length === 0 ? current : {});
      return undefined;
    }

    let cancelled = false;
    const objectUrls = [];
    Promise.all(assets.map(async ([alias]) => {
      try {
        const payload = await invoke("read_asset_data", { alias });
        const bytes = new Uint8Array(payload.bytes ?? []);
        const url = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType || "application/octet-stream" }));
        objectUrls.push(url);
        return [alias, url];
      } catch (error) {
        warnLog("[SEQ-MD-03][PREVIEW][ERROR] asset data load failed", { alias, error: String(error) });
        return null;
      }
    })).then((entries) => {
      if (!cancelled) setAssetSources(Object.fromEntries(entries.filter(Boolean)));
    });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);

  useEffect(() => {
    markdownRef.current = markdown;
    if (markdown !== lastUserInputRef.current) {
      setEditorHtml(highlightMarkdown(markdown));
      lastUserInputRef.current = markdown;
    }
    if (currentPackage?.lastSavedContent !== undefined) {
      lastSavedMarkdownRef.current = currentPackage.lastSavedContent;
    }
  }, [markdown, currentPackage?.lastSavedContent]);

  useLayoutEffect(() => {
    const editor = editorElementRef.current;
    if (editor && editor.innerHTML !== editorHtml) {
      editor.innerHTML = editorHtml;
    }
  }, [editorHtml]);

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
        onPackageChange?.((previous) => ({
          ...previous,
          rawContent: content,
          lastSavedContent: content,
          isDirty: false,
          // Autosave responses can be partial; retain the mounted manifest and visual state.
          missingAssets: recalculateMissingAssets(content, previous?.manifest ?? currentPackage?.manifest),
          warnings: pkg?.warnings ?? previous?.warnings ?? [],
        }));
        lastSavedMarkdownRef.current = content;
        const savedAt = new Date();
        onAutosaveComplete?.(savedAt.toISOString());
        onStatusChange?.(`Autosaved locally at ${savedAt.toLocaleTimeString()}`);
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
    }, autosaveIntervalMs);

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
    assetSources,
    uuid: currentPackage?.uuid,
    targetType: currentPackage?.targetType,
  }), [assetSources, currentPackage?.targetType, currentPackage?.uuid, manifest, missingAssets]);

  // Convert markdown text to HTML for preview rendering
  const html = useMemo(() => md.render(markdown), [markdown, md]);
  // Render HASM Markdown Editor with editor and preview panels
  infoLog("Render HASM Markdown Editor");
  return (
    <Row 
      data-dirty={isDirty}
      className={`HASM_Markdown_Editor HASM_Markdown_Editor_${viewMode} EditorColor_${editorColorMode} flex-grow-1 g-0 overflow-hidden`}
    >
      {/* Left Panel: Markdown Editor */}
      <Col 
        md={6} 
        className="HASM_Markdown_Editor_EditorCol d-flex flex-column border-end" 
      >
        <div 
          className="HASM_Markdown_Editor_EditorCol_Title"
        >
          <span>EDITOR</span>
          <button
            type="button"
            className="EditorAssetShelf_Count"
            onClick={() => setIsAssetShelfOpen((open) => !open)}
            aria-expanded={isAssetShelfOpen}
            aria-controls="editor-asset-shelf"
          >
            {assets.length} {assets.length === 1 ? "asset" : "assets"} {isAssetShelfOpen ? "- hide" : "+ show"}
          </button>
        </div>
        {assets.length > 0 && isAssetShelfOpen && (
          <div id="editor-asset-shelf" className="EditorAssetShelf" aria-label="Workspace assets">
            <div className="EditorAssetShelf_Header">
              <span>INSERT ASSET</span>
              <small>Select an asset to place its Markdown reference</small>
            </div>
            <div className="EditorAssetShelf_List">
              {assets.map(([alias, asset]) => (
                <OverlayTrigger key={alias} placement="top" overlay={<Tooltip id={`editor-asset-preview-path-${alias}`}>{asset.resolvedPath || "Preview path unavailable"}</Tooltip>}>
                  <button
                    type="button"
                    className="EditorAssetShelf_Item"
                    onClick={() => onInsertAsset?.(alias)}
                    aria-label={`Insert ${alias}; preview path available on hover`}
                  >
                    {assetSources[alias] ? <img src={assetSources[alias]} alt="" aria-hidden="true" /> : <span className="EditorAssetShelf_Placeholder" aria-hidden="true">◇</span>}
                    <span className="EditorAssetShelf_Details">
                      <strong>{alias}</strong>
                      <small>{assetUsage.get(alias) ?? 0} {assetUsage.get(alias) === 1 ? "reference" : "references"}</small>
                    </span>
                  </button>
                </OverlayTrigger>
              ))}
            </div>
          </div>
        )}
        <div 
          className="HASM_Markdown_Editor_EditorCol_Editor d-flex flex-grow-1 overflow-hidden" 
        >
          <div
            ref={lineNumbersRef}
            className="HASM_Markdown_Editor_EditorCol_Editor_LineNum"
          >
            {lineNumbers.split("\n").map((lineNumber) => (
              <span key={lineNumber} className={errorLines.has(Number(lineNumber)) ? "editor-error-line" : missingLines.has(Number(lineNumber)) ? "editor-warning-line" : ""}>
                {lineNumber}
              </span>
            ))}
          </div>
          <div className="MarkdownSyntax_EditorSurface flex-grow-1">
            <div
              ref={(element) => {
                editorElementRef.current = element;
                onEditorReady?.(element);
              }}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Markdown editor"
              onScroll={handleScroll}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  event.stopPropagation();
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  document.execCommand("insertLineBreak");
                  const nextMarkdown = event.currentTarget.innerText.replace(/\r/g, "");
                  markdownRef.current = nextMarkdown;
                  lastUserInputRef.current = nextMarkdown;
                  setMarkdown(nextMarkdown);
                  onStatusChange?.("Unsaved changes *");
                }
              }}
              className="MarkdownSyntax_Input"
              onInput={(event) => {
                const nextMarkdown = event.currentTarget.innerText.replace(/\r/g, "");
                markdownRef.current = nextMarkdown;
                lastUserInputRef.current = nextMarkdown;
                setMarkdown(nextMarkdown);
                onStatusChange?.(nextMarkdown === (currentPackage?.lastSavedContent ?? "") ? "Ready" : "Unsaved changes *");
              }}
              onBlur={(event) => setEditorHtml(highlightMarkdown(event.currentTarget.innerText.replace(/\r/g, "")))}
            />
          </div>
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
          role="status"
          aria-live="polite"
          className="HASM_Markdown_Editor_ViewerCol_Viewer p-4 overflow-auto flex-grow-1 text-start"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Col>
    </Row>
  );
}

export default HASM_Markdown_Editor;
