# Odoo Domain Filter Syntax

Domains filter records in search operations. Pass as first argument to `search`, `search_read`, `search_count`.

## Basic Structure

A domain is an array of conditions. Each condition is a 3-element array:
```json
["field_name", "operator", "value"]
```

## Operators

### Comparison
| Operator | Example |
|----------|---------|
| `=` | `["state", "=", "draft"]` |
| `!=` | `["state", "!=", "cancel"]` |
| `>` | `["amount", ">", 1000]` |
| `>=` | `["date", ">=", "2024-01-01"]` |
| `<` | `["quantity", "<", 10]` |
| `<=` | `["date", "<=", "2024-12-31"]` |

### String Matching
| Operator | Description | Example |
|----------|-------------|---------|
| `like` | Case-sensitive pattern | `["name", "like", "John%"]` |
| `ilike` | Case-insensitive pattern | `["email", "ilike", "%@gmail.com"]` |
| `=like` | Exact pattern | `["code", "=like", "SO%"]` |
| `=ilike` | Exact pattern (case-insensitive) | `["code", "=ilike", "so%"]` |

Pattern characters: `%` = any string, `_` = single character

### List Membership
| Operator | Example |
|----------|---------|
| `in` | `["state", "in", ["draft", "sent"]]` |
| `not in` | `["id", "not in", [1, 2, 3]]` |

### Hierarchy
| Operator | Description |
|----------|-------------|
| `child_of` | Record or its descendants |
| `parent_of` | Record or its ancestors |

## Combining Conditions

Default is AND. Use prefix operators for OR/NOT (Polish notation):

```json
// AND (implicit) - all must match
[["state", "=", "draft"], ["amount", ">", 1000]]

// OR - either matches
["|", ["state", "=", "draft"], ["state", "=", "sent"]]

// NOT
["!", ["state", "=", "cancel"]]

// Complex: (state=draft OR state=sent) AND amount>1000
["&",
  "|", ["state", "=", "draft"], ["state", "=", "sent"],
  ["amount", ">", 1000]
]
```

## Related Fields

Use dot notation to filter by related record fields:

```json
// Partners in UK
[["country_id.code", "=", "GB"]]

// Invoices where partner name contains "acme"
[["partner_id.name", "ilike", "acme"]]
```

## Common Patterns

### Dates
```json
// Exact date
[["date", "=", "2024-01-15"]]

// Date range
[["date", ">=", "2024-01-01"], ["date", "<", "2024-02-01"]]
```

### Booleans
```json
[["active", "=", true]]
[["is_company", "=", false]]
```

### Null/Empty Checks
```json
// Field is not set
[["parent_id", "=", false]]

// Field is set (has value)
[["email", "!=", false]]
```

### Multiple Values
```json
[["state", "in", ["draft", "open", "paid"]]]
```

### Exclude Records
```json
[["id", "not in", [1, 2, 3]]]
```

## Full Examples

```json
// Active companies in US or UK
execute_method("res.partner", "search_read", [
  ["&",
    ["is_company", "=", true],
    "|", ["country_id.code", "=", "US"], ["country_id.code", "=", "GB"]
  ]
], {"fields": ["name", "email"], "limit": 50})

// Draft invoices over $1000 from this month
execute_method("account.move", "search_read", [
  [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "draft"],
    ["amount_total", ">", 1000],
    ["invoice_date", ">=", "2024-01-01"],
    ["invoice_date", "<", "2024-02-01"]
  ]
], {"fields": ["name", "partner_id", "amount_total"]})
```
