import { describe, expect, it } from "vitest";
import { MockClientBuilder } from "../test-utils/mock-client.js";
import {
  handleModelResource,
  handleModelsResource,
  handleRecordResource,
  handleSearchResource,
} from "./odoo-resources.js";

describe("odoo-resources", () => {
  describe("handleModelsResource", () => {
    it("should return all models from client", async () => {
      const mockModels = [
        { model: "res.partner", name: "Contact" },
        { model: "hr.employee", name: "Employee" },
      ];
      const client = new MockClientBuilder().withModels(mockModels).build();

      const result = await handleModelsResource(client);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("odoo://models");
      expect(result.contents[0].mimeType).toBe("application/json");
      expect(JSON.parse(result.contents[0].text)).toEqual(mockModels);
    });

    it("should handle empty models list", async () => {
      const client = new MockClientBuilder().withModels([]).build();

      const result = await handleModelsResource(client);

      expect(result.contents).toHaveLength(1);
      expect(JSON.parse(result.contents[0].text)).toEqual([]);
    });
  });

  describe("handleModelResource", () => {
    it("should return model info with fields", async () => {
      const mockModelInfo = {
        model: "res.partner",
        name: "Contact",
        info: "Contact model",
      };
      const mockFields = {
        name: { type: "char", string: "Name" },
        email: { type: "char", string: "Email" },
      };
      const client = new MockClientBuilder()
        .withModelInfo("res.partner", mockModelInfo)
        .withModelFields("res.partner", mockFields)
        .build();

      const result = await handleModelResource(client, "res.partner");

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("odoo://model/res.partner");
      expect(result.contents[0].mimeType).toBe("application/json");
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.model).toBe("res.partner");
      expect(parsed.name).toBe("Contact");
      expect(parsed.fields).toEqual(mockFields);
    });

    it("should return error for non-existent model", async () => {
      const client = new MockClientBuilder()
        .withModelInfo("unknown.model", { error: "Model not found" })
        .build();

      const result = await handleModelResource(client, "unknown.model");

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBe("Model not found");
    });

    it("should handle getModelInfo throwing error", async () => {
      const client = new MockClientBuilder().build();
      // Override getModelInfo to throw
      client.getModelInfo = async () => {
        throw new Error("Connection failed");
      };

      const result = await handleModelResource(client, "res.partner");

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toContain("Connection failed");
    });
  });

  describe("handleRecordResource", () => {
    it("should return a single record by ID", async () => {
      const mockRecord = { id: 1, name: "John Doe", email: "john@example.com" };
      const client = new MockClientBuilder()
        .withReadRecordsResults("res.partner:1", [mockRecord])
        .build();

      const result = await handleRecordResource(client, "res.partner", "1");

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("odoo://record/res.partner/1");
      expect(result.contents[0].mimeType).toBe("application/json");
      expect(JSON.parse(result.contents[0].text)).toEqual(mockRecord);
    });

    it("should return error for record not found", async () => {
      const client = new MockClientBuilder()
        .withReadRecordsResults("res.partner:999", [])
        .build();

      const result = await handleRecordResource(client, "res.partner", "999");

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toContain("Record not found");
      expect(parsed.error).toContain("999");
    });

    it("should return error for invalid record ID", async () => {
      const client = new MockClientBuilder().build();

      const result = await handleRecordResource(client, "res.partner", "abc");

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toContain("Invalid record ID");
    });

    it("should handle readRecords throwing error", async () => {
      const client = new MockClientBuilder().build();
      client.readRecords = async () => {
        throw new Error("Access denied");
      };

      const result = await handleRecordResource(client, "res.partner", "1");

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toContain("Access denied");
    });
  });

  describe("handleSearchResource", () => {
    it("should search records with domain", async () => {
      const mockResults = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const domain = [["active", "=", true]];
      const encodedDomain = encodeURIComponent(JSON.stringify(domain));
      const client = new MockClientBuilder()
        .withSearchReadResults("res.partner", mockResults)
        .build();

      const result = await handleSearchResource(
        client,
        "res.partner",
        encodedDomain,
      );

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toContain("odoo://search/res.partner/");
      expect(result.contents[0].mimeType).toBe("application/json");
      expect(JSON.parse(result.contents[0].text)).toEqual(mockResults);
    });

    it("should handle empty search results", async () => {
      const domain = [["name", "=", "nonexistent"]];
      const encodedDomain = encodeURIComponent(JSON.stringify(domain));
      const client = new MockClientBuilder()
        .withSearchReadResults("res.partner", [])
        .build();

      const result = await handleSearchResource(
        client,
        "res.partner",
        encodedDomain,
      );

      expect(result.contents).toHaveLength(1);
      expect(JSON.parse(result.contents[0].text)).toEqual([]);
    });

    it("should return error for invalid domain JSON", async () => {
      const client = new MockClientBuilder().build();

      const result = await handleSearchResource(
        client,
        "res.partner",
        "not-valid-json",
      );

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBeDefined();
    });

    it("should handle searchRead throwing error", async () => {
      const domain = [["active", "=", true]];
      const encodedDomain = encodeURIComponent(JSON.stringify(domain));
      const client = new MockClientBuilder().build();
      client.searchRead = async () => {
        throw new Error("Query failed");
      };

      const result = await handleSearchResource(
        client,
        "res.partner",
        encodedDomain,
      );

      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toContain("Query failed");
    });
  });
});
