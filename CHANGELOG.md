# @jldb-xyz/odoo-mcp

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
