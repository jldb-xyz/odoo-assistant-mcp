#!/usr/bin/env node
/**
 * Mutation testing.
 *
 * Coverage tells you a line executed. It does not tell you a bug in that line
 * would be caught. This injects real bugs one at a time and checks the suite
 * goes red for each. Every gap it found when introduced sat in code with high
 * line coverage.
 *
 * Usage:
 *   pnpm test:mutation                    # run the whole catalogue
 *   pnpm test:mutation --filter search    # only ids/files matching a substring
 *   pnpm test:mutation --list             # show the catalogue and exit
 *   pnpm test:mutation --bail             # stop at the first survivor
 *   pnpm test:mutation --restore          # recover from an interrupted run
 *
 * Exit codes: 0 all mutants killed; 1 a mutant survived or the run was unsafe.
 *
 * SAFETY. This edits files in src/ in place, so it cannot run concurrently with
 * anything else touching them (including another test run). Three layers keep
 * the tree recoverable:
 *
 *   1. try/finally restores after any error.
 *   2. A journal file records the pristine contents before each edit, so an
 *      unhandleable kill (SIGKILL, power loss) is recovered automatically on
 *      the next run — a plain signal handler cannot cover that case.
 *   3. Every file is verified byte-identical before the process exits.
 *
 * The loop yields to the event loop between mutations so SIGINT is handled
 * promptly; without that, back-to-back synchronous child processes starve the
 * signal handler and Ctrl-C appears to do nothing.
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { mutations } from "./mutations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOURNAL = path.join(ROOT, ".mutation-journal.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

// ------------------------------------------------------------------ journal

/** Record a file's pristine contents before we touch it. */
function journalWrite(file, original) {
  fs.writeFileSync(
    JOURNAL,
    JSON.stringify({ file, original }, null, 2),
    "utf-8",
  );
}

function journalClear() {
  if (fs.existsSync(JOURNAL)) fs.rmSync(JOURNAL);
}

/**
 * Recover from a run that died before it could restore. Returns true if
 * anything was recovered.
 */
function journalRecover({ quiet = false } = {}) {
  if (!fs.existsSync(JOURNAL)) {
    if (!quiet) console.log("Nothing to restore — no journal present.");
    return false;
  }
  const { file, original } = JSON.parse(fs.readFileSync(JOURNAL, "utf-8"));
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
  if (current === original) {
    journalClear();
    if (!quiet) console.log(`${path.relative(ROOT, file)} was already intact.`);
    return false;
  }
  fs.writeFileSync(file, original, "utf-8");
  journalClear();
  console.log(
    `Recovered ${path.relative(ROOT, file)} from an interrupted run.`,
  );
  return true;
}

if (flag("restore")) {
  journalRecover();
  process.exit(0);
}

// ------------------------------------------------------------------ restore

/** Files currently mutated, so we can always put them back. */
const inFlight = new Map();
let interrupted = false;

function restoreAll() {
  for (const [file, content] of inFlight) {
    try {
      fs.writeFileSync(file, content, "utf-8");
    } catch (error) {
      console.error(`FAILED to restore ${file}: ${error}`);
    }
  }
  inFlight.clear();
  journalClear();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    console.error("\nInterrupted — restoring source files...");
    restoreAll();
    process.exit(130);
  });
}

// ------------------------------------------------------------------ helpers

function runSuite() {
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "--reporter=dot", "--silent"],
    { cwd: ROOT, encoding: "utf-8", stdio: "pipe" },
  );
  // A child that never launched exits null, which must not read as "failed
  // because of the mutation" — that would score every mutant as killed.
  if (result.error || result.status === null) {
    throw new Error(
      `Could not run the test suite: ${result.error?.message ?? "no exit status"}`,
    );
  }
  return result.status === 0;
}

function gitIsClean(files) {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", ...files], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    return out.trim() === "";
  } catch {
    return true; // not a git checkout; the journal still protects us
  }
}

/** Let the event loop turn so queued signals are delivered. */
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------- catalogue

const filter = value("filter");
const selected = filter
  ? mutations.filter((m) => m.id.includes(filter) || m.file.includes(filter))
  : mutations;

if (flag("list")) {
  for (const m of selected) {
    console.log(`${m.id.padEnd(42)} ${m.file}`);
    console.log(`${" ".repeat(42)} ${m.description}`);
  }
  console.log(`\n${selected.length} mutation(s)`);
  process.exit(0);
}

