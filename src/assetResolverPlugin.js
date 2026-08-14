import MarkdownIt from "markdown-it";

const ASSET_TAG_PATTERN = /!\[[^\]]*\]\(asset:([^\s)]+)(?:\s+[^)]*)?\)/g;

function assetIsMissing(alias, manifest, missingAssets) {
  const metadata = manifest?.assets?.[alias];
  return !metadata || metadata.isDeleted === true || missingAssets.some((asset) => asset.alias === alias);
}

export function findMissingAssetLines(markdown, manifest, missingAssets) {
  const lines = new Set();
  const lineStarts = [0];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "\n") lineStarts.push(index + 1);
  }

  for (const match of markdown.matchAll(ASSET_TAG_PATTERN)) {
    if (!assetIsMissing(match[1], manifest, missingAssets)) continue;
    const line = lineStarts.findLastIndex((start) => start <= match.index) + 1;
    lines.add(line);
  }
  return lines;
}

export function assetResolverPlugin(md, { manifest = { assets: {} }, missingAssets = [], assetSources = {}, uuid = "", targetType = "Unbound" } = {}) {
  const defaultImage = md.renderer.rules.image ?? ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const source = token.attrGet("src") ?? "";
    const assetMatch = source.match(/^asset:(.+)$/);
    if (!assetMatch) return defaultImage(tokens, index, options, env, self);

    const alias = assetMatch[1];
    const metadata = manifest?.assets?.[alias];
    if (assetIsMissing(alias, manifest, missingAssets)) {
      const tag = `![${token.content ?? ""}](asset:${alias})`;
      return `<span class="missing-asset-warning">${md.utils.escapeHtml(tag)} - Missing File</span>`;
    }

    const resolvedPath = metadata.resolvedPath ?? "";
    const src = assetSources[alias] ?? (targetType === "Archive" && resolvedPath.startsWith("asset-stream://")
      ? resolvedPath
      : `asset://${resolvedPath}`);
    token.attrSet("src", src);
    return defaultImage(tokens, index, options, env, self);
  };
}

export function createAssetMarkdownIt(options) {
  const md = new MarkdownIt({ html: false, linkify: true });
  assetResolverPlugin(md, options);
  return md;
}
