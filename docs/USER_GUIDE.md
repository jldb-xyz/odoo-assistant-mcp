# Odoo MCP Server - User Guide

**Talk to your ERP in plain English.**

No more memorizing API syntax. No more hunting for field names. No more writing scripts for one-off queries. Just describe what you need, and Claude handles the rest.

## What This Changes

Before:
```python
models.execute_kw(db, uid, password, 'res.partner', 'search_read',
    [[['is_company', '=', True], ['country_id.code', '=', 'GB']]],
    {'fields': ['name', 'email', 'phone'], 'limit': 10})
```

After:
```
Draft invoices for all outstanding timesheets for Acme Inc
```

That's it. Claude finds the timesheets, looks up the partner, creates the invoice with the right lines—all from a single sentence.

## Quick Start

Add a `.mcp.json` file to your project:

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

Start Claude Code in that directory. You're connected.

Test it:
```
What models are available in my Odoo instance?
```

---

## The Power of Natural Language SOPs

This is where it gets interesting.

Traditional SOPs are written for humans to read and execute. The problem? Humans make mistakes. They skip steps. They forget edge cases. And when the person who wrote the SOP leaves, the knowledge often goes with them.

**Natural language SOPs flip this completely.**

You write them in plain English—the way you'd explain a task to a colleague. But unlike a PDF gathering dust in a shared drive, Claude can actually *execute* them. Every time. Consistently. Without forgetting steps.

### How It Works

You complete a complex task with Claude's help. Maybe it's creating a specific type of invoice, or importing products with the right category mappings, or generating a monthly report. Once it works, you say:

```
That worked perfectly. Save this as an SOP called "monthly-sales-report"
```

Done. Next month, anyone on your team can say:

```
Run the monthly-sales-report SOP for December
```

Claude reads the SOP, understands the steps, and executes them. Same process, same results, every time.

### Why This Matters

**Knowledge doesn't walk out the door.** When your Odoo expert figures out the seventeen-step process for reconciling multi-currency invoices, that knowledge is captured. Forever. In a format that actually *does* something.

**Training becomes trivial.** New team member? They don't need to learn the Odoo API. They don't even need to know which fields exist on which models. They just describe what they need in plain English, and if there's an SOP for it, Claude handles the details.

**Complexity becomes invisible.** That gnarly import process with the specific field mappings and the context flags for performance? It's now just "run the partner-import SOP." The complexity doesn't go away—it's just handled for you.

### What Makes a Good SOP

Write them like you're explaining to a smart colleague who's never seen your Odoo instance:

```markdown
# Monthly Sales Report

## When to Use
End of each month, for the sales meeting.

## What It Does
1. Pulls all confirmed sale orders from the previous month
2. Groups by salesperson
3. Calculates totals and averages
4. Includes comparison to same month last year

## Parameters Needed
- Month and year (defaults to previous month if not specified)

## Output
Table with: Salesperson, Order Count, Total Revenue, Avg Order Value, YoY Change
```

That's it. No code. No field names. No API syntax. Just clear, human instructions that Claude can follow.

### Building Your SOP Library

Start with the tasks you do repeatedly:
- "Create a customer invoice for consulting services"
- "Import products from our supplier's CSV format"
- "Find all overdue invoices and their contact details"
- "Generate the weekly inventory report"

Every SOP you save makes your whole team faster. They compound.

---

## Reference

### Getting Your API Key

1. Log into Odoo → Profile → **My Profile**
2. **Account Security** → **API Keys** → **New API Key**
3. Copy immediately (shown only once)

> **Note**: External API requires Odoo Custom plans. Not available on One App Free or Standard.

### Configuration Options

**Environment variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| `ODOO_URL` | Yes | Your Odoo instance URL |
| `ODOO_DB` | Yes | Database name |
| `ODOO_USERNAME` | Yes | Login username (usually email) |
| `ODOO_PASSWORD` | Yes | API key or password |
| `ODOO_TIMEOUT` | No | Request timeout in seconds (default: 30) |

**Or use a config file** at `./odoo_config.json`, `~/.config/odoo/config.json`, or `~/.odoo_config.json`:

```json
{
  "url": "https://your-instance.odoo.com",
  "db": "your_database",
  "username": "your_username",
  "password": "your_api_key"
}
```

### Storage Locations

| What | Where | Shared |
|------|-------|--------|
| Project SOPs | `./.odoo-mcp/sops/` | Commit to git |
| Personal SOPs | `~/.odoo-mcp/sops/` | Just you |
| Project docs | `./.odoo-mcp/docs/` | Commit to git |
| Personal docs | `~/.odoo-mcp/docs/` | Just you |

**Tip**: Commit `.odoo-mcp/` to your repo. Your SOPs become team knowledge.

### Bundled Reference Docs

Claude has built-in docs for Odoo patterns—it consults them automatically. You can read them too:

| Document | What's Inside |
|----------|---------------|
| `orm-methods` | CRUD operations, search patterns, relational fields |
| `orm-domains` | Filter syntax—equals, contains, AND/OR logic |
| `import-patterns` | Bulk imports, batching, performance tips |

```
Show me the orm-methods documentation
```

### Available Tools

| Tool | What It Does |
|------|--------------|
| `execute_method` | Run any Odoo method on any model |
| `list_docs` / `read_doc` | Access reference documentation |
| `list_sops` / `read_sop` | Access your saved procedures |
| `save_doc` / `save_sop` | Save new docs or procedures |

### Available Resources

| URI | Returns |
|-----|---------|
| `odoo://models` | All models in your instance |
| `odoo://model/{name}` | Field definitions for a model |
| `odoo://record/{model}/{id}` | A single record |
| `odoo://search/{model}/{domain}` | Search results |

---

## Troubleshooting

**"Connection refused"**
- Check `ODOO_URL` is correct and reachable
- Verify Odoo is running and XML-RPC isn't blocked

**"Access denied"**
- Verify username (usually your email)
- Regenerate API key if needed
- Check database name (case-sensitive)

**"SSL certificate error"**
- For self-signed certs: set `ODOO_VERIFY_SSL=false`

**"Permission denied" on specific models**
- Check user's access rights in Odoo
- Some models (accounting, HR) need specific permissions

**Timeouts**
- Increase: `ODOO_TIMEOUT=120`
- Use `limit` in queries to reduce result size

---

## Further Reading

- [Odoo External API Docs](https://www.odoo.com/documentation/18.0/developer/reference/external_api.html)
- [Model Context Protocol](https://modelcontextprotocol.io)
