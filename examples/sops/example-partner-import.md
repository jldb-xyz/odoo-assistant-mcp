# Partner Import SOP

Import partners from a CSV file with proper validation and batching.

## When to Use
- Bulk importing customers or vendors from external systems
- Migrating partner data from another ERP

## Prerequisites
- CSV file with columns: name, email, phone, country_code
- User has create access to res.partner

## Steps

1. **Validate the CSV data**
   - Ensure all required fields (name) are present
   - Validate email formats where provided
   - Note any country codes that need lookup

2. **Look up country IDs for each unique country code**
   ```json
   execute_method("res.country", "search", [[["code", "=", "US"]]])
   ```

3. **Create partners in batches of 50-100**
   - Disable tracking for performance
   ```json
   execute_method("res.partner", "create", [
     [
       {"name": "Acme Corp", "email": "info@acme.com", "country_id": 233},
       {"name": "Globex Inc", "email": "hello@globex.com", "country_id": 233}
     ]
   ], {"context": {"tracking_disable": true, "mail_create_nolog": true}})
   ```

4. **Verify the import**
   - Count created records vs expected
   - Spot-check a few records for data accuracy

## Error Handling
- If a batch fails, log the failed records and continue with the next batch
- Common issues: duplicate emails, invalid country codes, missing required fields
