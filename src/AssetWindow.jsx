import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { debugLog, errorLog, infoLog } from "./hasm_logger/src/react/logger.js";

const isTauriRuntime = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

function sanitizeAlias(filename) {
  return String(filename ?? "asset").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";
}

function getDroppedPath(file) {
  return file?.path ?? file?.name ?? "";
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

  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 1) setStatus("Single file upload supported. Processing first item.");
    selectFile(getDroppedPath(files[0]));
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
    <aside className="AssetWindow" aria-label="Asset management">
      <div className="AssetWindow_Header">
        <h2>Assets</h2>
        <button type="button" onClick={closeWindow} aria-label="Close assets">Close</button>
      </div>
      <div className="AssetWindow_Alerts">
        <span>Missing: {missingAssets.length}</span>
        <span>Warnings: {warnings.length}</span>
      </div>
      <div
        className="AssetWindow_Dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        Drop one image here
      </div>
      <button type="button" onClick={handlePicker}>Add Asset</button>
      {selectedFile && (
        <form className="AssetWindow_AliasForm" onSubmit={registerAsset}>
          <label>
            Alias
            <input value={alias} onChange={(event) => { setAlias(event.target.value); setAliasError(""); }} autoFocus />
          </label>
          {aliasError && <div className="AssetWindow_Error" role="alert">{aliasError}</div>}
          <button type="submit">Register</button>
        </form>
      )}
      {progress && <progress max="100" value={progress.percentage}>{progress.percentage}%</progress>}
      {status && <div className="AssetWindow_Status" role="status">{status}</div>}
      <ul className="AssetWindow_List">
        {activeAssets.map(([assetAlias, asset]) => (
          <li key={assetAlias}>
            <span>{assetAlias}</span>
            <button type="button" onClick={() => deleteAsset(assetAlias)}>Delete</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default AssetWindow;
