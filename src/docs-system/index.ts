import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory this module was loaded from, used to locate the bundled docs.
 *
 * Resolved lazily and defensively: on runtimes without a module-relative
 * filesystem (Cloudflare Workers) `import.meta.url` is not a file URL and this
 * throws. At module scope that took down the entire server on import, even for
 * callers that never touch a doc.
 */
function moduleDir(): string | null {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return null;
  }
}

/** A directory that may not be resolvable on every runtime. */
function safeDir(resolve: () => string): string | null {
  try {
    return resolve();
  } catch {
    return null;
  }
}

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
 * Get default paths for docs/SOPs.
 *
 * A directory that cannot be resolved on this runtime becomes an empty string,
 * which `getDocPaths` filters out — that layer is simply unavailable rather
 * than fatal.
 */
function getDefaultPaths(type: "docs" | "sops"): Required<PathConfig> {
  const dir = moduleDir();
  return {
    bundledDir: dir ? path.join(dir, "..", "docs") : "",
    globalDir: safeDir(() => path.join(os.homedir(), ".odoo-mcp", type)) ?? "",
    localDir: safeDir(() => path.join(process.cwd(), ".odoo-mcp", type)) ?? "",
  };
}

/**
 * Docs and SOPs form a flat namespace, and `name` arrives straight from tool
 * input — which the model controls. Anything that could address a file outside
 * the target directory is rejected outright rather than sanitised, so there is
 * no rewriting step to outsmart.
 */
function isValidEntryName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  // No separators, no traversal, no absolute paths, no NUL truncation.
  if (/[/\\]/.test(name)) return false;
  if (name.includes("\0")) return false;
  // A Windows drive-relative name ("D:notes") carries no separator but
  // resolves against that drive's working directory, landing outside the
  // target directory. Rejected on every platform so the rule is testable
  // wherever the suite runs, not just on Windows.
  if (/^[a-zA-Z]:/.test(name)) return false;
  return true;
}

/**
 * Resolve `name` to a file path inside `dir`, or null if it would escape.
 */
function resolveEntryPath(dir: string, name: string): string | null {
  if (!isValidEntryName(name)) return null;

  const baseDir = path.resolve(dir);
  const filePath = path.resolve(baseDir, `${name}.md`);

  // Defence in depth: whatever the name looked like, the resolved path must be
  // a direct child of the target directory. On POSIX this is unreachable once
  // isValidEntryName has run — which is why a POSIX-only test suite cannot
  // exercise it — but it remains the backstop for platform-specific resolution
  // quirks such as Windows drive-relative paths.
  if (path.dirname(filePath) !== baseDir) return null;

  return filePath;
}

/** Error returned when a name is rejected. */
function invalidNameError(type: "docs" | "sops", name: string): string {
  const kind = type === "docs" ? "doc" : "SOP";
  return `Invalid ${kind} name "${name}": must be a plain file name without path separators or "..".`;
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

  // Drop layers this runtime cannot resolve (see getDefaultPaths).
  return paths.filter((entry) => entry.dir !== "");
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
  if (!isValidEntryName(name)) return null;

  const paths = getDocPaths(type, config);

  // Search in reverse order (local first, then global, then bundled)
  for (const { source, dir } of [...paths].reverse()) {
    const filePath = resolveEntryPath(dir, name);
    if (filePath && fs.existsSync(filePath)) {
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

  const filePath = resolveEntryPath(localDir, name);
  if (!filePath) {
    return { success: false, error: invalidNameError(type, name) };
  }

  try {
    // Ensure directory exists
    fs.mkdirSync(localDir, { recursive: true });

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

  const filePath = resolveEntryPath(localDir, name);
  if (!filePath) {
    return { success: false, error: invalidNameError(type, name) };
  }

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
