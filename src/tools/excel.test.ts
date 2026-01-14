import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { convertExcelTool, listExcelSheetsTool } from "./excel.js";

describe("excel tools", () => {
  // Use null as client since these tools don't use it
  const mockClient = null as unknown as Parameters<
    typeof listExcelSheetsTool.handler
  >[0];

  let testDir: string;
  let simplePath: string;
  let multiSheetPath: string;
  let emptyPath: string;
  let specialCharsPath: string;
  let corruptedPath: string;

  beforeAll(() => {
    // Create temp directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "excel-test-"));

    // Create simple.xlsx - single sheet with basic data
    const simpleWb = XLSX.utils.book_new();
    const simpleData = [
      ["Name", "Value"],
      ["Alice", 100],
      ["Bob", 200],
    ];
    XLSX.utils.book_append_sheet(
      simpleWb,
      XLSX.utils.aoa_to_sheet(simpleData),
      "Sheet1",
    );
    simplePath = path.join(testDir, "simple.xlsx");
    XLSX.writeFile(simpleWb, simplePath);

    // Create multi-sheet.xlsx - multiple sheets
    const multiWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      multiWb,
      XLSX.utils.aoa_to_sheet([
        ["Col1", "Col2"],
        ["A1", "B1"],
      ]),
      "Sheet1",
    );
    XLSX.utils.book_append_sheet(
      multiWb,
      XLSX.utils.aoa_to_sheet([
        ["Data1", "Data2"],
        ["X", "Y"],
      ]),
      "Data",
    );
    XLSX.utils.book_append_sheet(
      multiWb,
      XLSX.utils.aoa_to_sheet([["Summary"]]),
      "Summary",
    );
    multiSheetPath = path.join(testDir, "multi-sheet.xlsx");
    XLSX.writeFile(multiWb, multiSheetPath);

    // Create empty.xlsx - workbook with empty sheet
    const emptyWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(emptyWb, XLSX.utils.aoa_to_sheet([]), "Empty");
    emptyPath = path.join(testDir, "empty.xlsx");
    XLSX.writeFile(emptyWb, emptyPath);

    // Create special-chars.xlsx - data with CSV edge cases
    const specialWb = XLSX.utils.book_new();
    const specialData = [
      ["Field", "Value"],
      ["With,Comma", "test1"],
      ['With"Quote', "test2"],
      ["With\nNewline", "test3"],
      ["Normal", "test4"],
    ];
    XLSX.utils.book_append_sheet(
      specialWb,
      XLSX.utils.aoa_to_sheet(specialData),
      "Sheet1",
    );
    specialCharsPath = path.join(testDir, "special-chars.xlsx");
    XLSX.writeFile(specialWb, specialCharsPath);

    // Create corrupted file - use random binary that can't be parsed
    corruptedPath = path.join(testDir, "corrupted.xlsx");
    const randomBytes = Buffer.alloc(100);
    for (let i = 0; i < 100; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
    fs.writeFileSync(corruptedPath, randomBytes);
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("listExcelSheetsTool", () => {
    it("should have correct metadata", () => {
      expect(listExcelSheetsTool.name).toBe("list_excel_sheets");
      expect(listExcelSheetsTool.description).toContain(
        "List available sheets",
      );
      expect(listExcelSheetsTool.inputSchema).toHaveProperty("file_path");
    });

    it("should list all sheets in a multi-sheet workbook", async () => {
      const result = await listExcelSheetsTool.handler(mockClient, {
        file_path: multiSheetPath,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        sheets: string[];
        active_sheet: string;
        file_path: string;
      };
      expect(data.sheets).toEqual(["Sheet1", "Data", "Summary"]);
      expect(data.active_sheet).toBe("Sheet1");
    });

    it("should handle single-sheet workbook", async () => {
      const result = await listExcelSheetsTool.handler(mockClient, {
        file_path: simplePath,
      });

      expect(result.success).toBe(true);
      const data = result.result as { sheets: string[] };
      expect(data.sheets).toHaveLength(1);
      expect(data.sheets[0]).toBe("Sheet1");
    });

    it("should include file_path in result", async () => {
      const result = await listExcelSheetsTool.handler(mockClient, {
        file_path: simplePath,
      });

      expect(result.success).toBe(true);
      const data = result.result as { file_path: string };
      expect(data.file_path).toBe(simplePath);
    });

    it("should return error for non-existent file", async () => {
      const result = await listExcelSheetsTool.handler(mockClient, {
        file_path: "/does/not/exist.xlsx",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOENT");
    });

    it("should handle corrupted file gracefully", async () => {
      // xlsx library is lenient and may parse corrupted files as empty workbooks
      // Our tool should not crash regardless of what xlsx does
      const result = await listExcelSheetsTool.handler(mockClient, {
        file_path: corruptedPath,
      });

      // Either succeeds with empty/partial data or fails gracefully
      expect(typeof result.success).toBe("boolean");
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("convertExcelTool", () => {
    it("should have correct metadata", () => {
      expect(convertExcelTool.name).toBe("convert_excel");
      expect(convertExcelTool.description).toContain("CSV");
      expect(convertExcelTool.inputSchema).toHaveProperty("file_path");
      expect(convertExcelTool.inputSchema).toHaveProperty("sheet");
      expect(convertExcelTool.inputSchema).toHaveProperty("all_sheets");
    });

    describe("single sheet mode", () => {
      it("should convert first sheet by default", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: simplePath,
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        expect(data.text).toContain("Name,Value");
        expect(data.text).toContain("Alice,100");
        expect(data.text).toContain("Bob,200");
      });

      it("should convert specific sheet by name", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: multiSheetPath,
          sheet: "Data",
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        expect(data.text).toContain("Data1,Data2");
        expect(data.text).toContain("X,Y");
      });

      it("should return error for non-existent sheet", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: multiSheetPath,
          sheet: "DoesNotExist",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
        expect(result.error).toContain("Available sheets:");
        expect(result.error).toContain("Sheet1");
        expect(result.error).toContain("Data");
        expect(result.error).toContain("Summary");
      });

      it("should handle empty sheet", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: emptyPath,
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        expect(data.text).toBe("");
      });
    });

    describe("all_sheets mode", () => {
      it("should convert all sheets to object", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: multiSheetPath,
          all_sheets: true,
        });

        expect(result.success).toBe(true);
        const data = result.result as { sheets: Record<string, string> };
        expect(data.sheets).toHaveProperty("Sheet1");
        expect(data.sheets).toHaveProperty("Data");
        expect(data.sheets).toHaveProperty("Summary");
        expect(data.sheets.Sheet1).toContain("Col1,Col2");
        expect(data.sheets.Data).toContain("Data1,Data2");
        expect(data.sheets.Summary).toContain("Summary");
      });

      it("should handle workbook with single sheet", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: simplePath,
          all_sheets: true,
        });

        expect(result.success).toBe(true);
        const data = result.result as { sheets: Record<string, string> };
        expect(Object.keys(data.sheets)).toHaveLength(1);
        expect(data.sheets.Sheet1).toContain("Name,Value");
      });

      it("should return empty strings for empty sheets", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: emptyPath,
          all_sheets: true,
        });

        expect(result.success).toBe(true);
        const data = result.result as { sheets: Record<string, string> };
        expect(data.sheets.Empty).toBe("");
      });
    });

    describe("CSV formatting", () => {
      it("should properly escape commas in values", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: specialCharsPath,
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        // CSV should quote fields containing commas
        expect(data.text).toContain('"With,Comma"');
      });

      it("should properly escape quotes in values", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: specialCharsPath,
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        // CSV should double-escape quotes inside quoted fields
        expect(data.text).toContain('"With""Quote"');
      });

      it("should handle newlines in cell values", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: specialCharsPath,
        });

        expect(result.success).toBe(true);
        const data = result.result as { text: string };
        // CSV should quote fields containing newlines
        expect(data.text).toMatch(/"With\nNewline"/);
      });
    });

    describe("error handling", () => {
      it("should return error for non-existent file", async () => {
        const result = await convertExcelTool.handler(mockClient, {
          file_path: "/does/not/exist.xlsx",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("ENOENT");
      });

      it("should handle corrupted file gracefully", async () => {
        // xlsx library is lenient and may parse corrupted files as empty workbooks
        // Our tool should not crash regardless of what xlsx does
        const result = await convertExcelTool.handler(mockClient, {
          file_path: corruptedPath,
        });

        // Either succeeds with empty/partial data or fails gracefully
        expect(typeof result.success).toBe("boolean");
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });
});
