/**
 * Odoo domain operators for search conditions
 */
export type OdooOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "in"
  | "not in"
  | "like"
  | "ilike"
  | "=like"
  | "=ilike"
  | "child_of"
  | "parent_of";

/**
 * A single domain condition: [field, operator, value]
 */
export type DomainCondition = [string, OdooOperator, unknown];

/**
 * Logical operators for combining domain conditions
 */
export type DomainOperator = "&" | "|" | "!";

/**
 * A complete domain: array of conditions and/or operators
 */
export type Domain = Array<DomainCondition | DomainOperator>;

/**
 * Odoo field definition from fields_get()
 */
export interface OdooFieldDef {
  type: string;
  string: string;
  help?: string;
  required?: boolean;
  readonly?: boolean;
  relation?: string;
  selection?: Array<[string, string]>;
}

/**
 * Model information from ir.model
 */
export interface OdooModelInfo {
  id: number;
  name: string;
  model: string;
  fields?: Record<string, OdooFieldDef>;
}

/**
 * Active connection state
 */
export interface OdooConnection {
  url: string;
  db: string;
  uid: number;
  password: string;
}
