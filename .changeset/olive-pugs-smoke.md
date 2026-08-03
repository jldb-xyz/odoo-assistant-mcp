---
"odoo-mcp": major
---

Adopt MCP revision 2026-07-28, and make the server hostable.

Your existing setup keeps working — MCP clients that speak the older protocol
are served exactly as before, and no `.mcp.json` needs to change. There are
three things to check before upgrading, below.

## Before you upgrade

**1. You need Node.js 22.13 or newer.** Node 18 and 20 are both past end of life
(Node 20 ended 2026-04-30). Check with `node --version`; if you run `npx
odoo-mcp` from an MCP client, that is the Node your client runs under.

**2. Excel tools no longer read `.xls` or `.ods`, only `.xlsx`.** The library
behind them, SheetJS, has two unpatched security advisories and stopped
publishing to npm, so it has been replaced with ExcelJS. Re-save any older
spreadsheets as `.xlsx`, or export them again from the source system.

**3. If you save docs or SOPs, check them once.** A security fix below closes a
hole that allowed writing files outside `.odoo-mcp/`. If an untrusted prompt has
ever reached `save_doc` or `save_sop`, look for unexpected `.md` files beside
your project directory and beside `~/.odoo-mcp`.

Running it over HTTP behind a proxy or in a cluster? See the new
[deployment guide](docs/DEPLOYMENT.md) — you will need `ODOO_MCP_ALLOWED_HOSTS`.

## Security fixes

**Files could be written outside the docs directory.** `save_doc` and `save_sop`
passed the name you gave them straight into a file path, so a name containing
`../` escaped `.odoo-mcp/` and wrote anywhere the process could reach (as a
`.md` file). `read_doc` and `read_sop` could read back out the same way. Names
must now be plain file names. See step 3 above.

**Three dependency advisories resolved**, all fixed by upgrading:

| Advisory | Severity | What it affected |
|---|---|---|
| GHSA-345p-7cg4-v4c7 | High | MCP SDK — data could leak between concurrent clients |
| GHSA-4r6h-8v6p-xvw6 | High | SheetJS — prototype pollution when reading a spreadsheet |
| GHSA-5pgg-2g8v-p4x9 | High | SheetJS — denial of service when reading a spreadsheet |

A fourth (GHSA-5xrq-8626-4rwp, critical) affected a test tool only and was never
part of the published package.

## What's new

**Your assistant now knows when a tool fails.** Previously every failure came
back as a *successful* call whose text happened to say it failed, so the
assistant would often carry on as though a write had worked. Failures are now
marked as errors.

**Your MCP client can warn you before destructive operations.** Every tool now
declares whether it only reads, whether it can destroy data, and whether it
reaches Odoo. `execute_method`, `bulk_operation` and `execute_action` are marked
destructive, so clients that support confirmation prompts can ask first.

**You can host it.** There is now a [deployment guide](docs/DEPLOYMENT.md), a
Docker image, and ready-to-use manifests in `examples/deploy/` for Docker
Compose, Kubernetes, systemd and Cloudflare Workers — covering the security
model, authentication options and scaling. `GET /health` and `GET /ready` give
orchestrators something to probe.

> The HTTP transport still has **no authentication of its own**. It binds to
> localhost and blocks browser-based DNS-rebinding, but anyone who can reach the
> port can read and write your Odoo data. Put an authenticating proxy in front
> of it before exposing it; the guide shows how.

**Protocol revision 2026-07-28**, on both stdio and HTTP. It is stateless, so
HTTP deployments scale horizontally with no sticky sessions. Older clients are
served from the same process, unchanged.

**More accurate tool schemas.** `bulk_operation` now tells clients its
`batch_size` limits (1–1000) instead of accepting an out-of-range value and
failing later, and the server reports its real version rather than a hardcoded
`1.0.0`.

## If you embed this package

Only relevant if you `import` it rather than running the CLI.

- The package is now importable. `main` used to point at the CLI, which started
  a server as a side effect of being imported; it now points at a library entry
  that starts nothing. The `odoo-mcp` command is unchanged.
- `runServer()` returns a handle you can `close()`.
- Removed: `_getTransports()`, `_clearTransports()` and
  `BootstrapDependencies.createTransport`, all obsolete now the protocol is
  stateless.

## Under the hood

The test suite was reporting confidence it had not earned: the 99 integration
tests passed even with no Odoo running, and several unit tests could not fail.
Both are fixed, and `pnpm test:mutation` now verifies the tests can actually
detect the bugs they describe. Toolchain moved to pnpm, TypeScript 7, Zod 4 and
Vitest 4.1.
