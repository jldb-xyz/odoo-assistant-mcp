import XLSX from "xlsx";
import { z } from "zod";
import { defineTool } from "./registry.js";

/**
 * Tool to list sheets in an Excel file
 */
export const listExcelSheetsTool = defineTool({
  name: "list_excel_sheets",
  description:
    "List available sheets in an Excel file. Use this to discover sheet names before converting specific sheets to CSV.",
  inputSchema: {
    file_path: z
      .string()
      .describe("Absolute path to the Excel file (.xlsx, .xls, .ods)"),
  },
  handler: async (_client, input) => {
    try {
      const workbook = XLSX.readFile(input.file_path);
      return {
        success: true,
        result: {
          sheets: workbook.SheetNames,
          active_sheet: workbook.SheetNames[0] || null,
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
  description:
    "Convert an Excel file (or specific sheet) to CSV format. Returns CSV text that can be analyzed directly. For multi-sheet workbooks, use list_excel_sheets first to see available sheets.",
  inputSchema: {
    file_path: z
      .string()
      .describe("Absolute path to the Excel file (.xlsx, .xls, .ods)"),
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
      const workbook = XLSX.readFile(input.file_path);

      if (input.all_sheets) {
        const sheets: Record<string, string> = {};
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          if (sheet) {
            sheets[name] = XLSX.utils.sheet_to_csv(sheet);
          }
        }
        return {
          success: true,
          result: { sheets },
        };
      }

      const sheetName = input.sheet || workbook.SheetNames[0];
      if (!sheetName) {
        return {
          success: false,
          error: "Excel file has no sheets",
        };
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return {
          success: false,
          error: `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`,
        };
      }

      const csv = XLSX.utils.sheet_to_csv(sheet);
      return {
        success: true,
        result: { text: csv },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to convert Excel file: ${String(error)}`,
      };
    }
  },
});
