import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, ListGroup, Offcanvas, OverlayTrigger, ProgressBar, Stack, Tooltip } from "react-bootstrap";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { debugLog, errorLog, infoLog } from "./hasm_logger/src/react/logger.js";

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

function sanitizeAlias(filename) {
  return String(filename ?? "asset").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";
}

function AssetWindow({ currentPackage, markdown, onPackageChange, onInsertAsset, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [alias, setAlias] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(null);

  const activeAssets = useMemo(
    () => Object.entries(currentPackage?.manifest?.assets ?? {}).filter(([, asset]) => !asset.isDeleted),
    [currentPackage?.manifest?.assets],
  );
  const missingAssets = currentPackage?.missingAssets ?? [];
  const warnings = currentPackage?.warnings ?? [];

  useEffect(() => {
    if (!isTauriRuntime) return undefined;
    let disposed = false;
    const subscriptions = [
      ["asset_register_progress", setProgress],
      ["asset_delete_progress", setProgress],
    ];
    const cleanups = subscriptions.map(([event, setter]) => listen(event, (message) => {
      if (!disposed) setter(message.payload);
    }));
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup.then((dispose) => dispose()));
    };
  }, []);

  const selectFile = (path) => {
    if (!path) return;
    setSelectedFile(path);
    setAlias(sanitizeAlias(path));
    setAliasError("");
  };

  const handlePicker = async () => {
    if (!isTauriRuntime) {
      setStatus("Asset selection requires the Tauri desktop runtime.");
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
      });
      if (selected && !Array.isArray(selected)) selectFile(selected);
    } catch (error) {
      errorLog("[SEQ-MD-03][UI][ERROR] asset picker failed", error);
      setStatus("Asset selection failed.");
    }
  };

  const registerAsset = async (event) => {
    event.preventDefault();
    const normalizedAlias = alias.trim();
    if (!selectedFile || !normalizedAlias) return;
    if (currentPackage?.manifest?.assets?.[normalizedAlias]) {
      setAliasError("Alias or reserved name already exists in workspace history.");
      return;
    }
    try {
      infoLog("[SEQ-MD-03][REGISTER] binding single external asset", { alias: normalizedAlias });
      const payload = await invoke("register_and_bind_single_asset_path", {
        sourcePath: selectedFile,
        customAlias: normalizedAlias,
      });
      onPackageChange?.(payload);
      onInsertAsset?.(normalizedAlias);
      setSelectedFile(null);
      setAlias("");
      setStatus(`Registered ${normalizedAlias}`);
    } catch (error) {
      errorLog("[SEQ-MD-03][REGISTER][ERROR] asset registration failed", error);
      setAliasError(String(error));
    }
  };

  const deleteAsset = async (assetAlias) => {
    const lines = markdown.split("\n")
      .map((line, index) => line.includes(`asset:${assetAlias}`) ? index + 1 : null)
      .filter(Boolean);
    const warning = lines.length > 0
      ? `Asset '${assetAlias}' is in use on line${lines.length === 1 ? "" : "s"} ${lines.join(", ")}. Delete it?`
      : `Delete asset '${assetAlias}'?`;
    if (!window.confirm(warning)) return;
    try {
      setProgress({ stage: "SettingDeleteFlag", percentage: 0 });
      const payload = await invoke("soft_delete_asset_mapping", { alias: assetAlias });
      onPackageChange?.(payload);
      setStatus(`Asset '${assetAlias}' marked as deleted`);
      debugLog("[SEQ-MD-03][DELETE] soft delete complete", { alias: assetAlias, lines });
    } catch (error) {
      errorLog("[SEQ-MD-03][DELETE][ERROR] asset deletion failed", error);
      setStatus(String(error));
    }
  };

  const closeWindow = () => {
    const missing = markdown.split("\n").flatMap((line, index) => {
      const matches = [...line.matchAll(/asset:([^\s)]+)/g)];
      return matches.flatMap(([, alias]) => {
        const asset = currentPackage?.manifest?.assets?.[alias];
        return (!asset || asset.isDeleted)
          ? [{ alias, expectedRelativePath: asset?.relativePath ?? "", referencedLines: [index + 1] }]
          : [];
      });
    });
    const grouped = Object.values(missing.reduce((result, item) => {
      const existing = result[item.alias] ?? { ...item, referencedLines: [] };
      existing.referencedLines.push(...item.referencedLines);
      result[item.alias] = existing;
      return result;
    }, {}));
    onPackageChange?.((previous) => ({ ...previous, missingAssets: grouped }));
    onClose?.();
  };

  return (
    <Offcanvas show placement="end" onHide={closeWindow} className="AssetWindow" aria-label="Asset management">
      <Offcanvas.Header closeButton className="AssetWindow_Header">
        <Offcanvas.Title>Assets</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack gap={3}>
          <Alert variant={missingAssets.length > 0 ? "danger" : "success"} className="AssetWindow_Alerts mb-0">
            <span>Missing: {missingAssets.length}</span>
            <span>Warnings: {warnings.length}</span>
          </Alert>
          <Button variant="primary" className="AssetWindow_AddButton" onClick={handlePicker}>Select image</Button>
      {selectedFile && (
        <Form className="AssetWindow_AliasForm" onSubmit={registerAsset}>
          <Form.Group controlId="asset-alias">
            <Form.Label>Alias</Form.Label>
            <Form.Control value={alias} onChange={(event) => { setAlias(event.target.value); setAliasError(""); }} autoFocus />
          </Form.Group>
          {aliasError && <Alert variant="danger" className="AssetWindow_Error mb-0" role="alert">{aliasError}</Alert>}
          <Button type="submit" variant="outline-primary" className="AssetWindow_RegisterButton">Register</Button>
        </Form>
      )}
      {progress && <ProgressBar now={progress.percentage} label={`${Math.round(progress.percentage)}%`} />}
      {status && <Alert variant="info" className="AssetWindow_Status mb-0" role="status">{status}</Alert>}
      <ListGroup as="ul" className="AssetWindow_List">
        {activeAssets.map(([assetAlias, asset]) => (
          <ListGroup.Item as="li" key={assetAlias} className="AssetWindow_AssetItem">
            <div className="AssetWindow_AssetRow">
              <OverlayTrigger placement="left" overlay={<Tooltip id={`asset-preview-path-${assetAlias}`}>{asset.resolvedPath || "Preview path unavailable"}</Tooltip>}>
                <Button variant="link" className="AssetWindow_AssetName" aria-label={`Preview path for ${assetAlias}`}>
                  <span>{assetAlias}</span>
                  <small>Preview path</small>
                </Button>
              </OverlayTrigger>
              <Button variant="outline-danger" className="AssetWindow_DeleteButton" onClick={() => deleteAsset(assetAlias)}>Delete</Button>
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}

export default AssetWindow;
