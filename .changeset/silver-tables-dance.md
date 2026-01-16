---
"odoo-mcp": minor
---

# v1.2.0 - Excel File Conversion Tools

## Major New Features

### Excel to CSV Conversion (Jan 14)
Two new MCP tools for working with Excel files directly from Claude. The `list_excel_sheets` tool discovers available sheets in a workbook, while `convert_excel` converts sheets to CSV format for analysis. Supports .xlsx, .xls, and .ods formats using the SheetJS library. Handles CSV edge cases including commas, quotes, and newlines in cell values.

---

## Detailed Changelog by Date

### January 16, 2026

#### Configuration
- Add .odoo-mcp directory to gitignore for local docs/SOPs

### January 14, 2026

#### Excel Tools
- Add list_excel_sheets tool to discover sheets in Excel workbooks
- Add convert_excel tool to convert Excel sheets to CSV format
- Support .xlsx, .xls, and .ods file formats
- Handle CSV special characters (commas, quotes, newlines)
- Add 19 tests covering all conversion scenarios

#### Bug Fixes
- Fix non-null assertions in bulk integration tests (lint compliance)

#### Configuration
- Add example_import to gitignore
- Exclude test files from published npm package
