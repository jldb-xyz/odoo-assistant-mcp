# Odoo MCP Server

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
      "args": ["@jldb-xyz/odoo-mcp"],
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

## Links

- [User Guide](docs/USER_GUIDE.md)
- [Odoo External API](https://www.odoo.com/documentation/18.0/developer/reference/external_api.html)
- [Model Context Protocol](https://modelcontextprotocol.io)

## License

MIT
