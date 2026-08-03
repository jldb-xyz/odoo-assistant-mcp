import ExcelJS from "exceljs";
import { z } from "zod";
import { defineTool } from "./registry.js";

/**
 * Convert a single ExcelJS cell value to its plain-text representation.
 *
 * ExcelJS returns rich objects for formulas, hyperlinks, rich text and errors;
 * flatten them all to the displayed text so the CSV matches what a user sees.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value) return String(value.text);
    if ("formula" in value || "sharedFormula" in value) {
      return value.result === undefined ? "" : cellToString(value.result);
    }
    if ("error" in value) return String(value.error);
  }
  return String(value);
}

/**
 * Escape a single field per RFC 4180: quote it when it contains a delimiter,
 * quote or line break, and double any embedded quotes.
 */
function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

/**
 * Serialize a worksheet to CSV. Returns an empty string for an empty sheet.
 */
function sheetToCsv(sheet: ExcelJS.Worksheet): string {
  const { rowCount, columnCount } = sheet;
  if (rowCount === 0 || columnCount === 0) return "";

  const lines: string[] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const fields: string[] = [];
    for (let c = 1; c <= columnCount; c++) {
      fields.push(escapeCsvField(cellToString(row.getCell(c).value)));
    }
    lines.push(fields.join(","));
  }
  return lines.join("\n");
}

/**
 * Read a workbook from disk. Errors propagate to the caller.
 */
async function readWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

/**
 * Tool to list sheets in an Excel file
 */
export const listExcelSheetsTool = defineTool({
  name: "list_excel_sheets",
  title: "List Excel Sheets",
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    "List available sheets in an Excel file. Use this to discover sheet names before converting specific sheets to CSV.",
  inputSchema: {
    file_path: z.string().describe("Absolute path to the Excel file (.xlsx)"),
  },
  handler: async (_client, input) => {
    try {
      const workbook = await readWorkbook(input.file_path);
      const sheets = workbook.worksheets.map((sheet) => sheet.name);
      return {
        success: true,
        result: {
          sheets,
          active_sheet: sheets[0] ?? null,
          file_path: input.file_path,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read Excel file: ${String(error)}`,
      };
    }
  },
});

/**
 * Tool to convert Excel file to CSV
 */
export const convertExcelTool = defineTool({
  name: "convert_excel",
  title: "Convert Excel to CSV",
  annotations: { readOnlyHint: true, openWorldHint: false },
  description:
    "Convert an Excel file (or specific sheet) to CSV format. Returns CSV text that can be analyzed directly. For multi-sheet workbooks, use list_excel_sheets first to see available sheets.",
  inputSchema: {
    file_path: z.string().describe("Absolute path to the Excel file (.xlsx)"),
    sheet: z
      .string()
      .optional()
      .describe("Specific sheet name to convert (default: first sheet)"),
    all_sheets: z
      .boolean()
      .optional()
      .describe(
        "Convert all sheets and return as object with sheet names as keys",
      ),
  },
  handler: async (_client, input) => {
    try {
      const workbook = await readWorkbook(input.file_path);

      if (input.all_sheets) {
        const sheets: Record<string, string> = {};
        for (const sheet of workbook.worksheets) {
          sheets[sheet.name] = sheetToCsv(sheet);
        }
        return { success: true, result: { sheets } };
      }

      const target = input.sheet
        ? workbook.worksheets.find((sheet) => sheet.name === input.sheet)
        : workbook.worksheets[0];

      if (!target) {
        if (input.sheet) {
          const available = workbook.worksheets
            .map((sheet) => sheet.name)
            .join(", ");
          return {
            success: false,
            error: `Sheet "${input.sheet}" not found. Available sheets: ${available}`,
          };
        }
        return { success: false, error: "Excel file has no sheets" };
      }

      return { success: true, result: { text: sheetToCsv(target) } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to convert Excel file: ${String(error)}`,
      };
    }
  },
});
