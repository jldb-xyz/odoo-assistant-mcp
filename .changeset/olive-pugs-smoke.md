---
"odoo-mcp": major
---

Adopt MCP revision 2026-07-28 and migrate to the v2 SDK.

**Breaking**

- **Node.js 20+ is now required** (was 18, which is end-of-life).
- The HTTP transport no longer depends on Express. It is served by
  `createMcpHandler` over `node:http`, so `express` and
  `@modelcontextprotocol/express` are no longer needed. `Host`/`Origin`
  DNS-rebinding protection is preserved.
- The 2026-07-28 revision is stateless, so per-session transport bookkeeping is
  gone: the internal `_getTransports()` and `_clearTransports()` helpers were
  removed, along with `BootstrapDependencies.createTransport`. `runServer()` now
  returns a `StdioServerHandle`.
- The Excel tools are backed by ExcelJS instead of SheetJS. `.xls` and `.ods`
  inputs are no longer supported; the error text for a missing file changed.

**Protocol**

- Implements MCP revision **2026-07-28** on both transports, via `serveStdio`
  and `createMcpHandler`. Clients using the 2025-era `initialize` handshake are
  still served from the same server factory, so no client config needs to
  change.
- Failing tools now set `isError: true` on the tool result. Previously every
  failure was reported to the model as a successful call whose text happened to
  contain `"success": false`.
- All 23 tools now advertise a `title` and behavioural `annotations`
  (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), so
  clients can distinguish lookups from operations that change Odoo data.
- The server now reports its real package version instead of a hardcoded
  `1.0.0`.

**Security**

- Fixed a path traversal in the docs/SOP system. `save_doc`, `save_sop`,
  `read_doc` and `read_sop` took an unvalidated `name` straight from tool input
  into `path.join`, allowing reads and writes outside `.odoo-mcp/` — an
  arbitrary file write with a forced `.md` extension. Entry names are now
  required to be flat file names and the resolved path is verified to stay
  inside the target directory.
- Updated `@modelcontextprotocol/sdk` past GHSA-345p-7cg4-v4c7 (cross-client
  data leak, affecting `<= 1.25.3`).
- Replaced `xlsx@0.18.5`, which carries two unpatchable-on-npm high advisories
  (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS), with
  ExcelJS.
- Updated Vitest past GHSA-5xrq-8626-4rwp (critical, dev-only).

**Fixed**

- `bulk_operation` published its `batch_size` bounds (1–1000) to clients. The
  tool re-declared its schema by hand, which dropped the constraints from the
  advertised schema. Tool schemas are now derived from a single Zod object.

**Deployment**

- Added `docs/DEPLOYMENT.md` and `examples/deploy/`, covering stdio, Docker,
  Docker Compose, Kubernetes, systemd and Cloudflare Workers, with the security
  model, authentication options, health probes and scaling.
- Added a `Dockerfile`: multi-stage, non-root, production dependencies only.
- Added `GET /health` and `GET /ready`. The HTTP transport previously answered
  404 to every path except `/mcp`, which answers 405 to GET, so orchestrators
  had no probe target.
- Added `ODOO_MCP_ALLOWED_HOSTS` / `--allowed-hosts`. The DNS-rebinding guard
  accepted only loopback and the bind address, so behind an ingress or Service
  every request was rejected with 403.
- The package can now be imported. `main` and `bin` both pointed at the CLI,
  which starts a server on import; `dist/lib.js` exports the public surface and
  starts nothing.
- Fixed two module-scope calls that assumed a real filesystem and threw on
  import where there is not one, taking down the whole server rather than
  degrading one feature. Found by running on Cloudflare Workers.

**Testing**

- Integration tests no longer report a pass when Odoo is unavailable. They used
  `if (skipReason) return;`, so a run with no Odoo printed "99 passed" —
  identical to a real run. They now report as skipped, and
  `REQUIRE_INTEGRATION_TESTS=true` (set in CI) makes an unreachable Odoo a hard
  failure.
- Fixed several tests that could not fail, found by mutation testing: bulk's
  required-field check (masked by an "Unknown field" error from the same
  fixture), `check_access` denial (only the throwing path was covered, not the
  `false` return Odoo actually uses), `execute_action`'s action name (the
  fixture matched a plausible hardcoded value), and `search_records` pagination
  (the mock ignored the limit it was given).
- Added `pnpm test:mutation`, which injects a catalogue of plausible real bugs
  (`scripts/mutations.mjs`) and requires the suite to go red for each. It runs
  as its own CI job and is what found the tests above. A stale catalogue entry
  or a failing baseline is an error rather than a skip, since either would score
  every mutant as caught.
- Added protocol-level coverage for the HTTP transport, including
  DNS-rebinding/Origin rejection and bind-failure handling — `http-server.ts`
  went from 4% to 81% line coverage.
- `runHttpServer` now rejects on a bind error instead of hanging, and takes
  `handleSignals` so it no longer unconditionally hijacks process signals.

**Internal**

- Switched from Yarn to pnpm; TypeScript 7, Zod 4, Vitest 4.1, Biome 2.5.
- Dropped the SWC build path in favour of `tsc` (the two configs had drifted).
