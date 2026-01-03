# Odoo Accounting: Journal Entries & Invoices (account.move)

## Overview

In Odoo, `account.move` is the central model for all accounting entries:
- Journal entries
- Customer invoices / Credit notes
- Vendor bills / Refunds
- Bank statements

## Key Fields

### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| `move_type` | Selection | Type of entry (see below) |
| `journal_id` | Many2one | Target journal |
| `date` | Date | Accounting date |
| `currency_id` | Many2one | Transaction currency |
| `state` | Selection | draft, posted, cancel |

### Move Types
| Value | Description |
|-------|-------------|
| `entry` | Journal Entry |
| `out_invoice` | Customer Invoice |
| `out_refund` | Customer Credit Note |
| `in_invoice` | Vendor Bill |
| `in_refund` | Vendor Credit Note |
| `out_receipt` | Sales Receipt |
| `in_receipt` | Purchase Receipt |

### Common Fields
| Field | Type | Description |
|-------|------|-------------|
| `partner_id` | Many2one | Customer/Vendor |
| `ref` | Char | Reference/description |
| `invoice_date` | Date | Invoice date (for invoices) |
| `invoice_date_due` | Date | Due date |
| `line_ids` | One2many | Journal items (account.move.line) |
| `invoice_line_ids` | One2many | Invoice lines (filtered view of line_ids) |

## Journal Entry Lines (account.move.line)

### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| `account_id` | Many2one | Account (account.account) |
| `name` | Char | Label/description |
| `debit` | Monetary | Debit amount |
| `credit` | Monetary | Credit amount |

### Common Fields
| Field | Type | Description |
|-------|------|-------------|
| `partner_id` | Many2one | Partner (for receivables/payables) |
| `quantity` | Float | Quantity (for invoice lines) |
| `price_unit` | Float | Unit price |
| `product_id` | Many2one | Product |
| `tax_ids` | Many2many | Taxes to apply |
| `analytic_distribution` | JSON | Analytic accounting |

## Creating Journal Entries

### Simple Journal Entry
```python
# Via XML-RPC
entry = execute_kw('account.move', 'create', [{
    'move_type': 'entry',
    'journal_id': journal_id,
    'date': '2024-01-15',
    'ref': 'Manual adjustment',
    'line_ids': [
        (0, 0, {
            'account_id': debit_account_id,
            'name': 'Debit line',
            'debit': 1000.00,
            'credit': 0,
        }),
        (0, 0, {
            'account_id': credit_account_id,
            'name': 'Credit line',
            'debit': 0,
            'credit': 1000.00,
        }),
    ]
}])
```

**Important**: Debits must equal credits or the entry will fail validation.

### Customer Invoice
```python
invoice = execute_kw('account.move', 'create', [{
    'move_type': 'out_invoice',
    'partner_id': customer_id,
    'invoice_date': '2024-01-15',
    'invoice_line_ids': [
        (0, 0, {
            'product_id': product_id,
            'quantity': 2,
            'price_unit': 100.00,
            'tax_ids': [(6, 0, [tax_id])],
        }),
    ]
}])
```

### Vendor Bill
```python
bill = execute_kw('account.move', 'create', [{
    'move_type': 'in_invoice',
    'partner_id': vendor_id,
    'invoice_date': '2024-01-15',
    'ref': 'VENDOR-INV-001',
    'invoice_line_ids': [
        (0, 0, {
            'product_id': product_id,
            'quantity': 1,
            'price_unit': 500.00,
        }),
    ]
}])
```

## Posting Entries

Entries are created in `draft` state. To post:

```python
# Post a single entry
execute_kw('account.move', 'action_post', [[move_id]])

# Post multiple entries
execute_kw('account.move', 'action_post', [[move_id1, move_id2, move_id3]])
```

## Related Models

### Journals (account.journal)
| Type | Code | Description |
|------|------|-------------|
| `sale` | INV | Customer Invoices |
| `purchase` | BILL | Vendor Bills |
| `bank` | BNK | Bank |
| `cash` | CSH | Cash |
| `general` | MISC | Miscellaneous |

### Accounts (account.account)
Key fields:
- `code` - Account code (e.g., "101100")
- `name` - Account name
- `account_type` - Type (asset, liability, equity, income, expense)
- `reconcile` - Whether account is reconcilable

### Common Account Types
| Type | Description |
|------|-------------|
| `asset_receivable` | Receivables (customer) |
| `liability_payable` | Payables (vendor) |
| `asset_cash` | Cash/Bank |
| `asset_current` | Current assets |
| `liability_current` | Current liabilities |
| `equity` | Equity |
| `income` | Revenue |
| `expense` | Expenses |

## Context Flags

Useful context for imports:

```python
context = {
    'check_move_validity': False,  # Skip balance check during creation
    'tracking_disable': True,       # Disable mail tracking (faster)
    'no_reset_password': True,      # For user creation
}
```

**Warning**: Use `check_move_validity: False` carefully - entries may be unbalanced.

## Common Gotchas

1. **Balanced entries**: Debits must equal credits
2. **Posted entries are immutable**: Cannot modify posted entries (must reverse)
3. **Sequence gaps**: Odoo tracks sequence integrity for legal compliance
4. **Lock dates**: Entries before lock date cannot be modified
5. **Tax calculation**: Use `tax_ids` on lines, Odoo calculates amounts
6. **Currency**: Foreign currency entries need proper rate handling
