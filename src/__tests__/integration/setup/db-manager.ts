import { XmlRpcClient } from "../../../connection/xmlrpc.js";
import { getOdooUrl, TEST_CONFIG } from "./skip-condition.js";

export interface DatabaseManagerOptions {
  host?: string;
  port?: number;
  masterPassword?: string;
  timeout?: number;
}

/**
 * Database manager for Odoo test databases
 * Uses the /xmlrpc/2/db endpoint for database operations
 */
export class DatabaseManager {
  private client: XmlRpcClient;
  private masterPassword: string;

  constructor(options: DatabaseManagerOptions = {}) {
    const host = options.host ?? TEST_CONFIG.host;
    const port = options.port ?? TEST_CONFIG.port;
    const timeout = options.timeout ?? 120000; // Database operations can be slow

    this.masterPassword = options.masterPassword ?? "admin"; // Default Odoo master password
    this.client = new XmlRpcClient({
      url: getOdooUrl(host, port),
      path: "/xmlrpc/2/db",
      timeout,
    });
  }

  /**
   * List all databases
   */
  async listDatabases(): Promise<string[]> {
    try {
      return await this.client.methodCall<string[]>("list", []);
    } catch (error) {
      console.error("Failed to list databases:", error);
      return [];
    }
  }

  /**
   * Check if a database exists
   */
  async databaseExists(name: string): Promise<boolean> {
    const databases = await this.listDatabases();
    return databases.includes(name);
  }

  /**
   * Create a new database
   * Note: This can take a significant time (30-60 seconds)
   */
  async createDatabase(
    name: string,
    options: {
      demo?: boolean;
      lang?: string;
      adminPassword?: string;
    } = {},
  ): Promise<boolean> {
    const { demo = false, lang = "en_US", adminPassword = "admin" } = options;

    console.error(`Creating database: ${name} (this may take a minute)...`);

    try {
      await this.client.methodCall<boolean>("create_database", [
        this.masterPassword,
        name,
        demo,
        lang,
        adminPassword,
      ]);
      console.error(`Database ${name} created successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to create database ${name}:`, error);
      throw error;
    }
  }

  /**
   * Drop a database
   */
  async dropDatabase(name: string): Promise<boolean> {
    console.error(`Dropping database: ${name}...`);

    try {
      await this.client.methodCall<boolean>("drop", [
        this.masterPassword,
        name,
      ]);
      console.error(`Database ${name} dropped successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to drop database ${name}:`, error);
      // Don't throw - database might not exist
      return false;
    }
  }

  /**
   * Duplicate a database
   */
  async duplicateDatabase(
    source: string,
    destination: string,
  ): Promise<boolean> {
    console.error(`Duplicating database: ${source} -> ${destination}...`);

    try {
      await this.client.methodCall<boolean>("duplicate_database", [
        this.masterPassword,
        source,
        destination,
      ]);
      console.error(`Database duplicated successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to duplicate database:`, error);
      throw error;
    }
  }

  /**
   * Get server version
   */
  async getServerVersion(): Promise<string> {
    try {
      const version = await this.client.methodCall<string>(
        "server_version",
        [],
      );
      return version;
    } catch (error) {
      console.error("Failed to get server version:", error);
      return "unknown";
    }
  }
}

/**
 * Create a database manager instance
 */
export function createDatabaseManager(
  options: DatabaseManagerOptions = {},
): DatabaseManager {
  return new DatabaseManager(options);
}
