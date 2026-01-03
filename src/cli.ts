/**
 * CLI argument parsing for the Odoo MCP server
 */

export interface CliOptions {
  transport: "stdio" | "http";
  port: number;
  host: string;
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
    }
  }

  return options;
}
