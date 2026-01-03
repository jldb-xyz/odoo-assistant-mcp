import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkDomainValidity,
  explainField,
  getCreateRequirements,
  getModelRelations,
  getModelSchema,
  getRecordSample,
  getSelectionValues,
  listModels,
} from "../../tools/introspection.js";
import type { IOdooClient } from "../../types/index.js";
import {
  createTestClient,
  getOdooVersion,
  shouldSkipIntegrationTests,
  type TestClientResult,
} from "./setup/index.js";

describe(`introspection tools - Odoo ${getOdooVersion()}`, () => {
  let testClient: TestClientResult | null = null;
  let client: IOdooClient;
  let skipReason: string | null = null;

  beforeAll(async () => {
    skipReason = await shouldSkipIntegrationTests();
    if (skipReason) {
      console.log(`Skipping integration tests: ${skipReason}`);
      return;
    }

    testClient = await createTestClient();
    client = testClient.client;
  }, 60000);

  afterAll(async () => {
    if (testClient) {
      await testClient.cleanup();
    }
  });

  describe("list_models", () => {
    it("lists models without filter", async () => {
      if (skipReason) return;

      const result = await listModels(client, { limit: 10 });

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const data = result.result as {
        total_matched: number;
        showing: number;
        models: Array<{
          model: string;
          name: string;
          transient: boolean;
          field_count: number;
        }>;
      };

      expect(data.total_matched).toBeGreaterThan(0);
      expect(data.showing).toBeLessThanOrEqual(10);
      expect(data.models.length).toBeGreaterThan(0);

      // res.partner should exist in any Odoo installation
      // (May not be in first 10 due to alphabetical order, so just verify structure)
      expect(data.models[0]).toHaveProperty("model");
      expect(data.models[0]).toHaveProperty("name");
      expect(data.models[0]).toHaveProperty("transient");
      expect(data.models[0]).toHaveProperty("field_count");
    });

    it("filters models by name", async () => {
      if (skipReason) return;

      const result = await listModels(client, {
        filter: "partner",
        limit: 50,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        models: Array<{ model: string; name: string }>;
      };

      // All results should contain "partner" in model name or label
      for (const model of data.models) {
        const matchesFilter =
          model.model.toLowerCase().includes("partner") ||
          model.name.toLowerCase().includes("partner");
        expect(matchesFilter).toBe(true);
      }

      // res.partner should be in results
      expect(data.models.some((m) => m.model === "res.partner")).toBe(true);
    });

    it("filters by category core", async () => {
      if (skipReason) return;

      const result = await listModels(client, {
        category: "core",
        limit: 20,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        models: Array<{ model: string; transient: boolean }>;
      };

      // Core models should not be transient
      for (const model of data.models) {
        expect(model.transient).toBe(false);
      }
    });

    it("filters by category transient", async () => {
      if (skipReason) return;

      const result = await listModels(client, {
        category: "transient",
        limit: 20,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        models: Array<{ model: string; transient: boolean }>;
      };

      // All should be transient
      for (const model of data.models) {
        expect(model.transient).toBe(true);
      }
    });
  });

  describe("get_model_schema", () => {
    it("returns schema for res.partner", async () => {
      if (skipReason) return;

      const result = await getModelSchema(client, { model: "res.partner" });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        name: string;
        key_fields: Record<string, unknown>;
        relations: { outgoing: Record<string, unknown> };
        data_fields: Record<string, unknown>;
        field_count: number;
      };

      expect(data.model).toBe("res.partner");
      expect(data.name).toBeDefined();
      expect(data.field_count).toBeGreaterThan(0);

      // Key fields should include id and name
      expect(data.key_fields).toHaveProperty("id");
      expect(data.key_fields).toHaveProperty("name");
    });

    it("filters fields by type", async () => {
      if (skipReason) return;

      const result = await getModelSchema(client, {
        model: "res.partner",
        field_types: ["many2one"],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        relations: { outgoing: Record<string, { type: string }> };
      };

      // All relation fields should be many2one
      for (const [, def] of Object.entries(data.relations.outgoing)) {
        expect(def.type).toBe("many2one");
      }
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await getModelSchema(client, {
        model: "nonexistent.model.xyz",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("get_model_relations", () => {
    it("returns outgoing relations for res.partner", async () => {
      if (skipReason) return;

      const result = await getModelRelations(client, {
        model: "res.partner",
        direction: "outgoing",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        outgoing_relations: Array<{
          field: string;
          target_model: string;
          type: string;
        }>;
        summary: { outgoing_count: number };
      };

      expect(data.model).toBe("res.partner");
      expect(data.outgoing_relations).toBeDefined();
      expect(Array.isArray(data.outgoing_relations)).toBe(true);
      expect(data.summary.outgoing_count).toBeGreaterThanOrEqual(0);

      // res.partner has country_id relation
      const countryRelation = data.outgoing_relations.find(
        (r) => r.field === "country_id",
      );
      if (countryRelation) {
        expect(countryRelation.target_model).toBe("res.country");
        expect(countryRelation.type).toBe("many2one");
      }
    });

    it("returns incoming relations for res.partner", async () => {
      if (skipReason) return;

      const result = await getModelRelations(client, {
        model: "res.partner",
        direction: "incoming",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        incoming_relations: Array<{
          source_model: string;
          field: string;
          type: string;
        }>;
        summary: { incoming_count: number };
      };

      expect(data.incoming_relations).toBeDefined();
      expect(Array.isArray(data.incoming_relations)).toBe(true);
    });

    it("returns both directions", async () => {
      if (skipReason) return;

      const result = await getModelRelations(client, {
        model: "res.partner",
        direction: "both",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        outgoing_relations: unknown[];
        incoming_relations: unknown[];
      };

      expect(data.outgoing_relations).toBeDefined();
      expect(data.incoming_relations).toBeDefined();
    });
  });

  describe("get_create_requirements", () => {
    it("returns create requirements for res.partner", async () => {
      if (skipReason) return;

      const result = await getCreateRequirements(client, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        must_provide: Record<string, unknown>;
        has_defaults: Record<string, unknown>;
        minimal_payload_example: Record<string, unknown>;
        optional_field_count: number;
        guidance: string;
      };

      expect(data.model).toBe("res.partner");
      expect(data.must_provide).toBeDefined();
      expect(data.has_defaults).toBeDefined();
      expect(data.minimal_payload_example).toBeDefined();
      expect(data.optional_field_count).toBeGreaterThanOrEqual(0);
      expect(data.guidance).toBeDefined();
    });

    it("returns error for non-existent model", async () => {
      if (skipReason) return;

      const result = await getCreateRequirements(client, {
        model: "nonexistent.model.xyz",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("get_selection_values", () => {
    it("lists all selection fields on res.partner", async () => {
      if (skipReason) return;

      const result = await getSelectionValues(client, { model: "res.partner" });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        selection_fields: Array<{
          field: string;
          label: string;
          value_count: number;
        }>;
        count: number;
        guidance: string;
      };

      expect(data.model).toBe("res.partner");
      expect(data.selection_fields).toBeDefined();
      expect(Array.isArray(data.selection_fields)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    it("returns values for a specific selection field", async () => {
      if (skipReason) return;

      // res.partner has 'type' as a selection field
      const result = await getSelectionValues(client, {
        model: "res.partner",
        field: "type",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        field: string;
        values: Array<{ value: string; label: string }>;
        value_count: number;
      };

      expect(data.field).toBe("type");
      expect(data.values).toBeDefined();
      expect(Array.isArray(data.values)).toBe(true);
      expect(data.value_count).toBeGreaterThan(0);

      // Check value structure
      for (const val of data.values) {
        expect(val).toHaveProperty("value");
        expect(val).toHaveProperty("label");
      }
    });

    it("returns error for non-selection field", async () => {
      if (skipReason) return;

      const result = await getSelectionValues(client, {
        model: "res.partner",
        field: "name", // char field, not selection
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not selection");
    });
  });

  describe("explain_field", () => {
    it("explains a char field", async () => {
      if (skipReason) return;

      const result = await explainField(client, {
        model: "res.partner",
        field: "name",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        field: string;
        type: string;
        label: string;
        usage_guidance: string;
        example_value: unknown;
      };

      expect(data.model).toBe("res.partner");
      expect(data.field).toBe("name");
      expect(data.type).toBe("char");
      expect(data.label).toBeDefined();
      expect(data.usage_guidance).toBeDefined();
      expect(data.example_value).toBeDefined();
    });

    it("explains a many2one field", async () => {
      if (skipReason) return;

      const result = await explainField(client, {
        model: "res.partner",
        field: "country_id",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        type: string;
        relation: {
          target_model: string;
          relationship_type: string;
          description: string;
        };
      };

      expect(data.type).toBe("many2one");
      expect(data.relation).toBeDefined();
      expect(data.relation.target_model).toBe("res.country");
    });

    it("explains a selection field with values", async () => {
      if (skipReason) return;

      const result = await explainField(client, {
        model: "res.partner",
        field: "type",
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        type: string;
        selection_values: Array<{ value: string; label: string }>;
      };

      expect(data.type).toBe("selection");
      expect(data.selection_values).toBeDefined();
      expect(Array.isArray(data.selection_values)).toBe(true);
    });

    it("returns error for non-existent field", async () => {
      if (skipReason) return;

      const result = await explainField(client, {
        model: "res.partner",
        field: "nonexistent_field_xyz",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("get_record_sample", () => {
    it("returns a sample record from res.partner", async () => {
      if (skipReason) return;

      const result = await getRecordSample(client, { model: "res.partner" });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        record: Record<string, { value: unknown; type: string }> | null;
        field_count: number;
      };

      expect(data.model).toBe("res.partner");
      // There should be at least the admin partner
      expect(data.record).not.toBeNull();
      if (data.record) {
        expect(data.record.id).toBeDefined();
        expect(data.record.id.type).toBe("integer");
      }
    });

    it("returns sample with specific fields", async () => {
      if (skipReason) return;

      const result = await getRecordSample(client, {
        model: "res.partner",
        fields: ["id", "name", "email"],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        record: Record<string, { value: unknown; type: string }>;
        field_count: number;
      };

      expect(data.field_count).toBe(3);
      expect(data.record).toHaveProperty("id");
      expect(data.record).toHaveProperty("name");
      expect(data.record).toHaveProperty("email");
    });

    it("applies domain filter", async () => {
      if (skipReason) return;

      const result = await getRecordSample(client, {
        model: "res.partner",
        domain: [["is_company", "=", true]],
      });

      expect(result.success).toBe(true);
      // Result may be null if no companies exist, which is valid
    });

    it("returns error for invalid fields", async () => {
      if (skipReason) return;

      const result = await getRecordSample(client, {
        model: "res.partner",
        fields: ["nonexistent_field"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("validate_domain", () => {
    it("validates a correct domain", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: [
          ["name", "ilike", "test"],
          ["active", "=", true],
        ],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        model: string;
        valid: boolean;
        errors: string[];
        warnings: string[];
        validated_conditions: Array<{
          field: string;
          operator: string;
          value: unknown;
        }>;
      };

      expect(data.model).toBe("res.partner");
      expect(data.valid).toBe(true);
      expect(data.errors).toHaveLength(0);
      expect(data.validated_conditions).toHaveLength(2);
    });

    it("detects invalid field names", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: [["nonexistent_field", "=", "test"]],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        valid: boolean;
        errors: string[];
      };

      expect(data.valid).toBe(false);
      expect(data.errors.length).toBeGreaterThan(0);
      expect(data.errors[0]).toContain("not found");
    });

    it("detects invalid operators", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: [["name", "invalid_op", "test"]],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        valid: boolean;
        errors: string[];
      };

      expect(data.valid).toBe(false);
      expect(data.errors[0]).toContain("Invalid operator");
    });

    it("handles logical operators", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: ["|", ["name", "=", "test"], ["email", "ilike", "test"]],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        valid: boolean;
        validated_conditions: unknown[];
      };

      expect(data.valid).toBe(true);
      expect(data.validated_conditions).toHaveLength(2);
    });

    it("validates with test execution", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: [["active", "=", true]],
        test_execution: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        valid: boolean;
        execution_test: {
          success: boolean;
          count: number;
        };
      };

      expect(data.valid).toBe(true);
      expect(data.execution_test).toBeDefined();
      expect(data.execution_test.success).toBe(true);
      expect(typeof data.execution_test.count).toBe("number");
    });

    it("supports dotted field names for related fields", async () => {
      if (skipReason) return;

      const result = await checkDomainValidity(client, {
        model: "res.partner",
        domain: [["country_id.code", "=", "US"]],
      });

      expect(result.success).toBe(true);
      const data = result.result as {
        valid: boolean;
        validated_conditions: unknown[];
      };

      expect(data.valid).toBe(true);
    });
  });
});
