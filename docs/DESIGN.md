# Odoo MCP

## Core Components You'd Need

**XML-RPC client:**

```typescript
// Odoo uses XML-RPC, so you'd need something like 'xmlrpc' package
// or roll a minimal implementation over fetch
interface OdooConnection {
  url: string
  db: string
  uid: number  // obtained after authenticate()
  password: string
}
```

**Authentication flow:**

```typescript
// Odoo's standard two-step: common.authenticate → returns uid
// Then all subsequent calls go to object.execute_kw
async function authenticate(
  url: string, 
  db: string, 
  username: string, 
  password: string
): Promise<number>  // returns uid
```

**The generic execute wrapper:**

```typescript
// This is the heart of it — everything goes through execute_kw
async function executeKw<T>(
  conn: OdooConnection,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T>
```

**Then your tools layer on top:**

```typescript
// Tools become thin wrappers with good typing
const tools = {
  searchRead: (model, domain, fields, limit),
  create: (model, values),
  bulkCreate: (model, records, batchSize),
  resolveReferences: (model, lookupField, values),
  getModelSchema: (model),
  analyzeImportMapping: (csvColumns, targetModel),
}
```

## Suggested Structure

```
mcp-odoo-ts/
├── src/
│   ├── connection/
│   │   ├── xmlrpc.ts        # Low-level XML-RPC over fetch
│   │   └── odoo-client.ts   # Auth + execute_kw wrapper
│   ├── tools/
│   │   ├── schema.ts        # Model introspection tools
│   │   ├── crud.ts          # Basic read/write operations
│   │   ├── bulk.ts          # Batch import tools
│   │   └── import-analysis.ts
│   ├── resources/
│   │   └── odoo-resources.ts  # URI-based resource handlers
│   └── server.ts            # MCP server setup + tool registration
├── package.json
└── tsconfig.json
```
