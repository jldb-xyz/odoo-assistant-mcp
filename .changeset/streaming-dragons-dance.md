---
"odoo-mcp": minor
---

# v1.1.0 - HTTP Transport and Comprehensive Model Introspection

## Major New Features

### HTTP/SSE Transport Support (Jan 3)

Run the MCP server over HTTP instead of stdio using the `--http` flag. Uses the modern StreamableHTTPServerTransport from the MCP SDK with Express, supporting session management, SSE streaming, and graceful shutdown. Configure port and host via CLI flags or environment variables (ODOO_MCP_PORT, ODOO_MCP_HOST).

### Comprehensive Model Introspection Tools (Jan 3)

Eight new tools for exploring Odoo model structure without writing code. Discovery tools (`list_models`, `get_model_schema`, `get_model_relations`) let you explore available models and their structure. Validation tools (`get_create_requirements`, `get_selection_values`, `validate_domain`) help prepare correct API calls. Analysis tools (`explain_field`, `get_record_sample`) provide detailed field documentation and real data examples. These tools reduce errors by validating inputs before executing Odoo operations.

---

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

#### Documentation

- Add example SOPs and LICENSE
- Update hero example to timesheet invoicing workflow

#### Chores

- Restrict npm package to dist/ only (security improvement)
- Update gitignore for local config files
- Rename package to odoo-mcp for npm publication
- Add secrets scanning to commit workflow
