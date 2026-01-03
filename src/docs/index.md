# Odoo Developer Documentation Index

## Reference Documentation

Static Odoo reference bundled with the MCP server.

### Core ORM
- `orm-methods` - CRUD operations, search, and common patterns
- `orm-domains` - Domain filter syntax and operators

### Accounting
- `accounting-moves` - Journal entries and invoices (account.move)

### Data Import
- `import-patterns` - Bulk import strategies and best practices

---

## SOPs (Standard Operating Procedures)

Dynamic procedures stored locally and globally.

**Locations:**
- Local (read/write): `./.odoo-mcp/sops/`
- Global (read-only): `~/.odoo-mcp/sops/`

Use `list_sops` tool to discover available SOPs.
Use `save_sop` tool to create new SOPs after successful operations.
