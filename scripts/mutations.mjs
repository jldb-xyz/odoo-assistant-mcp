/**
 * biome-ignore-all lint/suspicious/noTemplateCurlyInString: `find`/`replace`
 * hold literal source text to match, so any `${...}` in them is intentional.
 */

/**
 * Mutation catalogue.
 *
 * Each entry is a plausible, real bug. The suite must go red for every one of
 * them; a mutant that survives means that bug could ship unnoticed.
 *
 * These are curated rather than generated: each one documents an invariant we
 * care about — mostly security, protocol correctness, and data safety — so the
 * catalogue doubles as executable documentation of what the tests are *for*.
 *
 * Adding one: pick a bug a reviewer could plausibly miss, express it as an
 * exact source substring and its replacement, and run `pnpm test:mutation`.
 * `find` must appear EXACTLY ONCE in the file — the runner enforces this so a
 * mutation can never silently target the wrong site.
 */

/** @typedef {{ id: string, file: string, description: string, find: string, replace: string }} Mutation */

/** @type {Mutation[]} */
export const mutations = [
  // ---------------------------------------------------------------- connection
  {
    id: "odoo-client/credential-order",
    file: "src/connection/odoo-client.ts",
    description: "swap uid and password in the execute_kw payload",
    find: "conn.db,\n      conn.uid,\n      conn.password,",
    replace: "conn.db,\n      conn.password,\n      conn.uid,",
  },
  {
    id: "odoo-client/uid-zero-authenticated",
    file: "src/connection/odoo-client.ts",
    description: "treat a uid of 0 as a successful authentication",
    find: "if (uid === false || uid === 0) {",
    replace: "if (uid === false) {",
  },
  {
    id: "config/verify-ssl-default-off",
    file: "src/connection/config.ts",
    description: "default TLS verification to off",
    find: 'const verifySslStr = process.env[ENV_VARS.VERIFY_SSL] ?? "1";',
    replace: 'const verifySslStr = process.env[ENV_VARS.VERIFY_SSL] ?? "0";',
  },
  {
    id: "config/timeout-unit",
    file: "src/connection/config.ts",
    description: "treat the configured timeout as milliseconds, not seconds",
    find: "parseInt(timeoutStr, 10) * 1000",
    replace: "parseInt(timeoutStr, 10)",
  },

  // ------------------------------------------------------------------- domains
  {
    id: "domain-utils/accept-malformed-conditions",
    file: "src/tools/domain-utils.ts",
    description: "accept any array as a valid domain condition",
    find:
      'if (\n      Array.isArray(item) &&\n      item.length === 3 &&\n      typeof item[0] === "string" &&\n' +
      '      typeof item[1] === "string"\n    ) {\n      return true;\n    }\n    return false;\n  });\n}',
    replace:
      "if (Array.isArray(item)) {\n      return true;\n    }\n    return false;\n  });\n}",
  },
  {
    id: "domain-utils/drop-not-operator",
    file: "src/tools/domain-utils.ts",
    description: "stop recognising the '!' logical operator",
    find: 'return item === "&" || item === "|" || item === "!";',
    replace: 'return item === "&" || item === "|";',
  },

  // ------------------------------------------------------- security: traversal
  {
    id: "docs-system/allow-separators",
    file: "src/docs-system/index.ts",
    description: "allow path separators in doc/SOP names",
    find: "if (/[/\\\\]/.test(name)) return false;",
    replace: "",
  },
  {
    id: "docs-system/allow-dotdot",
    file: "src/docs-system/index.ts",
    description: "allow '..' as a doc/SOP name",
    find: 'if (!name || name === "." || name === "..") return false;',
    replace: "if (!name) return false;",
  },
  {
    id: "docs-system/allow-drive-relative",
    file: "src/docs-system/index.ts",
    description: "allow Windows drive-relative names such as 'D:notes'",
    find: "if (/^[a-zA-Z]:/.test(name)) return false;",
    replace: "",
  },

  // -------------------------------------------------------- protocol behaviour
  {
    id: "server/tool-errors-look-successful",
    file: "src/server.ts",
    description: "never mark a failed tool call as an error",
    find: "...(result.success ? {} : { isError: true }),",
    replace: "",
  },
  {
    id: "server/wrong-version",
    file: "src/server.ts",
    description: "advertise a version that is not the package version",
    find: "version: SERVER_VERSION",
    replace: 'version: "0.0.0-wrong"',
  },
  {
    id: "server/drop-annotations",
    file: "src/server.ts",
    description:
      "stop publishing tool annotations (readOnly/destructive hints)",
    find: "...(tool.annotations ? { annotations: tool.annotations } : {}),",
    replace: "",
  },
  {
    id: "server/drop-titles",
    file: "src/server.ts",
    description: "stop publishing tool titles",
    find: "...(tool.title ? { title: tool.title } : {}),",
    replace: "",
  },

  // ------------------------------------------------------------------ csv/excel
  {
    id: "excel/no-comma-quoting",
    file: "src/tools/excel.ts",
    description: "stop quoting CSV fields that contain commas",
    find: 'if (/[",\\n\\r]/.test(field)) {',
    replace: 'if (/["\\n\\r]/.test(field)) {',
  },
  {
    id: "excel/no-quote-doubling",
    file: "src/tools/excel.ts",
    description: "stop doubling embedded quotes in CSV fields",
    find: 'return `"${field.replaceAll(\'"\', \'""\')}"`;',
    replace: 'return `"${field}"`;',
  },
  {
    id: "excel/no-escaping-at-all",
    file: "src/tools/excel.ts",
    description: "emit raw cell values with no CSV escaping",
    find: "fields.push(escapeCsvField(cellToString(row.getCell(c).value)));",
    replace: 'fields.push(String(row.getCell(c).value ?? ""));',
  },

  // ------------------------------------------------------------ bulk / data safety
  {
    id: "bulk/ignore-batch-size",
    file: "src/tools/bulk.ts",
    description: "ignore batch_size and send everything as one batch",
    find: "const batchSize = input.batch_size || 100;",
    replace: "const batchSize = Number.MAX_SAFE_INTEGER;",
  },
  {
    id: "bulk/skip-required-validation",
    file: "src/tools/bulk.ts",
    description: "skip the missing-required-field check on create",
    find: "errors.push(`Missing required field: ${field}`);",
    replace: "",
  },
  {
    id: "bulk/unlink-ignores-dry-run",
    file: "src/tools/bulk.ts",
    description: "delete records even when validate_only was requested",
    find:
      'if (input.operation === "unlink" && input.record_ids) {\n      result.total = input.record_ids.length;\n\n' +
      "      if (validateOnly) {",
    replace:
      'if (input.operation === "unlink" && input.record_ids) {\n      result.total = input.record_ids.length;\n\n' +
      "      if (false) {",
  },

  // ------------------------------------------------------------------- access
  {
    id: "access/always-granted",
    file: "src/tools/access.ts",
    description: "report access as granted whatever Odoo answers",
    find: "hasModelAccess = accessResult === true;",
    replace: "hasModelAccess = true;",
  },

  // ------------------------------------------------------------------- actions
  {
    id: "actions/hardcoded-action",
    file: "src/tools/actions.ts",
    description: "run a hardcoded workflow action instead of the requested one",
    find: "        input.action,\n        [input.record_ids],",
    replace: '        "action_confirm",\n        [input.record_ids],',
  },
  {
    id: "actions/ignore-record-ids",
    file: "src/tools/actions.ts",
    description: "run the action against no records",
    find: "        input.action,\n        [input.record_ids],",
    replace: "        input.action,\n        [[]],",
  },
  {
    id: "actions/drop-context",
    file: "src/tools/actions.ts",
    description: "drop the caller's context when executing an action",
    find: "        input.context || {},",
    replace: "        {},",
  },

  // -------------------------------------------------------------------- search
  {
    id: "search/ignore-caller-limit",
    file: "src/tools/search.ts",
    description: "ignore the caller's limit in find_record_by_name",
    find: "const limit = input.limit || 10;",
    replace: "const limit = 999;",
  },
  {
    id: "search/has-more-off-by-one",
    file: "src/tools/search.ts",
    description: "off-by-one in the has_more pagination check",
    find: "const hasMore = recordArray.length > limit;",
    replace: "const hasMore = recordArray.length >= limit;",
  },
  {
    id: "search/no-lookahead-row",
    file: "src/tools/search.ts",
    description: "stop fetching the extra row used to detect further pages",
    find: "limit: limit + 1, // Fetch one extra to check if there are more",
    replace: "limit: limit,",
  },

  // -------------------------------------------------------------- introspection
  {
    id: "introspection/everything-required",
    file: "src/tools/introspection.ts",
    description: "describe every field as required in explain_field guidance",
    find: "if (fieldDef.required) {",
    replace: "if (true) {",
  },
];
