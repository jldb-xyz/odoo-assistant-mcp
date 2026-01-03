import { describe, expect, it } from "vitest";
import { normalizeDomain, validateDomain } from "./domain-utils.js";

describe("domain-utils", () => {
  describe("normalizeDomain", () => {
    describe("null/undefined handling", () => {
      it("returns empty array for null", () => {
        expect(normalizeDomain(null)).toEqual([]);
      });

      it("returns empty array for undefined", () => {
        expect(normalizeDomain(undefined)).toEqual([]);
      });
    });

    describe("array domain handling", () => {
      it("passes through valid domain array", () => {
        const domain = [["name", "=", "test"]];
        expect(normalizeDomain(domain)).toEqual([["name", "=", "test"]]);
      });

      it("wraps single condition tuple into array", () => {
        expect(normalizeDomain(["name", "=", "test"])).toEqual([
          ["name", "=", "test"],
        ]);
      });

      it("handles multiple conditions", () => {
        const domain = [
          ["name", "ilike", "john"],
          ["active", "=", true],
        ];
        expect(normalizeDomain(domain)).toEqual(domain);
      });

      it("returns empty array for empty input", () => {
        expect(normalizeDomain([])).toEqual([]);
      });

      it("preserves logical operators", () => {
        const domain = ["|", ["name", "=", "a"], ["name", "=", "b"]];
        expect(normalizeDomain(domain)).toEqual(domain);
      });

      it("handles & operator", () => {
        const domain = ["&", ["a", "=", 1], ["b", "=", 2]];
        expect(normalizeDomain(domain)).toEqual(domain);
      });

      it("handles ! operator", () => {
        const domain = ["!", ["active", "=", false]];
        expect(normalizeDomain(domain)).toEqual(domain);
      });

      it("handles double-wrapped single condition", () => {
        // The code unwraps [[domain]] -> normalizeArrayDomain(domain)
        // For [[condition]], this extracts [condition] which gets wrapped into [[condition]]
        const input = [[["name", "=", "test"]]];
        expect(normalizeDomain(input)).toEqual([["name", "=", "test"]]);
      });
    });

    describe("string domain handling (JSON)", () => {
      it("parses JSON array domain", () => {
        const json = '[["name", "=", "test"]]';
        expect(normalizeDomain(json)).toEqual([["name", "=", "test"]]);
      });

      it("parses JSON single condition", () => {
        const json = '["name", "=", "test"]';
        expect(normalizeDomain(json)).toEqual([["name", "=", "test"]]);
      });

      it("returns empty array for invalid JSON", () => {
        expect(normalizeDomain("not valid json")).toEqual([]);
      });

      it("returns empty array for empty string", () => {
        expect(normalizeDomain("")).toEqual([]);
      });
    });

    describe("object domain handling", () => {
      it("converts object with conditions to array", () => {
        const obj = {
          conditions: [{ field: "name", operator: "=", value: "test" }],
        };
        expect(normalizeDomain(obj)).toEqual([["name", "=", "test"]]);
      });

      it("handles multiple conditions in object format", () => {
        const obj = {
          conditions: [
            { field: "name", operator: "ilike", value: "john" },
            { field: "active", operator: "=", value: true },
          ],
        };
        expect(normalizeDomain(obj)).toEqual([
          ["name", "ilike", "john"],
          ["active", "=", true],
        ]);
      });

      it("filters invalid conditions from object", () => {
        const obj = {
          conditions: [
            { field: "name", operator: "=", value: "test" },
            { invalid: true }, // should be filtered
            { field: "active", operator: "=", value: true },
          ],
        };
        expect(normalizeDomain(obj)).toEqual([
          ["name", "=", "test"],
          ["active", "=", true],
        ]);
      });

      it("returns empty array for object without conditions", () => {
        expect(normalizeDomain({ foo: "bar" })).toEqual([]);
      });
    });

    describe("edge cases", () => {
      it("handles various value types", () => {
        const domain = [
          ["string_field", "=", "text"],
          ["number_field", ">", 42],
          ["bool_field", "=", true],
          ["null_field", "=", null],
          ["list_field", "in", [1, 2, 3]],
        ];
        expect(normalizeDomain(domain)).toEqual(domain);
      });

      it("handles complex nested operators", () => {
        const domain = ["&", "|", ["a", "=", 1], ["b", "=", 2], ["c", "=", 3]];
        expect(normalizeDomain(domain)).toEqual(domain);
      });
    });
  });

  describe("validateDomain", () => {
    it("passes valid conditions", () => {
      const domain = [["name", "=", "test"]];
      expect(validateDomain(domain as never)).toEqual(domain);
    });

    it("passes valid operators", () => {
      const domain = ["|", ["a", "=", 1], ["b", "=", 2]];
      expect(validateDomain(domain as never)).toEqual(domain);
    });

    it("filters invalid conditions", () => {
      const domain = [
        ["valid", "=", "yes"],
        "invalid_string",
        ["also_valid", "=", "yes"],
      ];
      expect(validateDomain(domain as never)).toEqual([
        ["valid", "=", "yes"],
        ["also_valid", "=", "yes"],
      ]);
    });

    it("filters conditions with wrong tuple length", () => {
      const domain = [
        ["valid", "=", "yes"],
        ["only", "two"], // only 2 elements
        ["four", "elements", "here", "extra"], // 4 elements
      ];
      expect(validateDomain(domain as never)).toEqual([["valid", "=", "yes"]]);
    });

    it("filters conditions with non-string field", () => {
      const domain = [
        ["valid", "=", "yes"],
        [123, "=", "invalid"], // number field
      ];
      expect(validateDomain(domain as never)).toEqual([["valid", "=", "yes"]]);
    });

    it("returns empty array for all invalid", () => {
      const domain = [["invalid"], [1, 2, 3], "bad"];
      expect(validateDomain(domain as never)).toEqual([]);
    });
  });
});
