/**
 * Shared helpers for interpreting Odoo client results.
 */

/** An Odoo client call that failed and reported a message instead of data. */
export interface ErrorResult {
  error: string;
}

/**
 * Narrow a client result to its error form.
 *
 * `OdooClient` methods such as `getModelFields` resolve to either the payload
 * or `{ error }` rather than rejecting, so callers need this guard before
 * treating a result as data.
 */
export function isError(result: unknown): result is ErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as ErrorResult).error === "string"
  );
}
