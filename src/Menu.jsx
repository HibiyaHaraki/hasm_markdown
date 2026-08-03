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
import { COLOR_PATTERNS, isValidColorPattern } from "./colorPatterns";

// Tauri
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, documentDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

// Logger
import {traceLog, debugLog, infoLog, warnLog, errorLog} from "./logger"

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
}) {

  // Tauri : Open Exist Package
  const handleOpen = async () => {
    if (!isTauriRuntime) {
      warnLog("Tauri runtime is not available; skipping package open.");
      return;
    }

    try {
      // Step 1. Get App Local Path
      const basePath = await appLocalDataDir();
      const archiveDefaultPath = await resolveArchiveDefaultPath(currentPackage);

      // Step 2. Select single hasmmd file from file dialog
      const selected = await open({
        multiple: false,
        filters: [{ name: 'HASM Markdown', extensions: ['hasmmd'] }],
        defaultPath: archiveDefaultPath,
      });

      if (selected) {
        // Step 3. Check selected file has correct extension (.hasmmd)
        const hasmmdPath = selected.toLowerCase().endsWith(".hasmmd")
          ? selected
          : `${selected}.hasmmd`;

        // Step 4. Call Rust Function (open_hasmmd) and get local package info and markdown
        if (!isTauriRuntime) {
          return;
        }
        const [pkg, content] = await invoke("open_hasmmd", { basePath, hasmmdPath });

        // Step 5. Update Local Package info and Markdown content
        onPackageChange?.(pkg);
        setMarkdown?.(content);
      }
    } catch (err) {
      errorLog("Failed to open package:", err);
    }
  };

  // Tauri : Save Edit Page as New File
  const handleSaveAs = async () => {
    if (!isTauriRuntime) {
      warnLog("Tauri runtime is not available; skipping save as.");
      return;
    }

    try {
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
      <Nav className="me-auto">
        <NavDropdown title="File" id="basic-nav-dropdown">
          <NavDropdown.Item onClick={handleOpen}>Open</NavDropdown.Item>
          <NavDropdown.Divider />
          <NavDropdown.Item onClick={handleSaveAs}>Save As</NavDropdown.Item>
        </NavDropdown>
        <NavDropdown title="Theme" id="theme-nav-dropdown">
          {COLOR_PATTERNS.map((pattern) => (
            <NavDropdown.Item
              key={pattern.id}
              active={colorPattern === pattern.id}
              onClick={() => {
                if (isValidColorPattern(pattern.id)) {
                  onColorPatternChange?.(pattern.id);
                }
              }}
            >
              {pattern.label}
            </NavDropdown.Item>
          ))}
        </NavDropdown>
      </Nav>      
    </Navbar>
  );
}

export default Menu;
