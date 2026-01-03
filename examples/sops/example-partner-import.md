# Partner Import SOP

## Prerequisites
- CSV file with columns: name, email, phone, country_code
- Access to res.partner model

## Steps

1. **Validate data format**
   - Ensure all required fields present
   - Validate email format
   - Map country_code to country_id

2. **Lookup dependencies**
   ```python
   # Get country ID
   country_ids = execute_kw('res.country', 'search', [[['code', '=', country_code]]])
   ```

3. **Create partners in batches**
   - Batch size: 100 records
   - Use context: `{'tracking_disable': True}`

4. **Verify import**
   - Count created records
   - Sample check 5 random records
