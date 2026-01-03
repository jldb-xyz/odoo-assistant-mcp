# Odoo Import Patterns & Best Practices

## Import Strategies

### 1. Direct Create (Small Batches)
Best for: < 100 records, simple data

```python
for record in data:
    execute_kw('res.partner', 'create', [record])
```

### 2. Batch Create (Medium)
Best for: 100-10,000 records

```python
# Create in batches of 100
batch_size = 100
for i in range(0, len(records), batch_size):
    batch = records[i:i + batch_size]
    execute_kw('res.partner', 'create', [batch])
```

### 3. load() Method (Large/Complex)
Best for: > 10,000 records, CSV-like data, complex relations

```python
# load() uses external IDs and handles relations automatically
result = execute_kw('res.partner', 'load', [
    ['name', 'email', 'country_id/id'],  # field names
    [
        ['John Doe', 'john@example.com', 'base.uk'],
        ['Jane Doe', 'jane@example.com', 'base.us'],
    ]
])
# Returns: {'ids': [...], 'messages': [...]}
```

## Performance Optimization

### Disable Tracking
```python
context = {
    'tracking_disable': True,      # No mail notifications
    'mail_create_nolog': True,     # No creation log
    'mail_notrack': True,          # No field tracking
}
execute_kw('res.partner', 'create', [data], {'context': context})
```

### Batch Commits
```python
# Odoo auto-commits per call via XML-RPC
# For large imports, batch your calls appropriately
```

### Defer Computed Fields
Some fields auto-compute and slow imports. Consider:
1. Import minimal required fields first
2. Update computed fields after

## Handling Relations

### Many2one (Lookup by ID)
```python
# If you know the ID:
{'country_id': 233}  # UK country ID

# Lookup first:
uk_id = execute_kw('res.country', 'search', [[['code', '=', 'GB']]])[0]
{'country_id': uk_id}
```

### Many2one (Using External IDs with load)
```python
# Using XML ID reference
execute_kw('res.partner', 'load', [
    ['name', 'country_id/id'],
    [['John', 'base.uk']]  # 'base.uk' is the XML ID
])
```

### Many2many
```python
# Replace all related records
{'tag_ids': [(6, 0, [1, 2, 3])]}

# Add to existing
{'tag_ids': [(4, new_id, 0)]}
```

### One2many (Nested Create)
```python
{
    'name': 'Invoice',
    'invoice_line_ids': [
        (0, 0, {'product_id': 1, 'quantity': 5}),
        (0, 0, {'product_id': 2, 'quantity': 3}),
    ]
}
```

## External IDs (XML IDs)

External IDs allow referencing records across imports:

### Create with External ID
```python
execute_kw('res.partner', 'load', [
    ['id', 'name', 'email'],  # 'id' column for external ID
    [
        ['import.partner_john', 'John Doe', 'john@example.com'],
        ['import.partner_jane', 'Jane Doe', 'jane@example.com'],
    ]
])
```

### Reference in Related Fields
```python
execute_kw('account.move', 'load', [
    ['partner_id/id', 'invoice_line_ids/product_id/id'],
    [
        ['import.partner_john', 'import.product_widget'],
    ]
])
```

### Lookup External ID
```python
# Get record ID from external ID
ref = execute_kw('ir.model.data', 'search_read', [
    [['module', '=', 'import'], ['name', '=', 'partner_john']]
], {'fields': ['res_id']})
```

## Import Order (Dependencies)

For accounting imports, follow this order:

1. **Base Data**
   - res.currency (if multi-currency)
   - res.country, res.country.state
   - account.account.type (if custom)

2. **Chart of Accounts**
   - account.account (accounts)
   - account.tax (taxes)
   - account.journal (journals)

3. **Partners**
   - res.partner (customers/vendors)
   - Assign receivable/payable accounts if custom

4. **Products** (if needed)
   - product.category
   - product.template
   - product.product

5. **Transactions**
   - account.move (invoices/bills/entries)
   - account.payment (payments)
   - Bank statements

## Error Handling

### Validate Before Create
```python
# Check required fields
required = ['name', 'email']
for record in data:
    missing = [f for f in required if not record.get(f)]
    if missing:
        log_error(f"Missing: {missing}")
        continue
    execute_kw('res.partner', 'create', [record])
```

### Catch and Log Errors
```python
results = []
for record in data:
    try:
        id = execute_kw('res.partner', 'create', [record])
        results.append({'success': True, 'id': id})
    except Exception as e:
        results.append({'success': False, 'error': str(e), 'data': record})
```

### Use load() for Better Error Info
```python
result = execute_kw('res.partner', 'load', [fields, data])
for msg in result.get('messages', []):
    if msg.get('type') == 'error':
        print(f"Row {msg['record']}: {msg['message']}")
```

## Rollback Strategies

Since XML-RPC commits each call:

1. **Test First**: Import to test database
2. **Dry Run**: Validate data without creating
3. **Track Created IDs**: Store for potential cleanup
4. **Use Staging Field**: Mark records as "imported", review before finalizing

```python
# Track for potential rollback
imported_ids = []
for record in data:
    id = execute_kw('res.partner', 'create', [{**record, 'comment': 'IMPORT_BATCH_001'}])
    imported_ids.append(id)

# If rollback needed:
execute_kw('res.partner', 'unlink', [imported_ids])
```
