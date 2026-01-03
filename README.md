# Odoo MCP Server

[![CI](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/odoo-mcp)](https://www.npmjs.com/package/odoo-mcp)

[![Odoo 14](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-14.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-14.yml)
[![Odoo 15](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-15.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-15.yml)
[![Odoo 16](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-16.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-16.yml)
[![Odoo 17](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-17.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-17.yml)
[![Odoo 18](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-18.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-18.yml)
[![Odoo 19](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-19.yml/badge.svg)](https://github.com/jldb-xyz/odoo-assistant-mcp/actions/workflows/odoo-19.yml)

**Talk to your Odoo ERP in plain English.**

An MCP server that connects Claude to your Odoo instance. Query data, create records, and build reusable workflows—all through natural conversation.

```
"Draft invoices for all outstanding timesheets for Acme Inc"
```

No API syntax. No field lookups. No hunting through models. Just describe what you need.

## Why This Matters

**Before:** Writing Python scripts, memorizing `execute_kw` syntax, hunting through Odoo's 500+ models for the right field names.

**After:** Describe what you need. Claude figures out the rest.

But the real power is **natural language SOPs**. When you complete a complex task—reconciling invoices, importing products, generating reports—save it as a procedure. Next time, anyone on your team just says "run the monthly-sales-report SOP" and it happens. Same steps, every time. Knowledge that doesn't walk out the door.

## Quick Start

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["odoo-mcp"],
      "env": {
        "ODOO_URL": "https://your-instance.odoo.com",
        "ODOO_DB": "your_database",
        "ODOO_USERNAME": "your_username",
        "ODOO_PASSWORD": "your_api_key"
      }
    }
  }
}
```

Start Claude Code. You're connected.

## Documentation

**[User Guide](docs/USER_GUIDE.md)** — Complete guide including:
- The power of natural language SOPs
- Configuration options
- Building your SOP library
- Troubleshooting

**[Example SOPs](examples/sops/)** — Ready-to-use templates to get you started.

## What You Can Do

- **Query anything** — Partners, invoices, products, stock levels, any of Odoo's 500+ models
- **Create and update records** — Invoices, orders, contacts, journal entries
- **Bulk operations** — Import data with batching and error handling
- **Save procedures** — Capture complex workflows as reusable SOPs
- **Share knowledge** — Commit `.odoo-mcp/` to git, team learns instantly

## Requirements

- Odoo 14+ with XML-RPC enabled (default)
- API key (Custom plans only—not available on One App Free or Standard)
- Node.js 18+

### Tested Versions

| Odoo Version | Status | Notes |
|--------------|--------|-------|
| 19 | ✅ Tested | Latest version (2025), full support |
| 18 | ✅ Tested | Full support |
| 17 | ✅ Tested | Full support |
| 16 | ✅ Tested | Full support |
| 15 | ✅ Tested | Full support |
| 14 | ✅ Tested | Full support |

All 99 integration tests run against each version in CI.

## Links

- [User Guide](docs/USER_GUIDE.md)
- [Example SOPs](examples/sops/)
- [Odoo External API](https://www.odoo.com/documentation/18.0/developer/reference/external_api.html)
- [Model Context Protocol](https://modelcontextprotocol.io)

## License

MIT
