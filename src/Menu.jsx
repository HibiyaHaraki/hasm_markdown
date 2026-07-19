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

// Tauri
import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

// ###################################################
// Function : Menu
// Description : Definition of Global Menu Component
// ###################################################
function Menu({ markdown, currentPackage, onPackageChange, setMarkdown }) {

  // Tauri : Open Exist Package
  const handleOpen = async () => {
    try {
      // Step 1. Get App Local Path
      const basePath = await appLocalDataDir();

      // Step 2. Select single hasmmd file from file dialog
      const selected = await open({
        multiple: false,
        filters: [{ name: 'HASM Markdown', extensions: ['hasmmd'] }]
      });

      if (selected) {
        // Step 3. Check selected file has correct extension (.hasmmd)
        const hasmmdPath = selected.toLowerCase().endsWith(".hasmmd")
          ? selected
          : `${selected}.hasmmd`;

        // Step 4. Call Rust Function (open_hasmmd) and get local package info and markdown
        const [pkg, content] = await invoke("open_hasmmd", { basePath, hasmmdPath });

        // Step 5. Update Local Package info and Markdown content
        onPackageChange?.(pkg);
        setMarkdown?.(content);
      }
    } catch (err) {
      console.error("Failed to open package:", err);
    }
  };

  // Tauri : Save Edit Page as New File
  const handleSaveAs = async () => {
    try {
      // Step 1. Select single hasmmd file from file dialog
      const selected = await save({
        filters: [{ name: "HASM Markdown", extensions: ["hasmmd"] }],
        defaultPath: currentPackage?.hasmmd_local_path || undefined,
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
      console.error("Failed to save as:", err);
    }
  };

  // Return Menu Component
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
      </Nav>      
    </Navbar>
  );
}

export default Menu;
