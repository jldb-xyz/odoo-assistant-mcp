import type {
  Domain,
  IOdooClient,
  OdooConfig,
  OdooConnection,
  OdooFieldDef,
  OdooModelInfo,
  SearchReadOptions,
} from "../types/index.js";
import { XmlRpcClient } from "./xmlrpc.js";

export interface OdooClientOptions {
  timeout?: number;
  verifySsl?: boolean;
}

/**
 * Odoo XML-RPC client for authentication and method execution
 */
export class OdooClient implements IOdooClient {
  private config: OdooConfig;
  private options: Required<OdooClientOptions>;
  private connection: OdooConnection | null = null;
  private commonClient: XmlRpcClient;
  private objectClient: XmlRpcClient;

  constructor(config: OdooConfig, options: OdooClientOptions = {}) {
    this.config = this.normalizeConfig(config);
    this.options = {
      timeout: options.timeout ?? 30000,
      verifySsl: options.verifySsl ?? true,
    };

    // Create XML-RPC clients for both endpoints
    this.commonClient = new XmlRpcClient({
      url: this.config.url,
      path: "/xmlrpc/2/common",
      timeout: this.options.timeout,
      verifySsl: this.options.verifySsl,
    });

    this.objectClient = new XmlRpcClient({
      url: this.config.url,
      path: "/xmlrpc/2/object",
      timeout: this.options.timeout,
      verifySsl: this.options.verifySsl,
    });
  }

  private normalizeConfig(config: OdooConfig): OdooConfig {
    let url = config.url;

    // Ensure URL has protocol
    if (!/^https?:\/\//.test(url)) {
      url = `http://${url}`;
    }

    // Remove trailing slash
    url = url.replace(/\/$/, "");

    return { ...config, url };
  }

  /**
   * Authenticate with Odoo and store the uid
   */
  async connect(): Promise<void> {
    console.error(`Connecting to Odoo at: ${this.config.url}`);
    console.error(`  Database: ${this.config.db}`);
    console.error(`  Username: ${this.config.username}`);
    console.error(`  Timeout: ${this.options.timeout}ms`);

    try {
      const uid = await this.commonClient.methodCall<number | false>(
        "authenticate",
        [this.config.db, this.config.username, this.config.password, {}],
      );

      if (uid === false || uid === 0) {
        throw new Error("Authentication failed: Invalid username or password");
      }

      this.connection = {
        url: this.config.url,
        db: this.config.db,
        uid,
        password: this.config.password,
      };

      console.error(`Successfully authenticated with UID: ${uid}`);
    } catch (error) {
      console.error(`Authentication error: ${error}`);
      throw error;
    }
  }

  private ensureConnected(): OdooConnection {
    if (!this.connection) {
      throw new Error("Not connected. Call connect() first.");
    }
    return this.connection;
  }

  /**
   * Execute a method on an Odoo model via execute_kw
   */
  async execute<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const conn = this.ensureConnected();

    return this.objectClient.methodCall<T>("execute_kw", [
      conn.db,
      conn.uid,
      conn.password,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  /**
   * Get list of all models in the system
   */
  async getModels(): Promise<{
    model_names: string[];
    models_details: Record<string, { name: string }>;
    error?: string;
  }> {
    try {
      const modelIds = await this.execute<number[]>("ir.model", "search", [[]]);

      if (!modelIds.length) {
        return {
          model_names: [],
          models_details: {},
          error: "No models found",
        };
      }

      const records = await this.execute<
        Array<{ id: number; model: string; name: string }>
      >("ir.model", "read", [modelIds, ["model", "name"]]);

      const modelNames = records.map((r) => r.model).sort();
      const modelsDetails: Record<string, { name: string }> = {};

      for (const rec of records) {
        modelsDetails[rec.model] = { name: rec.name };
      }

      return { model_names: modelNames, models_details: modelsDetails };
    } catch (error) {
      return { model_names: [], models_details: {}, error: String(error) };
    }
  }

  /**
   * Get information about a specific model
   */
  async getModelInfo(
    modelName: string,
  ): Promise<OdooModelInfo | { error: string }> {
    try {
      const result = await this.execute<OdooModelInfo[]>(
        "ir.model",
        "search_read",
        [[["model", "=", modelName]]],
        { fields: ["name", "model"] },
      );

      if (!result.length) {
        return { error: `Model ${modelName} not found` };
      }

      const model = result[0];
      if (!model) {
        return { error: `Model ${modelName} not found` };
      }

      return model;
    } catch (error) {
      return { error: String(error) };
    }
  }

  /**
   * Get field definitions for a model
   */
  async getModelFields(
    modelName: string,
  ): Promise<Record<string, OdooFieldDef> | { error: string }> {
    try {
      return await this.execute<Record<string, OdooFieldDef>>(
        modelName,
        "fields_get",
      );
    } catch (error) {
      return { error: String(error) };
    }
  }

  /**
   * Search and read records from a model
   */
  async searchRead(
    modelName: string,
    domain: Domain,
    options: SearchReadOptions = {},
  ): Promise<unknown[]> {
    const kwargs: Record<string, unknown> = {};
    if (options.fields) kwargs.fields = options.fields;
    if (options.offset) kwargs.offset = options.offset;
    if (options.limit !== undefined) kwargs.limit = options.limit;
    if (options.order) kwargs.order = options.order;

    return this.execute<unknown[]>(modelName, "search_read", [domain], kwargs);
  }

  /**
   * Read specific records by ID
   */
  async readRecords(
    modelName: string,
    ids: number[],
    fields?: string[],
  ): Promise<unknown[]> {
    const kwargs: Record<string, unknown> = {};
    if (fields) kwargs.fields = fields;

    return this.execute<unknown[]>(modelName, "read", [ids], kwargs);
  }
}
