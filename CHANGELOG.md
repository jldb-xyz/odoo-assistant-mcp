# odoo-mcp

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
