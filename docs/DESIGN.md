# Architecture

How the Odoo MCP server is put together. For usage see the
[User Guide](USER_GUIDE.md).

## Shape

```
MCP client  ──stdio or Streamable HTTP──▶  odoo-mcp  ──XML-RPC──▶  Odoo
```

The server is a thin, well-typed translation layer. It holds no database of its
own; the only local state is the authenticated Odoo session and the markdown
docs/SOPs on disk.

## Protocol

The server implements MCP revision **2026-07-28**, which is stateless: there is
no `initialize` handshake and no session header. Each request carries its own
protocol version, and the server advertises its capabilities through
`server/discover`.

Both entry points serve the older 2025-era handshake as well, from the same
server factory, so clients that have not moved yet keep working unchanged:

| Transport | Entry point | Source |
|-----------|-------------|--------|
| stdio | `serveStdio(factory)` | `src/server.ts` |
| Streamable HTTP | `createMcpHandler(factory)` + `toNodeHandler` | `src/http-server.ts` |

Passing a *factory* rather than a built server is what allows this: the SDK
decides the era from the opening exchange, then builds and pins one server
instance for that connection (stdio) or request (HTTP).

## Layers

### `src/connection/` — talking to Odoo

- `xmlrpc.ts` wraps the `xmlrpc` package with a timeout and TLS options.
- `odoo-client.ts` is `OdooClient`: authenticates against `/xmlrpc/2/common`
  to obtain a `uid`, then issues every subsequent call as `execute_kw` against
  `/xmlrpc/2/object`.
- `config.ts` loads credentials from environment variables, falling back to
  JSON config files.

Tools never see `OdooClient` directly — they depend on the `IOdooClient`
interface (`src/types/client-interface.ts`), which is what makes them testable
without a live Odoo.

Note that several `OdooClient` methods resolve to `{ error }` rather than
rejecting. Use the shared `isError()` guard from `src/tools/result-utils.ts`
before treating a result as data.

### `src/tools/` — the tool surface

Tools are values, not registrations. Each is built with `defineTool()` and
collected into a `ToolRegistry`:

```ts
export const FooInputSchema = z.object({ model: z.string() });

export const fooTool = defineTool({
  name: "foo",
  title: "Foo",
  annotations: { readOnlyHint: true, openWorldHint: true },
  description: "…",
  inputSchema: FooInputSchema.shape,
  handler: async (client, input) => ({ success: true, result: … }),
});
```

Two rules worth keeping:

1. **Pass `FooInputSchema.shape`, never a re-declared inline shape.** Declaring
   the schema twice is how `bulk_operation` silently lost its `batch_size`
   bounds from the published tool schema.
2. **Set `annotations` honestly.** Clients use `readOnlyHint` and
   `destructiveHint` to decide what needs confirmation. They are hints, not a
   security boundary, but a wrong hint actively misleads.

Handlers return `{ success, result?, error? }`. `src/server.ts` translates that
into an MCP `CallToolResult`, setting `isError: true` when `success` is false so
a failure is not read as a success.

### `src/resources/` — URI-addressable reads

`odoo://models`, `odoo://model/{name}`, `odoo://record/{model}/{id}` and
`odoo://search/{model}/{domain}`. These duplicate what the introspection and
search tools do, exposed in the form clients prefer for browsing.

### `src/docs-system/` — docs and SOPs

Markdown resolved from three layers, later ones overriding earlier:

| Layer | Docs | SOPs |
|-------|------|------|
| bundled | `dist/docs/` (from `src/docs/`) | — |
| global | `~/.odoo-mcp/docs/` | `~/.odoo-mcp/sops/` |
| local | `./.odoo-mcp/docs/` | `./.odoo-mcp/sops/` |

There are deliberately no bundled SOPs — SOPs are user-authored. Starting
points live in `examples/sops/`.

**Entry names are model-controlled input.** `readEntry`, `saveEntry` and
`deleteEntry` reject anything that is not a flat file name — no separators, no
`..`, no absolute paths — and verify the resolved path is a direct child of the
target directory. Without that, `save_doc` is an arbitrary file write. Do not
relax it.

## Security posture

- **Credentials** come from the environment or a config file and are never
  logged (`logEnvironment()` masks `ODOO_PASSWORD`).
- **Authorization is Odoo's.** The server acts as the configured user and
  enforces no permissions of its own; `check_access` reports what Odoo will
  allow. Grant the API user only the access it needs.
- **The HTTP transport is unauthenticated.** It binds to loopback and validates
  `Host` and `Origin` to stop DNS-rebinding, which assumes a local bind. Put an
  authenticating proxy in front of any non-loopback deployment.
- **`execute_method` is arbitrary code execution against Odoo** by design — it
  can call any method on any model. It is annotated destructive so clients can
  gate it.

## Testing

- Unit tests sit beside their source (`src/**/*.test.ts`) and use
  `MockClientBuilder` instead of a live Odoo.
- `src/http-server.test.ts` drives a real MCP client against the handler
  in-process, covering both protocol eras.
- Integration tests (`src/__tests__/integration/`) run against real Odoo
  containers via `vitest.integration.config.ts` and are excluded from the
  default run. CI exercises Odoo 14 through 19. They report as *skipped* when
  Odoo is absent, and `REQUIRE_INTEGRATION_TESTS=true` (set in CI) makes an
  unreachable Odoo a hard failure — a suite that passes without ever running is
  worse than no suite.
- `pnpm test:mutation` injects catalogued bugs (`scripts/mutations.mjs`) and
  requires the suite to go red for each. This is the check on whether the tests
  can detect anything, as opposed to merely executing lines.