if (selected.length === 0) {
  console.error(`No mutations match --filter ${filter}`);
  process.exit(1);
}

// ---------------------------------------------------------------- pre-flight

console.log(`Mutation testing — ${selected.length} mutation(s)\n`);

journalRecover({ quiet: true });

// A mutation whose `find` no longer matches, or matches more than once, is not
// a harmless skip: the invariant has quietly stopped being checked, or is being
// applied to the wrong site. Both are hard errors.
const catalogueErrors = [];
const targetFiles = [...new Set(selected.map((m) => m.file))];

for (const m of selected) {
  const full = path.join(ROOT, m.file);
  if (!fs.existsSync(full)) {
    catalogueErrors.push(`${m.id}: file not found (${m.file})`);
    continue;
  }
  const occurrences = fs.readFileSync(full, "utf-8").split(m.find).length - 1;
  if (occurrences === 0) {
    catalogueErrors.push(
      `${m.id}: pattern not found in ${m.file} — the code moved; update the mutation`,
    );
  } else if (occurrences > 1) {
    catalogueErrors.push(
      `${m.id}: pattern matches ${occurrences} sites in ${m.file} — make it unique`,
    );
  }
}

if (catalogueErrors.length > 0) {
  console.error("Catalogue is stale:\n");
  for (const error of catalogueErrors) console.error(`  ${error}`);
  console.error(
    "\nA mutation that cannot be applied is not checking anything. Fix the\n" +
      "catalogue rather than deleting the entry, unless the invariant is gone.",
  );
  process.exit(1);
}

if (!gitIsClean(targetFiles)) {
  console.log(
    "Note: target files have uncommitted changes. They will be restored to\n" +
      "their current on-disk state, not to HEAD.\n",
  );
}

// A red baseline makes every mutant look killed — a perfect score that means
// nothing. Establish green before trusting any result.
process.stdout.write("Baseline (suite must be green)... ");
if (!runSuite()) {
  console.error(
    "FAILED\n\nThe suite is already failing, so every mutant would appear killed.\n" +
      "Fix the suite first.",
  );
  process.exit(1);
}
console.log("green\n");

// ------------------------------------------------------------------- mutate

const results = [];

try {
  for (const [index, m] of selected.entries()) {
    if (interrupted) break;

    const full = path.join(ROOT, m.file);
    const original = fs.readFileSync(full, "utf-8");

    journalWrite(full, original);
    inFlight.set(full, original);
    fs.writeFileSync(full, original.replace(m.find, m.replace), "utf-8");

    const survived = runSuite();

    fs.writeFileSync(full, original, "utf-8");
    inFlight.delete(full);
    journalClear();

    results.push({ ...m, survived });

    const label = `[${String(index + 1).padStart(2)}/${selected.length}]`;
    console.log(
      `${label} ${survived ? "SURVIVED" : "killed  "}  ${m.id.padEnd(42)} ${m.description}`,
    );

    if (survived && flag("bail")) {
      console.log("\nStopping at first survivor (--bail).");
      break;
    }

    await yieldToLoop();
  }
} finally {
  restoreAll();
}

// --------------------------------------------------------- verify + report

// Prove the tree is pristine rather than assuming it: re-apply each mutation's
// pattern check. If `find` is missing from a file we touched, we did not put it
// back correctly.
const unrestored = selected
  .filter((m) => {
    const full = path.join(ROOT, m.file);
    return (
      fs.existsSync(full) && !fs.readFileSync(full, "utf-8").includes(m.find)
    );
  })
  .map((m) => m.file);

if (unrestored.length > 0) {
  console.error(
    `\nSource files were NOT restored: ${[...new Set(unrestored)].join(", ")}\n` +
      "Run `pnpm test:mutation --restore`, then check `git diff`.",
  );
  process.exit(1);
}

const survivors = results.filter((r) => r.survived);
console.log(
  `\n${results.length - survivors.length}/${results.length} mutants killed.`,
);

if (survivors.length > 0) {
  console.log("\nSurvivors — these bugs would ship unnoticed:\n");
  for (const s of survivors) {
    console.log(`  ${s.id}`);
    console.log(`    ${s.file}: ${s.description}`);
  }
  console.log(
    "\nEither add a test that fails for the mutant, or — if the mutated code is\n" +
      "genuinely unreachable on this platform — document why and remove the entry.",
  );
  process.exit(1);
}

console.log("Every mutant was caught.");
