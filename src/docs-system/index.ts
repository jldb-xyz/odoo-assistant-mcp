import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DocEntry {
  name: string;
  source: "bundled" | "global" | "local";
  path: string;
}

export interface DocContent {
  name: string;
  source: "bundled" | "global" | "local";
  content: string;
}

export interface PathConfig {
  bundledDir?: string;
  globalDir?: string;
  localDir?: string;
}

/**
 * Get default paths for docs/SOPs
 */
function getDefaultPaths(type: "docs" | "sops"): Required<PathConfig> {
  return {
    bundledDir: path.join(__dirname, "..", "docs"),
    globalDir: path.join(os.homedir(), ".odoo-mcp", type),
    localDir: path.join(process.cwd(), ".odoo-mcp", type),
  };
}

/**
 * Get all doc/SOP directories in priority order (lowest to highest)
 */
function getDocPaths(
  type: "docs" | "sops",
  config?: PathConfig,
): { source: DocEntry["source"]; dir: string }[] {
  const paths: { source: DocEntry["source"]; dir: string }[] = [];
  const defaults = getDefaultPaths(type);
  const cfg = { ...defaults, ...config };

  // Bundled docs (only for docs, not SOPs)
  if (type === "docs") {
    paths.push({ source: "bundled", dir: cfg.bundledDir });
  }

  // Global (~/.odoo-mcp/docs or ~/.odoo-mcp/sops)
  paths.push({ source: "global", dir: cfg.globalDir });

  // Local (./.odoo-mcp/docs or ./.odoo-mcp/sops)
  paths.push({ source: "local", dir: cfg.localDir });

  return paths;
}

/**
 * List all available docs or SOPs, with higher priority sources overriding lower
 */
export function listEntries(
  type: "docs" | "sops",
  config?: PathConfig,
): DocEntry[] {
  const paths = getDocPaths(type, config);
  const entriesMap = new Map<string, DocEntry>();

  for (const { source, dir } of paths) {
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const name = file.replace(/\.md$/, "");
        // Later sources override earlier (local > global > bundled)
        entriesMap.set(name, {
          name,
          source,
          path: path.join(dir, file),
        });
      }
    } catch {
      // Directory not readable, skip
    }
  }

  return Array.from(entriesMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Read a specific doc or SOP by name
 */
export function readEntry(
  type: "docs" | "sops",
  name: string,
  config?: PathConfig,
): DocContent | null {
  const paths = getDocPaths(type, config);

  // Search in reverse order (local first, then global, then bundled)
  for (const { source, dir } of [...paths].reverse()) {
    const filePath = path.join(dir, `${name}.md`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        return { name, source, content };
      } catch {
        // File not readable, continue searching
      }
    }
  }

  return null;
}

/**
 * Save a doc or SOP to the local directory
 */
export function saveEntry(
  type: "docs" | "sops",
  name: string,
  content: string,
  config?: PathConfig,
): { success: boolean; path?: string; error?: string } {
  const defaults = getDefaultPaths(type);
  const localDir = config?.localDir ?? defaults.localDir;

  try {
    // Ensure directory exists
    fs.mkdirSync(localDir, { recursive: true });

    const filePath = path.join(localDir, `${name}.md`);
    fs.writeFileSync(filePath, content, "utf-8");

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a local doc or SOP
 */
export function deleteEntry(
  type: "docs" | "sops",
  name: string,
  config?: PathConfig,
): { success: boolean; error?: string } {
  const defaults = getDefaultPaths(type);
  const localDir = config?.localDir ?? defaults.localDir;
  const filePath = path.join(localDir, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: `${type.slice(0, -1)} "${name}" not found in local directory`,
    };
  }

  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
