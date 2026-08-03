# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Odoo MCP Server - A Model Context Protocol (MCP) server that provides tools and resources for interacting with Odoo ERP systems via XML-RPC.

## Build & Development Commands

```bash
# Build (compiles TypeScript and copies bundled docs)
pnpm build

# Type checking only
pnpm typecheck

# Run tests
pnpm test

# Run tests with LLM-optimized reporter (use this!)
pnpm test:llm

# Run tests with coverage
pnpm test:coverage

# Run single test file
pnpm test src/docs-system/index.test.ts

# Lint
pnpm lint

# Start the server (requires Odoo connection config)
pnpm start
```

## Architecture

### Entry Point & Server
- `src/index.ts` - CLI entry point; dispatches to stdio or HTTP transport
- `src/cli.ts` - Argument parsing (`--http`, `--port`, `--host`)
- `src/server.ts` - Builds the `McpServer` (tools + resources) and serves stdio
  via `serveStdio()` from `@modelcontextprotocol/server`
- `src/http-server.ts` - Serves Streamable HTTP via `createMcpHandler()` +
  `toNodeHandler()` on `node:http`

### Protocol

Targets MCP revision **2026-07-28**. Both entry points (`serveStdio` and
`createMcpHandler`) serve the 2026 revision *and* the 2025-era `initialize`
handshake from the same server factory, so older clients keep working. The 2026
revision is stateless — there is no session map to maintain.

### Connection Layer (`src/connection/`)
- `odoo-client.ts` - `OdooClient` class wrapping Odoo XML-RPC API (authentication via `/xmlrpc/2/common`, method execution via `/xmlrpc/2/object` using `execute_kw`)
- `xmlrpc.ts` - XML-RPC client wrapper using `xmlrpc` npm package with timeout support
- `config.ts` - Configuration loading from env vars or JSON files

### Tools (`src/tools/`)
Tools are defined with `defineTool()` and collected in a `ToolRegistry`
(`registry.ts`, `index.ts`). Each definition carries a name, title,
annotations, a Zod input shape and an async handler.

- `execute.ts` - Generic `execute_method` tool for any Odoo model method
- `introspection.ts` - Model/field discovery (`list_models`, `get_model_schema`, …)
- `search.ts` - Record lookup (`find_record_by_name`, `search_records`)
- `bulk.ts` - Batched `create`/`write`/`unlink` with validation and dry-run
- `access.ts` - Permission checks
- `actions.ts` - Workflow action discovery and execution
- `docs.ts` / `sops.ts` - Documentation and SOP tools
- `excel.ts` - Spreadsheet reading and CSV conversion (ExcelJS)
- `domain-utils.ts` - Odoo domain normalization/validation utilities
- `result-utils.ts` - Shared `isError()` guard for Odoo client results

**Authoring a tool:** export the Zod object (e.g. `FooInputSchema`) and pass
`FooInputSchema.shape` as the tool's `inputSchema`. Do not re-declare the shape
inline — that is how `bulk_operation` silently lost its `batch_size` bounds.

### Resources (`src/resources/`)
- `odoo-resources.ts` - MCP resource handlers for URI patterns:
  - `odoo://models` - List all models
  - `odoo://model/{model_name}` - Model info with fields
  - `odoo://record/{model_name}/{record_id}` - Single record
  - `odoo://search/{model_name}/{domain}` - Search results

### Documentation System (`src/docs-system/`)
- `index.ts` - Manages docs/SOPs from three sources (bundled, global `~/.odoo-mcp/`, local `.odoo-mcp/`)
- Tools: `list_docs`, `read_doc`, `save_doc`, `list_sops`, `read_sop`, `save_sop`
- Entry names are model-controlled input and are validated as flat file names.
  Anything with a path separator or `..` is rejected — do not loosen this.
- Bundled docs live in `src/docs/` and are copied to `dist/docs/` at build time.
  There are no bundled SOPs; `examples/sops/` holds copy-able starting points.

