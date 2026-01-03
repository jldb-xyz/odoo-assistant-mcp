import type {
  Domain,
  DomainCondition,
  DomainOperator,
} from "../types/index.js";

interface ConditionObject {
  field: string;
  operator: string;
  value: unknown;
}

interface DomainObject {
  conditions: ConditionObject[];
}

/**
 * Check if a value is a logical operator
 */
function isOperator(item: unknown): item is DomainOperator {
  return item === "&" || item === "|" || item === "!";
}

/**
 * Check if an object has the conditions property (object format domain)
 */
function isDomainObject(obj: unknown): obj is DomainObject {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "conditions" in obj &&
    Array.isArray((obj as DomainObject).conditions)
  );
}

/**
 * Validate a condition object
 */
function isValidConditionObject(c: unknown): c is ConditionObject {
  return (
    typeof c === "object" &&
    c !== null &&
    "field" in c &&
    "operator" in c &&
    "value" in c &&
    typeof (c as ConditionObject).field === "string" &&
    typeof (c as ConditionObject).operator === "string"
  );
}

/**
 * Convert object format domain to array format
 */
function normalizeConditionObject(obj: DomainObject): Domain {
  return obj.conditions
    .filter(isValidConditionObject)
    .map((c) => [c.field, c.operator, c.value] as DomainCondition);
}

/**
 * Parse domain from JSON string
 */
function normalizeFromString(str: string): Domain {
  try {
    const parsed: unknown = JSON.parse(str);
    return normalizeDomain(parsed);
  } catch {
    // Not valid JSON, return empty domain
    return [];
  }
}

/**
 * Normalize array domain
 */
function normalizeArrayDomain(arr: unknown[]): Domain {
  if (arr.length === 0) {
    return [];
  }

  // Check if it's already a valid domain with conditions/operators
  const hasConditions = arr.some(
    (item) => Array.isArray(item) || isOperator(item),
  );

  if (hasConditions) {
    // Filter and validate each item
    return arr.filter((item) => {
      if (isOperator(item)) return true;
      if (
        Array.isArray(item) &&
        item.length === 3 &&
        typeof item[0] === "string"
      ) {
        return true;
      }
      return false;
    }) as Domain;
  }

  // Check if it's a single condition tuple: [field, op, value]
  if (
    arr.length >= 3 &&
    typeof arr[0] === "string" &&
    typeof arr[1] === "string"
  ) {
    return [[arr[0], arr[1], arr[2]] as DomainCondition];
  }

  return [];
}

/**
 * Normalize domain from various input formats to Odoo-compatible array format.
 *
 * Handles:
 * 1. null/undefined -> []
 * 2. Array of tuples: [[field, op, val], ...] -> pass through
 * 3. Single tuple: [field, op, val] -> [[field, op, val]]
 * 4. Object with conditions: { conditions: [...] }
 * 5. JSON string of any above format
 * 6. Operators like '&', '|', '!' preserved
 * 7. Double-wrapped domains [[domain]] -> [domain]
 */
export function normalizeDomain(input: unknown): Domain {
  // Handle null/undefined
  if (input === null || input === undefined) {
    return [];
  }

  // Handle string input (JSON)
  if (typeof input === "string") {
    return normalizeFromString(input);
  }

  // Handle object with conditions property
  if (isDomainObject(input)) {
    return normalizeConditionObject(input);
  }

  // Handle array input
  if (Array.isArray(input)) {
    // Unwrap double-wrapped domains [[domain]] -> [domain]
    if (
      input.length === 1 &&
      Array.isArray(input[0]) &&
      Array.isArray(input[0][0])
    ) {
      return normalizeArrayDomain(input[0] as unknown[]);
    }
    return normalizeArrayDomain(input);
  }

  return [];
}

/**
 * Validate a domain and return only valid conditions/operators
 */
export function validateDomain(domain: Domain): Domain {
  return domain.filter((item) => {
    if (isOperator(item)) return true;
    if (
      Array.isArray(item) &&
      item.length === 3 &&
      typeof item[0] === "string" &&
      typeof item[1] === "string"
    ) {
      return true;
    }
    return false;
  });
}
