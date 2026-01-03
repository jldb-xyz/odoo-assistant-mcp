# Odoo Import Patterns via MCP

Best practices for bulk data operations.

## Strategies by Volume

### Small (< 100 records)
Direct create calls:
```json
execute_method("res.partner", "create", [{"name": "John", "email": "john@example.com"}])
```

### Medium (100-10,000 records)
Batch create - pass array of records:
```json
execute_method("res.partner", "create", [[
  {"name": "John", "email": "john@example.com"},
  {"name": "Jane", "email": "jane@example.com"},
  // ... up to ~100 per batch
]])
```

### Large (> 10,000 records)
Use `load()` method - handles external IDs and relations:
```json
execute_method("res.partner", "load", [
  ["name", "email", "country_id/id"],
  [
    ["John Doe", "john@example.com", "base.uk"],
    ["Jane Doe", "jane@example.com", "base.us"]
  ]
])
// Returns: {"ids": [...], "messages": [...]}
```

## Performance: Disable Tracking

For imports, disable mail/activity tracking:
```json
execute_method("res.partner", "create", [records], {
  "context": {
    "tracking_disable": true,
    "mail_create_nolog": true,
    "mail_notrack": true
  }
})
```

## Handling Relations

### Many2one - Lookup First
```json
// Find the country ID
execute_method("res.country", "search", [[["code", "=", "GB"]]])
// Returns: [233]

// Then use it
execute_method("res.partner", "create", [{"name": "John", "country_id": 233}])
```

### Many2one with load() - Use XML IDs
```json
execute_method("res.partner", "load", [
  ["name", "country_id/id"],
  [["John", "base.uk"]]  // base.uk is the XML ID
])
```

### Many2many - Command Syntax
```json
// Replace all tags
{"tag_ids": [[6, 0, [1, 2, 3]]]}

// Add to existing
{"tag_ids": [[4, new_tag_id, 0]]}
```

### One2many - Nested Create
```json
execute_method("account.move", "create", [{
  "move_type": "out_invoice",
  "partner_id": 5,
  "invoice_line_ids": [
    [0, 0, {"product_id": 1, "quantity": 5, "price_unit": 100}],
    [0, 0, {"product_id": 2, "quantity": 3, "price_unit": 50}]
  ]
}])
```

## External IDs

Reference records by XML ID instead of database ID:

### Create with External ID
```json
execute_method("res.partner", "load", [
  ["id", "name", "email"],
  [
    ["my_import.partner_john", "John Doe", "john@example.com"],
    ["my_import.partner_jane", "Jane Doe", "jane@example.com"]
  ]
])
```

### Lookup External ID
```json
execute_method("ir.model.data", "search_read", [
  [["module", "=", "my_import"], ["name", "=", "partner_john"]]
], {"fields": ["res_id"]})
```

## Import Order (Dependencies)

When importing related data, order matters:

1. **Base Data**: currencies, countries, states
2. **Accounts**: account.account, account.tax, account.journal
3. **Partners**: res.partner (customers/vendors)
4. **Products**: product.category → product.template → product.product
5. **Transactions**: account.move, account.payment

## Error Handling

### Use load() for Better Errors
```json
execute_method("res.partner", "load", [fields, data])
// Check messages in response:
// {"ids": [1, null, 3], "messages": [{"type": "error", "record": 1, "message": "..."}]}
```

### Track Created IDs for Rollback
```json
// If you need to undo, keep track of created IDs
execute_method("res.partner", "unlink", [[id1, id2, id3]])
```

## Tips

1. **Test first** - Try on a test database
2. **Batch appropriately** - 50-100 records per call
3. **Disable tracking** - Faster imports with context flags
4. **Use load()** for complex imports - Better error reporting, handles XML IDs
5. **Check dependencies** - Import parents before children