### Types (`src/types/`)
- `config.ts` - `OdooConfigSchema`, env var names, config file paths
- `odoo.ts` - Odoo domain types, field definitions, connection state
- `client-interface.ts` - `IOdooClient`, the interface tools depend on

## Configuration

The server requires Odoo connection credentials via:

1. **Environment variables** (preferred):
   - `ODOO_URL` - Odoo instance URL
   - `ODOO_DB` - Database name
   - `ODOO_USERNAME` - Login username
   - `ODOO_PASSWORD` - API key or password
   - `ODOO_TIMEOUT` - Request timeout in seconds (optional)
   - `ODOO_VERIFY_SSL` - SSL verification (optional, default: true)

2. **Config files** (checked in order):
   - `./odoo_config.json`
   - `~/.config/odoo/config.json`
   - `~/.odoo_config.json`

## Key Patterns

- All Odoo operations go through `OdooClient.execute()` which wraps `execute_kw`
- Tool handlers follow pattern: Zod schema + async function returning `{success, result?, error?}`
- MCP resources return `{contents: [{uri, mimeType, text}]}`
- Bundled docs are in `src/docs/` and copied to `dist/docs/` during build

## Mutation Testing

```bash
pnpm test:mutation                  # inject each catalogued bug, expect a red suite
pnpm test:mutation --list           # show the catalogue
pnpm test:mutation --filter search  # a subset, by id or file
pnpm test:mutation --bail           # stop at the first survivor
pnpm test:mutation --restore        # recover from an interrupted run
```

The catalogue lives in `scripts/mutations.mjs`: each entry is a plausible real
bug (wrong credential order, access always granted, dry-run deleting records,
CSV escaping dropped, path traversal re-opened). The suite must go red for every
one. Runs in CI as its own job, and takes ~2 minutes.

**Why it exists.** Coverage says a line executed, not that a bug in it would be
caught. When this was introduced it found six tests that could not fail — every
one in code with high line coverage. See Testing Invariants below.

**When a mutant survives**, add a test that fails for it. Only remove the entry
if the mutated code is genuinely unreachable, and say why.

**When the catalogue goes stale** — a `find` pattern no longer matching, or
matching several sites — the run fails rather than skipping. A mutation that
cannot be applied is silently checking nothing, which is the failure mode the
tool exists to prevent. Update the pattern; don't delete the entry.

**Safety.** It edits `src/` in place, so never run it alongside anything else
touching those files. It restores via try/finally, handles SIGINT, journals the
pristine contents to `.mutation-journal.json` so even `kill -9` is recovered on
the next run, and verifies every file before exiting.

## Testing Invariants

Rules learned the hard way. Breaking any of these makes the suite report
confidence it has not earned.

- **A test that cannot fail is worse than no test.** When adding one, break the
  code deliberately and confirm it goes red. Several tests here passed happily
  against deliberately broken code — the cases below are all real.
- **Integration tests must skip, never pass, when Odoo is absent.** They used
  `if (skipReason) return;`, so a run with no Odoo reported "99 passed" —
  indistinguishable from a real run. Use `ctx.skip()`.
- **CI must require them.** `REQUIRE_INTEGRATION_TESTS=true` (set by the
  workflow, and implied by `CI=true`) turns an unavailable Odoo into a hard
  failure. Locally they still skip.
- **A missing fixture is a failure, not a skip.** Guards like
  `if (testPartnerId === null) return;` hide broken setup even when Odoo is up.
  Assert the fixture exists instead.
- **Watch for fixtures that mask the assertion.** `bulk`'s required-field test
  passed only because its mock omitted `email`, so an "Unknown field" error
  fired instead. Assert the specific error, not just that one occurred.
- **Never let a fixture value coincide with a plausible hardcoded bug.** The
  `execute_action` test used `action_confirm`, so a handler that ignored the
  caller's action and always confirmed still passed. Use a distinctive value.
- **Mocks must honour their inputs.** The pagination mock returned 11 rows
  whatever limit it was handed, so none of the `limit + 1` / `has_more`
  arithmetic was verified — despite 95% line coverage on that file.
- **Coverage measures execution, not detection.** Every gap above sat in code
  with high coverage.
