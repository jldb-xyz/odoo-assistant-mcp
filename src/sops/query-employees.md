# Querying Employees in Odoo

This SOP describes how to search for and retrieve employee information using the Odoo HR module.

## Quick Search by Name

Use `name_search` for finding employees by partial name match:

```
Model: hr.employee
Method: name_search
Args: []
Kwargs: { name: "search term", limit: 20 }
```

**Response format:** Array of `[id, display_name]` tuples.

### Example

Search for employees named "John":

```json
{
  "model": "hr.employee",
  "method": "name_search",
  "args": [],
  "kwargs": { "name": "John", "limit": 10 }
}
```

Response:
```json
[[42, "John Smith"], [87, "John Doe"]]
```

## Full Employee Records

To get complete employee records with all fields:

```
Model: hr.employee
Method: search_read
Args: [[domain]]
Kwargs: { fields: [...], limit: n }
```

### Common Fields

- `id` - Employee ID
- `name` - Full name
- `work_email` - Work email address
- `department_id` - Department (returns `[id, name]`)
- `job_id` - Job position (returns `[id, name]`)
- `parent_id` - Manager (returns `[id, name]`)
- `coach_id` - Coach (returns `[id, name]`)
- `active` - Whether employee is active

### Example: Get Active Employees in Department

```json
{
  "model": "hr.employee",
  "method": "search_read",
  "args": [
    [
      ["active", "=", true],
      ["department_id", "=", 5]
    ]
  ],
  "kwargs": {
    "fields": ["name", "work_email", "job_id"],
    "limit": 50
  }
}
```

## Related Models

- `hr.department` - Departments
- `hr.job` - Job positions
- `hr.employee.category` - Employee tags
- `resource.calendar` - Working schedules
