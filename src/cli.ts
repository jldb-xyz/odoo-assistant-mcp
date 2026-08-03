/**
 * CLI argument parsing for the Odoo MCP server
 */

export interface CliOptions {
  transport: "stdio" | "http";
  port: number;
  host: string;
  /**
   * Extra hostnames accepted in the Host and Origin headers. Required when the
   * server sits behind an ingress or reverse proxy, where the Host is the
   * public name rather than the bind address.
   */
  allowedHosts: string[];
}

/** Split a comma-separated host list, discarding blanks. */
function parseHostList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Parse command-line arguments
 * @param argv - Arguments to parse (defaults to process.argv.slice(2))
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {
    transport: "stdio",
    port: Number.parseInt(process.env.ODOO_MCP_PORT ?? "3000", 10),
    host: process.env.ODOO_MCP_HOST ?? "127.0.0.1",
    allowedHosts: parseHostList(process.env.ODOO_MCP_ALLOWED_HOSTS),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    if (arg === "--http") {
      options.transport = "http";
    } else if (arg === "--port" && nextArg !== undefined) {
      options.port = Number.parseInt(nextArg, 10);
      i++;
    } else if (arg === "--host" && nextArg !== undefined) {
      options.host = nextArg;
      i++;
    } else if (arg === "--allowed-hosts" && nextArg !== undefined) {
      options.allowedHosts = parseHostList(nextArg);
      i++;
    }
  }

  return options;
}
