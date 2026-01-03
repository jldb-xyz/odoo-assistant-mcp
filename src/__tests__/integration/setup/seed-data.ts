import type { IOdooClient } from "../../../types/index.js";

export interface SeededPartner {
  id: number;
  name: string;
  email: string;
  is_company: boolean;
}

export interface SeededData {
  partners: SeededPartner[];
  cleanup: () => Promise<void>;
}

/**
 * Create basic test data for integration tests
 * Creates res.partner records which are available in base Odoo
 */
export async function seedBasicData(client: IOdooClient): Promise<SeededData> {
  const partnerIds: number[] = [];

  // Create a test company
  const companyId = await client.execute<number>("res.partner", "create", [
    {
      name: "Test Company Inc.",
      email: "company@test.example.com",
      is_company: true,
      street: "123 Test Street",
      city: "Test City",
      phone: "+1-555-0100",
    },
  ]);
  partnerIds.push(companyId);

  // Create test contacts
  const contact1Id = await client.execute<number>("res.partner", "create", [
    {
      name: "John Test",
      email: "john@test.example.com",
      is_company: false,
      parent_id: companyId,
      phone: "+1-555-0101",
    },
  ]);
  partnerIds.push(contact1Id);

  const contact2Id = await client.execute<number>("res.partner", "create", [
    {
      name: "Jane Test",
      email: "jane@test.example.com",
      is_company: false,
      parent_id: companyId,
      phone: "+1-555-0102",
    },
  ]);
  partnerIds.push(contact2Id);

  // Create an individual partner (not associated with company)
  const individualId = await client.execute<number>("res.partner", "create", [
    {
      name: "Bob Individual",
      email: "bob@test.example.com",
      is_company: false,
      street: "456 Individual Lane",
      city: "Solo City",
    },
  ]);
  partnerIds.push(individualId);

  const partners: SeededPartner[] = [
    {
      id: companyId,
      name: "Test Company Inc.",
      email: "company@test.example.com",
      is_company: true,
    },
    {
      id: contact1Id,
      name: "John Test",
      email: "john@test.example.com",
      is_company: false,
    },
    {
      id: contact2Id,
      name: "Jane Test",
      email: "jane@test.example.com",
      is_company: false,
    },
    {
      id: individualId,
      name: "Bob Individual",
      email: "bob@test.example.com",
      is_company: false,
    },
  ];

  return {
    partners,
    cleanup: async () => {
      // Delete in reverse order to handle dependencies
      for (const id of partnerIds.reverse()) {
        try {
          await client.execute("res.partner", "unlink", [[id]]);
        } catch {
          // Ignore errors during cleanup
        }
      }
    },
  };
}

/**
 * Create a single test partner with a unique name
 */
export async function createTestPartner(
  client: IOdooClient,
  options: {
    name?: string;
    email?: string;
    isCompany?: boolean;
  } = {},
): Promise<{ id: number; cleanup: () => Promise<void> }> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);

  const name = options.name ?? `Test Partner ${timestamp}_${random}`;
  const email = options.email ?? `test_${timestamp}_${random}@example.com`;
  const isCompany = options.isCompany ?? false;

  const id = await client.execute<number>("res.partner", "create", [
    {
      name,
      email,
      is_company: isCompany,
    },
  ]);

  return {
    id,
    cleanup: async () => {
      try {
        await client.execute("res.partner", "unlink", [[id]]);
      } catch {
        // Ignore errors during cleanup
      }
    },
  };
}

/**
 * Delete test data by pattern matching
 * Useful for cleaning up after failed tests
 */
export async function cleanupTestData(
  client: IOdooClient,
  options: {
    emailPattern?: string;
    namePattern?: string;
  } = {},
): Promise<number> {
  const domain: Array<[string, string, string]> = [];

  if (options.emailPattern) {
    domain.push(["email", "ilike", options.emailPattern]);
  }
  if (options.namePattern) {
    domain.push(["name", "ilike", options.namePattern]);
  }

  if (domain.length === 0) {
    // Default: cleanup test.example.com emails
    domain.push(["email", "ilike", "%test.example.com"]);
  }

  try {
    const ids = await client.execute<number[]>("res.partner", "search", [
      domain,
    ]);

    if (ids.length > 0) {
      await client.execute("res.partner", "unlink", [ids]);
    }

    return ids.length;
  } catch {
    return 0;
  }
}
