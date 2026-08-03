# Deployment

How to run the Odoo MCP server, from a laptop to a cluster.

For day-to-day usage see the [User Guide](USER_GUIDE.md); for how the pieces fit
together see [Architecture](DESIGN.md).

## Contents

- [Choosing a transport](#choosing-a-transport)
- [Read this before you host it](#read-this-before-you-host-it)
- [Local (stdio)](#local-stdio)
- [Docker](#docker)
- [Docker Compose with a proxy](#docker-compose-with-a-proxy)
- [Kubernetes](#kubernetes)
- [systemd](#systemd)
- [Cloudflare Workers](#cloudflare-workers)
- [Configuration reference](#configuration-reference)
- [Health checks](#health-checks)
- [Scaling](#scaling)
- [Authentication](#authentication)
- [Troubleshooting](#troubleshooting)

## Choosing a transport

| | stdio | Streamable HTTP |
|---|---|---|
| How it starts | The MCP client spawns it | You run it as a service |
| Who can reach it | That one client, over a pipe | Anything that can reach the port |
| Authentication | Not applicable — no network surface | **None built in.** You must add it |
| Credentials | The user's own Odoo API key | One shared service account |
| Scaling | One process per user | Horizontal, stateless |
| Best for | Individuals, laptops, per-user keys | Teams, shared agents, remote clients |

**Start with stdio.** It needs no hosting, gives each person their own Odoo
identity, and has no network attack surface. Reach for HTTP when you need a
shared endpoint that several clients or an automated agent can call.

## Read this before you host it

Three properties matter more than any of the mechanics below.

**The HTTP transport has no authentication.** There is no login, no token check,
no OAuth. Anyone who can reach `/mcp` can read and write your Odoo data. It
binds to `127.0.0.1` by default and validates `Host` and `Origin` headers to
block DNS-rebinding attacks from a browser, but those protections assume a local
bind — they are not an authorisation layer. Exposing it means putting something
in front of it; see [Authentication](#authentication).

**It acts entirely as one Odoo user and enforces no permissions of its own.**
Every tool call runs as `ODOO_USERNAME`. Odoo's own access rules are the only
thing standing between a caller and your data, so scope that account to what the
assistant genuinely needs. `check_access` reports what Odoo will allow; it does
not restrict anything.

**Some tools are destructive by design.** `execute_method` can call any method on
any model, `bulk_operation` can delete records, and `execute_action` can run
workflow transitions. They are annotated so clients can prompt for confirmation,
but annotations are hints — a determined caller is limited only by the Odoo
account's permissions.

## Local (stdio)

No hosting. The client spawns the process and talks over stdin/stdout.

```json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": ["odoo-mcp"],
      "env": {
        "ODOO_URL": "https://your-instance.odoo.com",
        "ODOO_DB": "your_database",
        "ODOO_USERNAME": "your_username",
        "ODOO_PASSWORD": "your_api_key"
      }
    }
  }
}
```

Put this in `.mcp.json` for Claude Code, or the equivalent config for your
client. Credentials can also come from a config file instead of `env` — see
[Configuration reference](#configuration-reference).

## Docker

The image is built from the `Dockerfile` at the repo root: multi-stage, runs as
the non-root `node` user, production dependencies only, with a healthcheck.

```bash
docker build -t odoo-mcp .

docker run -d --name odoo-mcp \
  -p 127.0.0.1:3000:3000 \
  -e ODOO_URL=https://odoo.example.com \
  -e ODOO_DB=production \
  -e ODOO_USERNAME=mcp-service-account \
  -e ODOO_PASSWORD=your_api_key \
  odoo-mcp
```

Note `-p 127.0.0.1:3000:3000` rather than `-p 3000:3000`. The latter publishes
to every interface, and on a host without a firewall that puts an
unauthenticated Odoo proxy on the public internet.

Pass the API key as a file rather than an env var where you can — `docker run
--env-file`, a Compose secret, or your orchestrator's secret store. Environment
variables show up in `docker inspect` and in the process list.

## Docker Compose with a proxy

[`examples/deploy/docker-compose.yml`](../examples/deploy/docker-compose.yml)
runs the server on an internal network with no published ports, and puts Caddy
in front to terminate TLS and check a bearer token. The
[`Caddyfile`](../examples/deploy/Caddyfile) leaves `/health` and `/ready`
unauthenticated so uptime checks work without a credential.

```bash
export PUBLIC_HOSTNAME=mcp.example.com
export MCP_BEARER_TOKEN='...'          # `caddy hash-password` output
export ODOO_URL=https://odoo.example.com
export ODOO_DB=production
export ODOO_USERNAME=mcp-service-account
export ODOO_PASSWORD=...

docker compose -f examples/deploy/docker-compose.yml up -d
```

`ODOO_MCP_ALLOWED_HOSTS` must include the public hostname. The proxy forwards
the original `Host`, and the server rejects any name it does not recognise.

## Kubernetes

[`examples/deploy/kubernetes/odoo-mcp.yaml`](../examples/deploy/kubernetes/odoo-mcp.yaml)
has a Deployment, Service, ConfigMap, Secret, PodDisruptionBudget and Ingress.

```bash
kubectl apply -f examples/deploy/kubernetes/odoo-mcp.yaml
```

Points worth keeping if you adapt it:

- **`ODOO_MCP_ALLOWED_HOSTS` must list the Ingress hostname.** Without it every
  request is rejected as a DNS-rebinding attempt. The probes are exempt, so a
  healthy pod that answers no traffic is the symptom.
- **Liveness uses `/health`, readiness uses `/ready`.** Liveness deliberately
  does not depend on Odoo — otherwise an Odoo outage becomes a cluster-wide
  restart storm on top of the outage.
- **A `startupProbe` covers a slow Odoo at boot.** The server authenticates
  before it listens, so a slow instance must not look like a crash loop.
- **`readOnlyRootFilesystem: true` needs a writable `/tmp`.** The manifest mounts
  an `emptyDir`. `save_doc` and `save_sop` write to `./.odoo-mcp`, which is
  ephemeral here — mount a volume if you want them to persist.
- **Authentication belongs on the Ingress.** The example annotates for an OAuth2
  proxy; without something in that position the endpoint is open.

## systemd

For a plain VM. [`examples/deploy/odoo-mcp.service`](../examples/deploy/odoo-mcp.service)
is a hardened unit — `ProtectSystem=strict`, `NoNewPrivileges`, a restricted
syscall filter, and a dedicated service user.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin odoo-mcp
sudo mkdir -p /opt/odoo-mcp && sudo chown odoo-mcp:odoo-mcp /opt/odoo-mcp

# Install the built package
sudo -u odoo-mcp npm install --prefix /opt/odoo-mcp odoo-mcp

sudo install -m 0600 /dev/null /etc/odoo-mcp.env
sudo editor /etc/odoo-mcp.env
sudo cp examples/deploy/odoo-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now odoo-mcp
journalctl -u odoo-mcp -f
```

`/etc/odoo-mcp.env` holds the API key, so `0600 root:root` matters — systemd
reads it as root before dropping to the service user, which never needs access.

```ini
ODOO_URL=https://odoo.example.com
ODOO_DB=production
ODOO_USERNAME=mcp-service-account
ODOO_PASSWORD=your_api_key
ODOO_MCP_HOST=127.0.0.1
ODOO_MCP_PORT=3000
```

Check `command -v node` and correct `ExecStart` — nvm and distro packages put
the binary in different places, and systemd needs an absolute path.

## Cloudflare Workers

The MCP layer is fetch-shaped, so it runs on Workers directly with no Node HTTP
server. [`examples/deploy/cloudflare/`](../examples/deploy/cloudflare/) has a
worker and a `wrangler.jsonc`.

```bash
cd examples/deploy/cloudflare
npm install odoo-mcp @modelcontextprotocol/server
wrangler secret put ODOO_PASSWORD
wrangler deploy
```

**What works.** The Odoo tools — introspection, search, bulk operations, actions,
access checks — all reach Odoo over XML-RPC through `nodejs_compat`, on both the
2026-07-28 and 2025-era protocols. This was verified end to end against a live
Odoo instance on `workerd`.

**What does not.** Workers has a virtual, in-memory filesystem, so anything
touching real files is unavailable. Each fails as a clean tool error rather than
taking the Worker down:

| Tool | Behaviour on Workers |
|---|---|
| `list_excel_sheets`, `convert_excel` | Fail — there is no local file to read |
| `read_doc`, `list_docs` | Return empty; bundled docs are not in the Worker bundle |
| `save_doc`, `save_sop` | Fail with "operation not permitted" |
| Everything Odoo-facing | Works |

**Constraints to know.**

- `nodejs_compat` is required, with a `compatibility_date` of `2025-08-15` or
  later so outbound `node:http` is enabled.
- The Odoo client is built **per request**. Workers only permits `node:http`
  inside a fetch handler, and there is no long-lived process to hold a
  connection, so every request re-authenticates to Odoo. Factor that into your
  Odoo capacity.
- There is no reverse proxy by default, so authentication has to live in the
  Worker. The example checks a bearer token; prefer Cloudflare Access in front
  of the route for real identity and revocation.

## Configuration reference

Environment variables, or a JSON config file at `./odoo_config.json`,
`~/.config/odoo/config.json` or `~/.odoo_config.json`. Environment wins.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ODOO_URL` | yes | — | Odoo base URL |
| `ODOO_DB` | yes | — | Database name |
| `ODOO_USERNAME` | yes | — | Login for the service account |
| `ODOO_PASSWORD` | yes | — | API key (preferred) or password |
| `ODOO_TIMEOUT` | no | `30` | Per-call timeout, seconds |
| `ODOO_VERIFY_SSL` | no | on | `0`/`false`/`no` disables TLS verification |
| `ODOO_MCP_HOST` | no | `127.0.0.1` | Bind address for `--http` |
| `ODOO_MCP_PORT` | no | `3000` | Port for `--http` |
| `ODOO_MCP_ALLOWED_HOSTS` | no | — | Extra `Host`/`Origin` values to accept, comma-separated |

CLI flags override the environment: `--http`, `--port`, `--host`,
`--allowed-hosts`.

Only disable `ODOO_VERIFY_SSL` against a development instance. It disables
certificate verification for every Odoo call, including the one carrying your
API key.

## Health checks

| Path | Meaning | Use for |
|---|---|---|
| `GET /health` | The process is up and serving | Liveness, uptime monitoring |
| `GET /ready` | This instance holds an authenticated Odoo session | Readiness, load-balancer membership |

Both return JSON and are exempt from the `Host` allowlist, because probes
address the container by IP, which is never an allowed name.

`/ready` does **not** call Odoo. Probes run every few seconds per replica, and
turning them into Odoo traffic is a self-inflicted load problem. A broken Odoo
surfaces as failing tool calls, which is where it belongs.

```bash
curl -s http://127.0.0.1:3000/health   # {"status":"ok","version":"2.0.0"}
curl -s http://127.0.0.1:3000/ready    # {"status":"ready"}
```

## Scaling

MCP revision 2026-07-28 is **stateless**. There is no session, no
`Mcp-Session-Id`, and no per-connection state, so replicas need no sticky
routing, no shared cache and no coordination. Add replicas behind a plain
round-robin load balancer.

The practical limit is Odoo, not this server. Each tool call is one or more
XML-RPC calls, so a busy agent fleet lands on Odoo directly. Watch Odoo's worker
count and database connections before scaling this tier.

Each instance holds one authenticated Odoo session and roughly 100 MB of memory
at rest. The Kubernetes example requests 50m CPU / 128Mi and caps memory at
512Mi, which is a reasonable starting point to tune from.

## Authentication

The server has none. Every hosted deployment needs something in front of it.
Roughly in order of increasing strength:

**Network isolation.** Bind to loopback or a private network and never expose it.
The strongest option when the clients are co-located.

**Static bearer token at a reverse proxy.** The
[Caddyfile example](../examples/deploy/Caddyfile) checks an `Authorization`
header before proxying. Cheap and workable for a small trusted team, but it is a
single shared credential with no expiry, no rotation and no per-user
attribution.

**Identity provider in front.** An OAuth2 proxy, Cloudflare Access, or your
ingress controller's external-auth hook. Gives real identities, revocation and an
audit trail. This is what to use for anything beyond a handful of trusted users.

**mTLS.** Where clients are services rather than people.

Whichever you pick, leave `/health` and `/ready` unauthenticated so uptime
checks work — they expose only a status and a version string.

## Troubleshooting

**Every request returns 403.** The `Host` or `Origin` header is not in the
allowlist. Add the public hostname to `ODOO_MCP_ALLOWED_HOSTS`. This is the usual
symptom of a pod that passes its probes but serves no traffic — probes bypass the
allowlist, real requests do not.

**The container exits immediately.** The server authenticates to Odoo before it
listens, so bad credentials or an unreachable Odoo mean it never starts. Check
`docker logs` / `journalctl -u odoo-mcp`; the connection attempt is logged with
the URL, database and username, with the password masked.

**Long tool calls are truncated.** Streamable HTTP responses can be long-lived
SSE streams. Disable response buffering and raise the read timeout on your proxy
— `flush_interval -1` in Caddy, `proxy-buffering: "off"` plus a large
`proxy-read-timeout` in ingress-nginx.

**Tools fail with permission errors.** The server enforces nothing itself; that
is Odoo refusing the service account. Use `check_access` to see what it is
allowed to do.

**`save_doc` succeeds but the doc disappears.** It writes to `./.odoo-mcp` in the
working directory, which is ephemeral in a container. Mount a volume, or treat
docs and SOPs as read-only in that deployment.
