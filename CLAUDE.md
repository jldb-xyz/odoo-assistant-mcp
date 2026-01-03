# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Odoo MCP Server - A Model Context Protocol (MCP) server that provides tools and resources for interacting with Odoo ERP systems via XML-RPC.

## Build & Development Commands

```bash
# Build (compiles TypeScript and copies bundled docs)
yarn build

# Type checking only
yarn typecheck

# Run tests
yarn test

# Run tests with LLM-optimized reporter (use this!)
yarn test:llm

# Run tests with coverage
yarn test:coverage

# Run single test file
yarn test src/docs-system/index.test.ts

# Lint
yarn lint

# Start the server (requires Odoo connection config)
yarn start
```

## Architecture

### Entry Point & Server
- `src/index.ts` - CLI entry point, invokes `runServer()`
- `src/server.ts` - MCP server setup using `@modelcontextprotocol/sdk`, registers all tools and resources

### Connection Layer (`src/connection/`)
- `odoo-client.ts` - `OdooClient` class wrapping Odoo XML-RPC API (authentication via `/xmlrpc/2/common`, method execution via `/xmlrpc/2/object` using `execute_kw`)
- `xmlrpc.ts` - XML-RPC client wrapper using `xmlrpc` npm package with timeout support
- `config.ts` - Configuration loading from env vars or JSON files

### Tools (`src/tools/`)
Each tool exports a Zod input schema and an async handler function:
- `execute.ts` - Generic `execute_method` tool for any Odoo model method
- `employee.ts` - `search_employee` tool using `hr.employee.name_search`
- `holidays.ts` - `search_holidays` tool for `hr.leave.report.calendar` records
- `domain-utils.ts` - Odoo domain normalization/validation utilities

### Resources (`src/resources/`)
- `odoo-resources.ts` - MCP resource handlers for URI patterns:
  - `odoo://models` - List all models
  - `odoo://model/{model_name}` - Model info with fields
  - `odoo://record/{model_name}/{record_id}` - Single record
  - `odoo://search/{model_name}/{domain}` - Search results

### Documentation System (`src/docs-system/`)
- `index.ts` - Manages docs/SOPs from three sources (bundled, global `~/.odoo-mcp/`, local `.odoo-mcp/`)
- Tools: `list_docs`, `read_doc`, `save_doc`, `list_sops`, `read_sop`, `save_sop`

### Types (`src/types/`)
- `config.ts` - `OdooConfigSchema`, env var names, config file paths
- `odoo.ts` - Odoo domain types, field definitions, connection state
- `responses.ts` - Tool response types

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
