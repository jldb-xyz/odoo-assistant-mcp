# Odoo Domain Filter Syntax

## Basic Structure

A domain is a list of criteria used to filter records. Each criterion is a tuple:
```
(field_name, operator, value)
```

## Operators

### Comparison Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `('state', '=', 'draft')` |
| `!=` | Not equals | `('state', '!=', 'cancel')` |
| `>` | Greater than | `('amount', '>', 1000)` |
| `>=` | Greater or equal | `('date', '>=', '2024-01-01')` |
| `<` | Less than | `('quantity', '<', 10)` |
| `<=` | Less or equal | `('date', '<=', '2024-12-31')` |

### String Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `like` | Pattern match (case-sensitive) | `('name', 'like', 'John%')` |
| `ilike` | Pattern match (case-insensitive) | `('email', 'ilike', '%@gmail.com')` |
| `=like` | Exact pattern match | `('code', '=like', 'SO%')` |
| `=ilike` | Exact pattern (case-insensitive) | `('code', '=ilike', 'so%')` |

**Pattern characters:**
- `%` - Match any string
- `_` - Match single character

### List Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Value in list | `('state', 'in', ['draft', 'sent'])` |
| `not in` | Value not in list | `('id', 'not in', [1, 2, 3])` |

### Relational Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `child_of` | Is child of (hierarchical) | `('category_id', 'child_of', parent_id)` |
| `parent_of` | Is parent of (hierarchical) | `('category_id', 'parent_of', child_id)` |

## Logical Operators

Combine criteria with logical operators (Polish notation):

| Operator | Description |
|----------|-------------|
| `&` | AND (default) |
| `\|` | OR |
| `!` | NOT |

### Examples

**AND (implicit):**
```python
# All criteria must match (AND is default)
[('state', '=', 'draft'), ('amount', '>', 1000)]
# Equivalent to:
['&', ('state', '=', 'draft'), ('amount', '>', 1000)]
```

**OR:**
```python
# Either criterion matches
['|', ('state', '=', 'draft'), ('state', '=', 'sent')]
```

**Complex combinations:**
```python
# (state = 'draft' OR state = 'sent') AND amount > 1000
['&',
    '|', ('state', '=', 'draft'), ('state', '=', 'sent'),
    ('amount', '>', 1000)
]
```

**NOT:**
```python
# NOT (state = 'cancel')
['!', ('state', '=', 'cancel')]
```

## Searching Related Fields

Use dot notation for related fields:

```python
# Search invoices by partner country
[('partner_id.country_id.code', '=', 'GB')]

# Search by related record name
[('partner_id.name', 'ilike', 'acme')]
```

## Special Values

### Dates
```python
# Exact date
[('date', '=', '2024-01-15')]

# Date range
[('date', '>=', '2024-01-01'), ('date', '<=', '2024-12-31')]
```

### Boolean
```python
[('active', '=', True)]
[('is_company', '=', False)]
```

### Null/Empty
```python
# Field is not set
[('parent_id', '=', False)]

# Field is set
[('email', '!=', False)]
```

### Current User
In Odoo (not via XML-RPC directly):
```python
[('user_id', '=', uid)]  # Pass uid from authentication
```

## Common Patterns

### Active Records Only (default)
```python
[('active', '=', True)]
# Or use context: {'active_test': False} to include archived
```

### Date Ranges
```python
# This month's invoices
[('invoice_date', '>=', '2024-01-01'), ('invoice_date', '<', '2024-02-01')]
```

### Multiple States
```python
[('state', 'in', ['draft', 'open', 'paid'])]
```

### Exclude Specific Records
```python
[('id', 'not in', [1, 2, 3])]
```

### Search by Display Name
```python
# For many2one fields, you can sometimes search by name
[('partner_id', 'ilike', 'John')]  # May work depending on model
# More reliable:
[('partner_id.name', 'ilike', 'John')]
```

## XML-RPC Domain Format

When passing via XML-RPC, domains are JSON arrays:

```json
[["state", "=", "draft"], ["amount", ">", 1000]]
```

With OR:
```json
["|", ["state", "=", "draft"], ["state", "=", "sent"]]
```
