import type {
  Domain,
  GetModelsResult,
  IOdooClient,
  OdooFieldDef,
  OdooModelInfo,
  SearchReadOptions,
} from "../types/index.js";

/**
 * Configuration for the mock client
 */
export interface MockClientConfig {
  /**
   * Map of "model.method" -> result for execute() calls
   */
  executeResults?: Map<string, unknown>;

  /**
   * Map of "model.method" -> error for execute() calls (checked before results)
   */
  executeErrors?: Map<string, Error>;

  /**
   * Result for getModels() call
   */
  models?: GetModelsResult;

  /**
   * Map of model name -> model info for getModelInfo() calls
   */
  modelInfo?: Map<string, OdooModelInfo>;

  /**
   * Map of model name -> field definitions for getModelFields() calls
   */
  modelFields?: Map<string, Record<string, OdooFieldDef>>;

  /**
   * Map of model name -> results for searchRead() calls
   */
  searchReadResults?: Map<string, unknown[]>;

  /**
   * Map of "model:id1,id2,..." -> results for readRecords() calls
   */
  readRecordsResults?: Map<string, unknown[]>;
}

/**
 * Create a mock IOdooClient for testing.
 * Configure responses via the config parameter.
 */
export function createMockClient(config: MockClientConfig = {}): IOdooClient {
  return {
    async execute<T>(
      model: string,
      method: string,
      _args: unknown[] = [],
      _kwargs: Record<string, unknown> = {},
    ): Promise<T> {
      const key = `${model}.${method}`;
      // Check for configured error first
      if (config.executeErrors?.has(key)) {
        throw config.executeErrors.get(key);
      }
      if (config.executeResults?.has(key)) {
        return config.executeResults.get(key) as T;
      }
      throw new Error(`Mock not configured for execute: ${key}`);
    },

    async getModels(): Promise<GetModelsResult> {
      return config.models ?? { model_names: [], models_details: {} };
    },

    async getModelInfo(
      modelName: string,
    ): Promise<OdooModelInfo | { error: string }> {
      const info = config.modelInfo?.get(modelName);
      if (info) {
        return info;
      }
      return { error: `Model ${modelName} not found` };
    },

    async getModelFields(
      modelName: string,
    ): Promise<Record<string, OdooFieldDef> | { error: string }> {
      const fields = config.modelFields?.get(modelName);
      if (fields) {
        return fields;
      }
      return { error: `Model ${modelName} not found` };
    },

    async searchRead(
      modelName: string,
      _domain: Domain,
      _options: SearchReadOptions = {},
    ): Promise<unknown[]> {
      const results = config.searchReadResults?.get(modelName);
      if (results) {
        return results;
      }
      return [];
    },

    async readRecords(
      modelName: string,
      ids: number[],
      _fields?: string[],
    ): Promise<unknown[]> {
      const key = `${modelName}:${ids.join(",")}`;
      const keyResult = config.readRecordsResults?.get(key);
      if (keyResult) {
        return keyResult;
      }
      // Also try just the model name as a fallback
      const modelResult = config.readRecordsResults?.get(modelName);
      if (modelResult) {
        return modelResult;
      }
      return [];
    },
  };
}

/**
 * Builder pattern for creating mock clients with a fluent API
 */
export class MockClientBuilder {
  private config: MockClientConfig = {
    executeResults: new Map(),
    executeErrors: new Map(),
    modelInfo: new Map(),
    modelFields: new Map(),
    searchReadResults: new Map(),
    readRecordsResults: new Map(),
  };

  /**
   * Configure the result for an execute() call
   */
  withExecuteResult(model: string, method: string, result: unknown): this {
    this.config.executeResults?.set(`${model}.${method}`, result);
    return this;
  }

  /**
   * Configure an error to be thrown for an execute() call
   */
  withExecuteError(model: string, method: string, error: Error): this {
    this.config.executeErrors?.set(`${model}.${method}`, error);
    return this;
  }

  /**
   * Configure the result for getModels()
   */
  withModels(models: GetModelsResult): this {
    this.config.models = models;
    return this;
  }

  /**
   * Configure model info for getModelInfo()
   */
  withModelInfo(modelName: string, info: OdooModelInfo): this {
    this.config.modelInfo?.set(modelName, info);
    return this;
  }

  /**
   * Configure field definitions for getModelFields()
   */
  withModelFields(
    modelName: string,
    fields: Record<string, OdooFieldDef>,
  ): this {
    this.config.modelFields?.set(modelName, fields);
    return this;
  }

  /**
   * Configure results for searchRead()
   */
  withSearchReadResults(modelName: string, results: unknown[]): this {
    this.config.searchReadResults?.set(modelName, results);
    return this;
  }

  /**
   * Configure results for readRecords()
   */
  withReadRecordsResults(modelName: string, results: unknown[]): this {
    this.config.readRecordsResults?.set(modelName, results);
    return this;
  }

  /**
   * Build the mock client
   */
  build(): IOdooClient {
    return createMockClient(this.config);
  }
}

/**
 * Create a MockClientBuilder for fluent configuration
 */
export function mockClient(): MockClientBuilder {
  return new MockClientBuilder();
}
