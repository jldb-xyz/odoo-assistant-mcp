# Odoo ORM Methods via MCP

Reference for calling Odoo methods using `execute_method`.

## CRUD Operations

### create
Create one or more records. Returns ID(s).

```json
// Single record - returns ID
execute_method("res.partner", "create", [{"name": "John Doe"}])

// Multiple records - returns array of IDs
execute_method("res.partner", "create", [[
  {"name": "John Doe"},
  {"name": "Jane Doe"}
]])
```

### write
Update existing records. Returns true on success.

```json
execute_method("res.partner", "write", [[id], {"name": "New Name"}])

// Update multiple records
execute_method("res.partner", "write", [[id1, id2], {"active": false}])
```

### unlink
Delete records. Returns true on success.

```json
execute_method("res.partner", "unlink", [[id]])

// Delete multiple
execute_method("res.partner", "unlink", [[id1, id2, id3]])
```

### read
Read specific fields from records. Returns array of dicts.

```json
execute_method("res.partner", "read", [[id], ["name", "email"]])

// Returns: [{"id": 1, "name": "John", "email": "john@example.com"}]
```

## Search Operations

### search
Find record IDs matching a domain.

```json
execute_method("res.partner", "search", [
  [["is_company", "=", true]]
], {"limit": 10})

// Returns: [1, 5, 12, ...]
```

### search_read
Search and read in one call (preferred - more efficient).

```json
execute_method("res.partner", "search_read", [
  [["is_company", "=", true]]
], {"fields": ["name", "email"], "limit": 10})

// Returns: [{"id": 1, "name": "Acme", "email": "info@acme.com"}, ...]
```

### search_count
Count records matching domain.

```json
execute_method("res.partner", "search_count", [
  [["is_company", "=", true]]
])

// Returns: 42
```

### name_search
Search by display name. Returns `[[id, name], ...]`.

```json
execute_method("res.partner", "name_search", ["john"], {"limit": 5})

// Returns: [[1, "John Doe"], [2, "Johnny Smith"]]
```

## Model Introspection

### fields_get
Get field definitions. Essential for understanding a model.

```json
execute_method("res.partner", "fields_get", [], {
  "attributes": ["type", "required", "relation", "selection"]
})
```

**Key attributes:**
- `type` - Field type (char, integer, many2one, one2many, etc.)
- `required` - Is field required?
- `readonly` - Is field read-only?
- `relation` - Related model (for relational fields)
- `selection` - Options for selection fields

### default_get
Get default values for fields.

```json
execute_method("res.partner", "default_get", [["country_id", "lang"]])
```

## Relational Fields

### Many2one
Just use the ID:
```json
{"partner_id": 5, "country_id": 233}
```

### One2many / Many2many Commands
Special tuple syntax for modifying relations:

| Command | Meaning |
|---------|---------|
| `[0, 0, values]` | Create new linked record |
| `[1, id, values]` | Update existing linked record |
| `[2, id, 0]` | Delete linked record |
| `[3, id, 0]` | Unlink (remove from relation, keep record) |
| `[4, id, 0]` | Link existing record |
| `[5, 0, 0]` | Unlink all |
| `[6, 0, [ids]]` | Replace all with these IDs |

**Examples:**
```json
// Create new invoice line
{"invoice_line_ids": [[0, 0, {"product_id": 1, "quantity": 5}]]}

// Replace all tags
{"tag_ids": [[6, 0, [1, 2, 3]]]}

// Add one tag to existing
{"tag_ids": [[4, 99, 0]]}
```

## Context

Pass context via kwargs for special behaviors:

```json
execute_method("res.partner", "create", [{"name": "Test"}], {
  "context": {
    "lang": "fr_FR",
    "tz": "Europe/Paris",
    "tracking_disable": true
  }
})
```

**Common context keys:**
- `lang` - Language code for translations
- `tz` - Timezone
- `active_test` - Set `false` to include archived records
- `tracking_disable` - Disable mail tracking (faster imports)
