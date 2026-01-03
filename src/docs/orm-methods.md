# Odoo ORM Methods Reference

## CRUD Operations

### create(vals_list)
Create one or more records.

```python
# Single record
partner_id = env['res.partner'].create({'name': 'John Doe'})

# Multiple records (returns recordset)
partners = env['res.partner'].create([
    {'name': 'John Doe'},
    {'name': 'Jane Doe'},
])
```

**Via XML-RPC:**
```python
# Single record - pass dict, returns ID
id = models.execute_kw(db, uid, password, 'res.partner', 'create', [{'name': 'John'}])

# Multiple records - pass list of dicts, returns list of IDs
ids = models.execute_kw(db, uid, password, 'res.partner', 'create', [
    [{'name': 'John'}, {'name': 'Jane'}]
])
```

### write(vals)
Update existing records.

```python
partner.write({'name': 'New Name'})
```

**Via XML-RPC:**
```python
models.execute_kw(db, uid, password, 'res.partner', 'write', [[id], {'name': 'New Name'}])
```

### unlink()
Delete records.

```python
partner.unlink()
```

**Via XML-RPC:**
```python
models.execute_kw(db, uid, password, 'res.partner', 'unlink', [[id]])
```

### read(fields)
Read specific fields from records.

```python
data = partner.read(['name', 'email'])
```

**Via XML-RPC:**
```python
# Returns list of dicts
data = models.execute_kw(db, uid, password, 'res.partner', 'read', [[id], ['name', 'email']])
```

## Search Operations

### search(domain, offset=0, limit=None, order=None)
Search for record IDs matching domain.

```python
ids = env['res.partner'].search([('is_company', '=', True)], limit=10)
```

**Via XML-RPC:**
```python
ids = models.execute_kw(db, uid, password, 'res.partner', 'search', [
    [['is_company', '=', True]]
], {'limit': 10})
```

### search_read(domain, fields, offset=0, limit=None, order=None)
Search and read in one call (more efficient).

```python
data = env['res.partner'].search_read(
    [('is_company', '=', True)],
    ['name', 'email'],
    limit=10
)
```

**Via XML-RPC:**
```python
data = models.execute_kw(db, uid, password, 'res.partner', 'search_read', [
    [['is_company', '=', True]]
], {'fields': ['name', 'email'], 'limit': 10})
```

### search_count(domain)
Count records matching domain.

```python
count = env['res.partner'].search_count([('is_company', '=', True)])
```

### name_search(name, args=None, operator='ilike', limit=100)
Search by display name, returns [(id, name), ...].

```python
results = env['res.partner'].name_search('john', limit=5)
# Returns: [(1, 'John Doe'), (2, 'Johnny Smith')]
```

## Introspection

### fields_get(fields=None, attributes=None)
Get field definitions for a model.

```python
fields = env['res.partner'].fields_get(['name', 'email'], ['type', 'required', 'relation'])
```

**Useful attributes:**
- `type` - Field type (char, integer, many2one, etc.)
- `string` - Human-readable label
- `required` - Is field required?
- `readonly` - Is field read-only?
- `relation` - Related model (for relational fields)
- `selection` - Available options (for selection fields)
- `help` - Help text

### default_get(fields)
Get default values for fields.

```python
defaults = env['res.partner'].default_get(['country_id', 'lang'])
```

## Relational Fields

### Many2one
```python
# Create with ID
{'partner_id': 5}

# Via XML-RPC - just use the ID
{'partner_id': 5}
```

### One2many / Many2many
Special command syntax for updates:

```python
# Commands:
# (0, 0, values) - Create new record
# (1, id, values) - Update existing record
# (2, id, 0) - Delete record
# (3, id, 0) - Unlink (remove from relation, don't delete)
# (4, id, 0) - Link existing record
# (5, 0, 0) - Unlink all
# (6, 0, ids) - Replace with list of IDs

# Example: Add new invoice line
{'invoice_line_ids': [(0, 0, {'product_id': 1, 'quantity': 5})]}

# Example: Link existing records
{'tag_ids': [(6, 0, [1, 2, 3])]}

# Example: Add to existing
{'tag_ids': [(4, new_tag_id, 0)]}
```

## Context

Many methods accept a context dict for localization and special behaviors:

```python
# Via XML-RPC - pass as kwargs
models.execute_kw(db, uid, password, 'res.partner', 'create',
    [{'name': 'Test'}],
    {'context': {'lang': 'fr_FR', 'tz': 'Europe/Paris'}}
)
```

**Common context keys:**
- `lang` - Language code for translations
- `tz` - Timezone
- `active_test` - Set False to include archived records
- `tracking_disable` - Disable mail tracking (faster imports)
- `no_reset_password` - Don't send password reset email on user create
