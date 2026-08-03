# odoo-mcp

## 2.0.0

### Major Changes

- [#8](https://github.com/jldb-xyz/odoo-assistant-mcp/pull/8) [`2c8dbc6`](https://github.com/jldb-xyz/odoo-assistant-mcp/commit/2c8dbc6c6373df258bdec22d05ce094b3b579c1a) Thanks [@JonathanBennett](https://github.com/JonathanBennett)! - Adopt MCP revision 2026-07-28, and make the server hostable.

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

  | Advisory            | Severity | What it affected                                         |
  | ------------------- | -------- | -------------------------------------------------------- |
  | GHSA-345p-7cg4-v4c7 | High     | MCP SDK — data could leak between concurrent clients     |
  | GHSA-4r6h-8v6p-xvw6 | High     | SheetJS — prototype pollution when reading a spreadsheet |
  | GHSA-5pgg-2g8v-p4x9 | High     | SheetJS — denial of service when reading a spreadsheet   |

  A fourth (GHSA-5xrq-8626-4rwp, critical) affected a test tool only and was never
  part of the published package.

  ## What's new

  **Your assistant now knows when a tool fails.** Previously every failure came
  back as a _successful_ call whose text happened to say it failed, so the
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

## 1.2.0

### Minor Changes

- [`a62b798`](https://github.com/jldb-xyz/odoo-assistant-mcp/commit/a62b798c7877343eee1d84d135c140752223ffce) Thanks [@JonathanBennett](https://github.com/JonathanBennett)! - # v1.2.0 - Excel File Conversion Tools

  ## Major New Features

  ### Excel to CSV Conversion (Jan 14)

  Two new MCP tools for working with Excel files directly from Claude. The `list_excel_sheets` tool discovers available sheets in a workbook, while `convert_excel` converts sheets to CSV format for analysis. Supports .xlsx, .xls, and .ods formats using the SheetJS library. Handles CSV edge cases including commas, quotes, and newlines in cell values.

  ***

  ## Detailed Changelog by Date

  ### January 16, 2026

  #### Configuration

  - Add .odoo-mcp directory to gitignore for local docs/SOPs

  ### January 14, 2026

  #### Excel Tools

  - Add list_excel_sheets tool to discover sheets in Excel workbooks
  - Add convert_excel tool to convert Excel sheets to CSV format
  - Support .xlsx, .xls, and .ods file formats
  - Handle CSV special characters (commas, quotes, newlines)
  - Add 19 tests covering all conversion scenarios

  #### Bug Fixes

  - Fix non-null assertions in bulk integration tests (lint compliance)

  #### Configuration

  - Add example_import to gitignore
  - Exclude test files from published npm package

## 1.1.0

### Minor Changes

- [`d581b31`](https://github.com/jldb-xyz/odoo-assistant-mcp/commit/d581b31a26e6a03eb7507ffda1ba044cf8e3965c) Thanks [@JonathanBennett](https://github.com/JonathanBennett)! - # v1.1.0 - HTTP Transport and Comprehensive Model Introspection

  ## Major New Features

  ### HTTP/SSE Transport Support (Jan 3)

  Run the MCP server over HTTP instead of stdio using the `--http` flag. Uses the modern StreamableHTTPServerTransport from the MCP SDK with Express, supporting session management, SSE streaming, and graceful shutdown. Configure port and host via CLI flags or environment variables (ODOO_MCP_PORT, ODOO_MCP_HOST).

  ### Comprehensive Model Introspection Tools (Jan 3)

  Eight new tools for exploring Odoo model structure without writing code. Discovery tools (`list_models`, `get_model_schema`, `get_model_relations`) let you explore available models and their structure. Validation tools (`get_create_requirements`, `get_selection_values`, `validate_domain`) help prepare correct API calls. Analysis tools (`explain_field`, `get_record_sample`) provide detailed field documentation and real data examples. These tools reduce errors by validating inputs before executing Odoo operations.

  ### Operational Workflow Tools (Jan 3)

  Six new tools for real-world Odoo operations. Search tools (`find_record_by_name`, `search_records`) resolve human-readable names to IDs and perform validated searches. Access tool (`check_access`) verifies user permissions before operations. Action tools (`list_available_actions`, `execute_action`) discover and execute workflow transitions like confirming orders or posting invoices. Bulk tool (`bulk_operation`) performs atomic batch create/update/delete with validation and dry-run support.

  ### Multi-Version Integration Testing (Jan 3)

  Comprehensive integration test suite with 99 tests covering all MCP tools against real Odoo instances. Docker Compose infrastructure supports Odoo 16, 17, and 18 via profiles. Tests run automatically in CI with a matrix strategy testing all three versions in parallel. Includes database lifecycle management with template cloning for test isolation.

  ***

  ## Detailed Changelog by Date

  ### January 3, 2026

  #### HTTP Transport

  - Add StreamableHTTPServerTransport as alternative to stdio
  - Add CLI argument parsing (--http, --port, --host flags)
  - Add session management with graceful shutdown
  - Add Express integration via MCP SDK's createMcpExpressApp

  #### Model Introspection

  - Add list_models tool with name/category filtering
  - Add get_model_schema tool with field categorization
  - Add get_model_relations tool for relationship mapping
  - Add get_create_requirements tool showing required fields and defaults
  - Add get_selection_values tool for dropdown field options
  - Add explain_field tool with detailed usage guidance
  - Add get_record_sample tool to fetch example records
  - Add validate_domain tool to check domain syntax before queries

  #### Operational Workflow Tools

  - Add find_record_by_name tool for name-to-ID resolution with model-specific fields
  - Add search_records tool with automatic field and domain validation
  - Add check_access tool to verify model and record-level permissions
  - Add list_available_actions tool to discover workflow actions and state transitions
  - Add execute_action tool to run workflow actions with before/after state tracking
  - Add bulk_operation tool for atomic batch create/update/delete operations

  #### Documentation

  - Add example SOPs and LICENSE
  - Update hero example to timesheet invoicing workflow

  #### Integration Testing

  - Add Docker Compose infrastructure for Odoo 16, 17, 18
  - Add integration test framework with database lifecycle management
  - Add 99 integration tests covering all MCP tools
  - Add CI workflow with matrix testing all Odoo versions

  #### Bug Fixes

  - Fix check_access_rights for Odoo 18 compatibility (use raise_exception=false)

  #### Chores

  - Restrict npm package to dist/ only (security improvement)
  - Update gitignore for local config files
  - Rename package to odoo-mcp for npm publication
  - Add secrets scanning to commit workflow
  - Add integration test and Docker scripts to package.json

## 1.0.0

### Major Changes

- [`9d3ceb1`](https://github.com/jldb-xyz/odoo-assistant-mcp/commit/9d3ceb1c98263d121212b268e981b6c15b696e62) Thanks [@JonathanBennett](https://github.com/JonathanBennett)! - # v1.0.0 - Talk to Your Odoo in Plain English

  First major release of the Odoo MCP Server. Connect Claude to your Odoo ERP and interact with your business data through natural conversation.

  ## Major Features

  ### Natural Language Odoo Access

  Query partners, invoices, products, and any of Odoo's 500+ models using plain English. No more memorizing `execute_kw` syntax or hunting for field names—just describe what you need.

  ### Standard Operating Procedures (SOPs)

  Capture successful workflows as reusable procedures. Write them in natural language, and Claude can execute them consistently every time. Knowledge that doesn't walk out the door.

  ### Three-Tier Documentation System

  Bundled reference docs for ORM methods, domain syntax, and import patterns. Add project-specific docs locally (`.odoo-mcp/docs/`) or personal docs globally (`~/.odoo-mcp/docs/`). Local overrides global overrides bundled.

  ### MCP Resources

  Browse your Odoo schema through URI patterns: `odoo://models` for all models, `odoo://model/{name}` for field definitions, `odoo://record/{model}/{id}` for single records.

  ***

  ## Detailed Changelog

  ### Core Infrastructure

  - Initialize project with TypeScript and MCP SDK
  - Add core type definitions with IOdooClient interface
  - Add Odoo XML-RPC connection layer with timeout support
  - Add MCP server with stdio transport
  - Add tool registry pattern for modular tool registration

  ### Tools

  - Add `execute_method` tool for any Odoo model method
  - Add `list_docs` / `read_doc` / `save_doc` for documentation
  - Add `list_sops` / `read_sop` / `save_sop` for procedures

  ### Resources

  - Add `odoo://models` resource for model listing
  - Add `odoo://model/{name}` resource for field definitions
  - Add `odoo://record/{model}/{id}` resource for single records
  - Add `odoo://search/{model}/{domain}` resource for searches

  ### Documentation System

  - Add three-tier hierarchy (bundled → global → local)
  - Add bundled docs: orm-methods, orm-domains, import-patterns
  - Rewrite all docs to use `execute_method` JSON format

  ### Documentation

  - Add comprehensive USER_GUIDE with natural language SOP focus
  - Add inspirational README with quick start guide

  ### Testing

  - Add comprehensive test coverage for tools and docs system
  - Add mock Odoo client for unit testing
  - Add dependency injection for testable server bootstrap

  ### DevOps

  - Add GitHub Actions CI/CD pipeline
  - Add Changesets for version management
  - Add TypeScript, ESLint, and Prettier configuration
