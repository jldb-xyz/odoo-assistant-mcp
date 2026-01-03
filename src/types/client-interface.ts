import type { Domain, OdooFieldDef, OdooModelInfo } from "./odoo.js";

/**
 * Options for searchRead operations
 */
export interface SearchReadOptions {
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
}

/**
 * Result type for getModels()
 */
export interface GetModelsResult {
  model_names: string[];
  models_details: Record<string, { name: string }>;
  error?: string;
}

/**
 * Interface for Odoo client operations.
 * This interface enables dependency injection and mocking for tests.
 */
export interface IOdooClient {
  /**
   * Execute a method on an Odoo model via execute_kw
   */
  execute<T>(
    model: string,
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<T>;

  /**
   * Get list of all models in the system
   */
  getModels(): Promise<GetModelsResult>;

  /**
   * Get information about a specific model
   */
  getModelInfo(modelName: string): Promise<OdooModelInfo | { error: string }>;

  /**
   * Get field definitions for a model
   */
  getModelFields(
    modelName: string,
  ): Promise<Record<string, OdooFieldDef> | { error: string }>;

  /**
   * Search and read records from a model
   */
  searchRead(
    modelName: string,
    domain: Domain,
    options?: SearchReadOptions,
  ): Promise<unknown[]>;

  /**
   * Read specific records by ID
   */
  readRecords(
    modelName: string,
    ids: number[],
    fields?: string[],
  ): Promise<unknown[]>;
}
