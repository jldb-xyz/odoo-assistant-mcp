# Querying Leave/Holiday Calendar in Odoo

This SOP describes how to query employee leave (holidays, time off, absences) from the Odoo HR Leave module.

## Important: Date Range Domain

The leave calendar model uses datetime fields with specific timezone handling. When querying a date range, use this domain pattern:

```
Model: hr.leave.report.calendar
Method: search_read
Domain pattern:
  ["&",
    ["start_datetime", "<=", "{end_date} 22:59:59"],
    ["stop_datetime", ">=", "{start_date_minus_one} 23:00:00"]]
```

**Critical:** Subtract one day from your start date and use `23:00:00` as the time to correctly capture leaves that span midnight boundaries.

## Example: Query Leaves for January 2024

To find all leaves between January 1-31, 2024:

1. End date: `2024-01-31`
2. Start date minus one day: `2023-12-31` (subtract 1 from Jan 1)

```json
{
  "model": "hr.leave.report.calendar",
  "method": "search_read",
  "args": [
    [
      "&",
      ["start_datetime", "<=", "2024-01-31 22:59:59"],
      ["stop_datetime", ">=", "2023-12-31 23:00:00"]
    ]
  ],
  "kwargs": {
    "fields": ["display_name", "employee_id", "start_datetime", "stop_datetime", "name", "state"]
  }
}
```

## Filtering by Employee

Add the employee filter to the domain:

```json
{
  "model": "hr.leave.report.calendar",
  "method": "search_read",
  "args": [
    [
      "&",
      ["start_datetime", "<=", "2024-01-31 22:59:59"],
      ["stop_datetime", ">=", "2023-12-31 23:00:00"],
      ["employee_id", "=", 42]
    ]
  ]
}
```

## Key Fields

- `display_name` - Formatted display name (e.g., "John Doe - Vacation")
- `employee_id` - Employee reference `[id, name]`
- `start_datetime` - Leave start (datetime string)
- `stop_datetime` - Leave end (datetime string)
- `name` - Leave type name
- `state` - Status: `draft`, `confirm`, `validate`, `refuse`

## Leave States

- `draft` - To Submit (not yet requested)
- `confirm` - To Approve (pending approval)
- `validate` - Approved
- `refuse` - Refused

To get only approved leaves, add: `["state", "=", "validate"]`

## Related Models

- `hr.leave` - Leave requests (for creating/modifying)
- `hr.leave.type` - Leave types (vacation, sick, etc.)
- `hr.leave.allocation` - Leave allocations
- `hr.employee` - Employee records
