import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

/**
 * Get all doc/SOP directories in priority order (lowest to highest)
 */
function getDocPaths(type: "docs" | "sops"): { source: DocEntry["source"]; dir: string }[] {
  const paths: { source: DocEntry["source"]; dir: string }[] = [];

  // Bundled docs (only for docs, not SOPs)
  if (type === "docs") {
    const bundledPath = path.join(__dirname, "..", "docs");
    paths.push({ source: "bundled", dir: bundledPath });
  }

  // Global (~/.odoo-mcp/docs or ~/.odoo-mcp/sops)
  const globalPath = path.join(os.homedir(), ".odoo-mcp", type);
  paths.push({ source: "global", dir: globalPath });

  // Local (./.odoo-mcp/docs or ./.odoo-mcp/sops)
  const localPath = path.join(process.cwd(), ".odoo-mcp", type);
  paths.push({ source: "local", dir: localPath });

  return paths;
}

/**
 * List all available docs or SOPs, with higher priority sources overriding lower
 */
export function listEntries(type: "docs" | "sops"): DocEntry[] {
  const paths = getDocPaths(type);
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

  return Array.from(entriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read a specific doc or SOP by name
 */
export function readEntry(type: "docs" | "sops", name: string): DocContent | null {
  const paths = getDocPaths(type);

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
  content: string
): { success: boolean; path?: string; error?: string } {
  const localDir = path.join(process.cwd(), ".odoo-mcp", type);

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
  name: string
): { success: boolean; error?: string } {
  const localDir = path.join(process.cwd(), ".odoo-mcp", type);
  const filePath = path.join(localDir, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `${type.slice(0, -1)} "${name}" not found in local directory` };
  }

  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
