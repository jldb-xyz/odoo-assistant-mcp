import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOdooClient } from "../types/index.js";
import {
  checkDomainValidity,
  ExplainFieldInputSchema,
  explainField,
  GetCreateRequirementsInputSchema,
  GetModelRelationsInputSchema,
  GetModelSchemaInputSchema,
  GetRecordSampleInputSchema,
  GetSelectionValuesInputSchema,
  getCreateRequirements,
  getModelRelations,
  getModelSchema,
  getRecordSample,
  getSelectionValues,
  ListModelsInputSchema,
  listModels,
  ValidateDomainInputSchema,
} from "./introspection.js";

describe("introspection tools", () => {
  let mockClient: IOdooClient;

  beforeEach(() => {
    mockClient = {
      execute: vi.fn(),
      getModels: vi.fn(),
      getModelInfo: vi.fn(),
      getModelFields: vi.fn(),
      searchRead: vi.fn(),
      readRecords: vi.fn(),
    };
  });

  // ============ list_models ============

  describe("ListModelsInputSchema", () => {
    it("validates minimal input", () => {
      const result = ListModelsInputSchema.parse({});
      expect(result.category).toBe("all");
      expect(result.limit).toBe(50);
    });

    it("validates full input", () => {
      const result = ListModelsInputSchema.parse({
        filter: "partner",
        category: "core",
        limit: 100,
      });
      expect(result.filter).toBe("partner");
      expect(result.category).toBe("core");
      expect(result.limit).toBe(100);
    });

    it("rejects invalid category", () => {
      expect(() =>
        ListModelsInputSchema.parse({ category: "invalid" }),
      ).toThrow();
    });
  });

  describe("listModels", () => {
    it("returns filtered models with field counts", async () => {
      vi.mocked(mockClient.execute).mockImplementation(
        async (model, method) => {
          if (model === "ir.model" && method === "search_read") {
            return [
              {
                id: 1,
                model: "res.partner",
                name: "Contact",
                transient: false,
                field_id: [1, 2, 3, 4, 5],
              },
              {
                id: 2,
                model: "res.partner.bank",
                name: "Bank Accounts",
                transient: false,
                field_id: [1, 2],
              },
            ];
          }
          if (model === "ir.model" && method === "search_count") {
            return 2;
          }
          return [];
        },
      );

      const result = await listModels(mockClient, { filter: "partner" });

      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({
        total_matched: 2,
        showing: 2,
        models: [
          { model: "res.partner", name: "Contact", field_count: 5 },
          { model: "res.partner.bank", name: "Bank Accounts", field_count: 2 },
        ],
      });
    });

    it("applies category filter for core models", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await listModels(mockClient, { category: "core" });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "ir.model",
        "search_read",
        [[["transient", "=", false]]],
        expect.any(Object),
      );
    });

    it("applies category filter for transient models", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await listModels(mockClient, { category: "transient" });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "ir.model",
        "search_read",
        [[["transient", "=", true]]],
        expect.any(Object),
      );
    });

    it("respects limit and caps at 200", async () => {
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      await listModels(mockClient, { limit: 500 });

      expect(mockClient.execute).toHaveBeenCalledWith(
        "ir.model",
        "search_read",
        [[]],
        expect.objectContaining({ limit: 200 }),
      );
    });

    it("returns error on client failure", async () => {
      vi.mocked(mockClient.execute).mockRejectedValue(
        new Error("Connection failed"),
      );

      const result = await listModels(mockClient, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection failed");
    });
  });

  // ============ get_model_schema ============

  describe("GetModelSchemaInputSchema", () => {
    it("validates model name", () => {
      const result = GetModelSchemaInputSchema.parse({
        model: "sale.order",
      });
      expect(result.model).toBe("sale.order");
    });

    it("validates field_types filter", () => {
      const result = GetModelSchemaInputSchema.parse({
        model: "res.partner",
        field_types: ["many2one", "char"],
      });
      expect(result.field_types).toEqual(["many2one", "char"]);
    });

    it("rejects missing model", () => {
      expect(() => GetModelSchemaInputSchema.parse({})).toThrow();
    });
  });

  describe("getModelSchema", () => {
    it("returns categorized fields", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "sale.order",
        name: "Sales Order",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID", readonly: true },
        name: { type: "char", string: "Reference", required: true },
        partner_id: {
          type: "many2one",
          string: "Customer",
          relation: "res.partner",
          required: true,
        },
        amount_total: { type: "monetary", string: "Total" },
      });

      const result = await getModelSchema(mockClient, { model: "sale.order" });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("sale.order");
      expect(data.name).toBe("Sales Order");
      expect(data.key_fields).toHaveProperty("id");
      expect(data.key_fields).toHaveProperty("name");
      expect(
        (data.relations as Record<string, unknown>).outgoing,
      ).toHaveProperty("partner_id");
      expect(data.data_fields).toHaveProperty("amount_total");
      expect(data.field_count).toBe(4);
    });

    it("filters by field_types", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        country_id: {
          type: "many2one",
          string: "Country",
          relation: "res.country",
        },
      });

      const result = await getModelSchema(mockClient, {
        model: "res.partner",
        field_types: ["many2one"],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      // Only many2one field should be in relations
      expect(
        (data.relations as Record<string, Record<string, unknown>>).outgoing,
      ).toHaveProperty("country_id");
      // Other fields should be empty
      expect(Object.keys(data.key_fields as object)).toHaveLength(0);
      expect(Object.keys(data.data_fields as object)).toHaveLength(0);
    });

    it("returns error for invalid model", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        error: "Model not.real not found",
      });

      const result = await getModelSchema(mockClient, { model: "not.real" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ============ get_model_relations ============

  describe("GetModelRelationsInputSchema", () => {
    it("validates with defaults", () => {
      const result = GetModelRelationsInputSchema.parse({
        model: "res.partner",
      });
      expect(result.direction).toBe("both");
      expect(result.include_technical).toBe(false);
    });

    it("validates all options", () => {
      const result = GetModelRelationsInputSchema.parse({
        model: "res.partner",
        direction: "incoming",
        include_technical: true,
      });
      expect(result.direction).toBe("incoming");
      expect(result.include_technical).toBe(true);
    });
  });

  describe("getModelRelations", () => {
    it("returns both outgoing and incoming relations", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        country_id: {
          type: "many2one",
          string: "Country",
          relation: "res.country",
        },
        child_ids: {
          type: "one2many",
          string: "Contacts",
          relation: "res.partner",
        },
      });
      vi.mocked(mockClient.execute).mockResolvedValue([
        {
          id: 10,
          model_id: [5, "sale.order"],
          name: "partner_id",
          ttype: "many2one",
          field_description: "Customer",
        },
      ]);

      const result = await getModelRelations(mockClient, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("res.partner");

      const outgoing = data.outgoing_relations as Array<
        Record<string, unknown>
      >;
      expect(outgoing).toHaveLength(2);
      expect(outgoing.find((r) => r.field === "country_id")).toBeDefined();
      expect(outgoing.find((r) => r.field === "child_ids")).toBeDefined();

      const incoming = data.incoming_relations as Array<
        Record<string, unknown>
      >;
      expect(incoming).toHaveLength(1);
      expect(incoming[0].source_model).toBe("sale.order");
      expect(incoming[0].field).toBe("partner_id");
    });

    it("excludes technical models by default", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        message_ids: {
          type: "one2many",
          string: "Messages",
          relation: "mail.message",
        },
        country_id: {
          type: "many2one",
          string: "Country",
          relation: "res.country",
        },
      });
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      const result = await getModelRelations(mockClient, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const outgoing = data.outgoing_relations as Array<
        Record<string, unknown>
      >;
      // mail.message should be filtered out
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].target_model).toBe("res.country");
    });

    it("includes technical models when requested", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        message_ids: {
          type: "one2many",
          string: "Messages",
          relation: "mail.message",
        },
      });
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      const result = await getModelRelations(mockClient, {
        model: "res.partner",
        include_technical: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const outgoing = data.outgoing_relations as Array<
        Record<string, unknown>
      >;
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].target_model).toBe("mail.message");
    });

    it("returns only outgoing when direction=outgoing", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        country_id: {
          type: "many2one",
          string: "Country",
          relation: "res.country",
        },
      });

      const result = await getModelRelations(mockClient, {
        model: "res.partner",
        direction: "outgoing",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.outgoing_relations).toBeDefined();
      expect(data.incoming_relations).toBeUndefined();
      // Should not have called ir.model.fields
      expect(mockClient.execute).not.toHaveBeenCalled();
    });

    it("returns only incoming when direction=incoming", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        id: 1,
        model: "res.partner",
        name: "Contact",
      });
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      const result = await getModelRelations(mockClient, {
        model: "res.partner",
        direction: "incoming",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.outgoing_relations).toBeUndefined();
      expect(data.incoming_relations).toBeDefined();
      // Should not have called getModelFields
      expect(mockClient.getModelFields).not.toHaveBeenCalled();
    });

    it("returns error for invalid model", async () => {
      vi.mocked(mockClient.getModelInfo).mockResolvedValue({
        error: "Model not.real not found",
      });

      const result = await getModelRelations(mockClient, { model: "not.real" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ============ get_create_requirements ============

  describe("GetCreateRequirementsInputSchema", () => {
    it("validates model name", () => {
      const result = GetCreateRequirementsInputSchema.parse({
        model: "res.partner",
      });
      expect(result.model).toBe("res.partner");
    });

    it("rejects missing model", () => {
      expect(() => GetCreateRequirementsInputSchema.parse({})).toThrow();
    });
  });

  describe("getCreateRequirements", () => {
    it("returns required fields with defaults", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID", readonly: true },
        name: { type: "char", string: "Name", required: true },
        active: { type: "boolean", string: "Active", required: true },
        email: { type: "char", string: "Email" },
      });
      vi.mocked(mockClient.execute).mockResolvedValue({
        active: true,
      });

      const result = await getCreateRequirements(mockClient, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("res.partner");
      expect(data.must_provide).toHaveProperty("name");
      expect(data.has_defaults).toHaveProperty("active");
      expect(data.minimal_payload_example).toHaveProperty("name");
    });

    it("handles models with no required fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID", readonly: true },
        name: { type: "char", string: "Name" },
      });

      const result = await getCreateRequirements(mockClient, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(Object.keys(data.must_provide as object)).toHaveLength(0);
    });

    it("returns error for invalid model", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        error: "Model not found",
      });

      const result = await getCreateRequirements(mockClient, {
        model: "not.real",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ============ get_selection_values ============

  describe("GetSelectionValuesInputSchema", () => {
    it("validates with model only", () => {
      const result = GetSelectionValuesInputSchema.parse({
        model: "sale.order",
      });
      expect(result.model).toBe("sale.order");
      expect(result.field).toBeUndefined();
    });

    it("validates with model and field", () => {
      const result = GetSelectionValuesInputSchema.parse({
        model: "sale.order",
        field: "state",
      });
      expect(result.field).toBe("state");
    });
  });

  describe("getSelectionValues", () => {
    it("returns summary only when no field specified", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        state: {
          type: "selection",
          string: "State",
          selection: [
            ["draft", "Draft"],
            ["confirmed", "Confirmed"],
          ],
        },
        priority: {
          type: "selection",
          string: "Priority",
          selection: [
            ["low", "Low"],
            ["high", "High"],
          ],
        },
        name: { type: "char", string: "Name" },
      });

      const result = await getSelectionValues(mockClient, {
        model: "sale.order",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.count).toBe(2);
      // Should return array of summaries, not full values
      const fields = data.selection_fields as Array<Record<string, unknown>>;
      expect(fields).toHaveLength(2);
      expect(fields[0]).toHaveProperty("field");
      expect(fields[0]).toHaveProperty("value_count");
      expect(fields[0]).not.toHaveProperty("values"); // No values in summary
      expect(data.guidance).toContain("Call again");
    });

    it("returns full values when specific field requested", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        state: {
          type: "selection",
          string: "State",
          selection: [
            ["draft", "Draft"],
            ["confirmed", "Confirmed"],
          ],
        },
        priority: {
          type: "selection",
          string: "Priority",
          selection: [
            ["low", "Low"],
            ["high", "High"],
          ],
        },
      });

      const result = await getSelectionValues(mockClient, {
        model: "sale.order",
        field: "state",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.field).toBe("state");
      expect(data.label).toBe("State");
      expect(data.value_count).toBe(2);
      const values = data.values as Array<Record<string, string>>;
      expect(values).toHaveLength(2);
      expect(values[0].value).toBe("draft");
      expect(values[0].label).toBe("Draft");
    });

    it("returns error when field is not selection type", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
      });

      const result = await getSelectionValues(mockClient, {
        model: "sale.order",
        field: "name",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not selection");
    });
  });

  // ============ explain_field ============

  describe("ExplainFieldInputSchema", () => {
    it("validates model and field", () => {
      const result = ExplainFieldInputSchema.parse({
        model: "res.partner",
        field: "name",
      });
      expect(result.model).toBe("res.partner");
      expect(result.field).toBe("name");
    });

    it("rejects missing field", () => {
      expect(() =>
        ExplainFieldInputSchema.parse({ model: "res.partner" }),
      ).toThrow();
    });
  });

  describe("explainField", () => {
    it("returns detailed field info", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: {
          type: "char",
          string: "Name",
          required: true,
          help: "Contact name",
        },
      });

      const result = await explainField(mockClient, {
        model: "res.partner",
        field: "name",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.field).toBe("name");
      expect(data.type).toBe("char");
      expect(data.required).toBe(true);
      expect(data.help).toBe("Contact name");
      expect(data.usage_guidance).toBeDefined();
      expect(data.example_value).toBeDefined();
    });

    it("includes relation info for relational fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        partner_id: {
          type: "many2one",
          string: "Customer",
          relation: "res.partner",
          required: true,
        },
      });

      const result = await explainField(mockClient, {
        model: "sale.order",
        field: "partner_id",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.relation).toBeDefined();
      const relation = data.relation as Record<string, unknown>;
      expect(relation.target_model).toBe("res.partner");
      expect(relation.relationship_type).toBe("many2one");
    });

    it("includes selection values for selection fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        state: {
          type: "selection",
          string: "State",
          selection: [
            ["draft", "Draft"],
            ["done", "Done"],
          ],
        },
      });

      const result = await explainField(mockClient, {
        model: "sale.order",
        field: "state",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.selection_values).toBeDefined();
      const values = data.selection_values as Array<Record<string, string>>;
      expect(values).toHaveLength(2);
      expect(values[0].value).toBe("draft");
    });

    it("returns error with suggestions for invalid field", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        partner_id: { type: "many2one", string: "Partner" },
        partner_name: { type: "char", string: "Partner Name" },
      });

      const result = await explainField(mockClient, {
        model: "res.partner",
        field: "partner",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ============ get_record_sample ============

  describe("GetRecordSampleInputSchema", () => {
    it("validates with model only", () => {
      const result = GetRecordSampleInputSchema.parse({
        model: "res.partner",
      });
      expect(result.model).toBe("res.partner");
    });

    it("validates with domain and fields", () => {
      const result = GetRecordSampleInputSchema.parse({
        model: "res.partner",
        domain: [["active", "=", true]],
        fields: ["name", "email"],
      });
      expect(result.domain).toEqual([["active", "=", true]]);
      expect(result.fields).toEqual(["name", "email"]);
    });
  });

  describe("getRecordSample", () => {
    it("returns sample record with default fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
        display_name: { type: "char", string: "Display Name" },
      });
      vi.mocked(mockClient.execute).mockResolvedValue([
        { id: 1, name: "Test Partner", display_name: "Test Partner" },
      ]);

      const result = await getRecordSample(mockClient, {
        model: "res.partner",
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.model).toBe("res.partner");
      const record = data.record as Record<string, unknown>;
      expect(record.id).toBeDefined();
    });

    it("returns null record when no matches", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });
      vi.mocked(mockClient.execute).mockResolvedValue([]);

      const result = await getRecordSample(mockClient, {
        model: "res.partner",
        domain: [["name", "=", "NonExistent"]],
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.record).toBeNull();
      expect(data.message).toContain("No records found");
    });

    it("returns error for invalid fields", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        id: { type: "integer", string: "ID" },
        name: { type: "char", string: "Name" },
      });

      const result = await getRecordSample(mockClient, {
        model: "res.partner",
        fields: ["nonexistent_field"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ============ validate_domain ============

  describe("ValidateDomainInputSchema", () => {
    it("validates with required fields", () => {
      const result = ValidateDomainInputSchema.parse({
        model: "res.partner",
        domain: [["name", "ilike", "test"]],
      });
      expect(result.model).toBe("res.partner");
      expect(result.domain).toEqual([["name", "ilike", "test"]]);
    });

    it("validates with test_execution flag", () => {
      const result = ValidateDomainInputSchema.parse({
        model: "res.partner",
        domain: [["active", "=", true]],
        test_execution: true,
      });
      expect(result.test_execution).toBe(true);
    });
  });

  describe("checkDomainValidity", () => {
    it("validates correct domain", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
        active: { type: "boolean", string: "Active" },
      });

      const result = await checkDomainValidity(mockClient, {
        model: "res.partner",
        domain: [
          ["name", "ilike", "test"],
          ["active", "=", true],
        ],
        test_execution: false,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.valid).toBe(true);
      expect((data.errors as string[]).length).toBe(0);
    });

    it("detects invalid field names", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
      });

      const result = await checkDomainValidity(mockClient, {
        model: "res.partner",
        domain: [["nonexistent", "=", "test"]],
        test_execution: false,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.valid).toBe(false);
      expect((data.errors as string[])[0]).toContain("not found");
    });

    it("detects invalid operators", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
      });

      const result = await checkDomainValidity(mockClient, {
        model: "res.partner",
        domain: [["name", "invalid_op", "test"]],
        test_execution: false,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.valid).toBe(false);
      expect((data.errors as string[])[0]).toContain("Invalid operator");
    });

    it("warns about type mismatches", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        partner_id: {
          type: "many2one",
          string: "Partner",
          relation: "res.partner",
        },
      });

      const result = await checkDomainValidity(mockClient, {
        model: "sale.order",
        domain: [["partner_id", "=", "wrong_type"]],
        test_execution: false,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect((data.warnings as string[]).length).toBeGreaterThan(0);
      expect((data.warnings as string[])[0]).toContain("many2one");
    });

    it("executes test when requested", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
      });
      vi.mocked(mockClient.execute).mockResolvedValue(5);

      const result = await checkDomainValidity(mockClient, {
        model: "res.partner",
        domain: [["name", "ilike", "test"]],
        test_execution: true,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.execution_test).toBeDefined();
      const execResult = data.execution_test as Record<string, unknown>;
      expect(execResult.success).toBe(true);
      expect(execResult.count).toBe(5);
    });

    it("handles invalid condition format", async () => {
      vi.mocked(mockClient.getModelFields).mockResolvedValue({
        name: { type: "char", string: "Name" },
      });

      const result = await checkDomainValidity(mockClient, {
        model: "res.partner",
        domain: [["name", "ilike"]], // Missing value
        test_execution: false,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data.valid).toBe(false);
      expect((data.errors as string[])[0]).toContain(
        "Invalid condition format",
      );
    });
  });
});
