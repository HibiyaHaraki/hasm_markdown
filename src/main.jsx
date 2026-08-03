// ###################################################
// File Name : main.jsx
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : main.jsx
// Description : 
// ###################################################

// React
import React, { useState } from "react";
import ReactDOM from "react-dom/client";

// JSXs
import Menu from "./Menu"; // Menu Component
import HASM_Markdown_Editor from "./HASM_Markdown_Editor"; // HASM Markdown Editor Component
import { DEFAULT_COLOR_PATTERN } from "./colorPatterns";

// CSS
import "./main.css";
import "./colorPatterns.css";

// Bootstrap
import { Container } from "react-bootstrap";

// Logger
import {traceLog, debugLog, infoLog, warnLog, errorLog} from "./logger"

// ###################################################
// Function : App
// Description : Definition of App Componentincluding all component
// ###################################################
function App() {

  // Define Markdown Status
  const [markdown, setMarkdown] = useState(
    "# HASM Markdown\n\nEdit this text to see the preview update in real-time."
  );

  // Define HASMMD Package Status
  const [currentPackage, setCurrentPackage] = useState(null);

  // Define Color Pattern Status
  const [colorPattern, setColorPattern] = useState(DEFAULT_COLOR_PATTERN);

  // Return App Component
  infoLog("Render App");
  return (
    <Container fluid className={`Main theme-${colorPattern} p-0 d-flex flex-column`}>
      <Menu
        markdown={markdown}
        currentPackage={currentPackage}
        onPackageChange={setCurrentPackage}
        setMarkdown={setMarkdown}
        colorPattern={colorPattern}
        onColorPatternChange={setColorPattern}
      />
      <HASM_Markdown_Editor
        markdown={markdown}
        setMarkdown={setMarkdown}
        onPackageChange={setCurrentPackage}
      />
    </Container>
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
