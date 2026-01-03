#!/usr/bin/env node
import { parseArgs } from "./cli.js";
import { runHttpServer } from "./http-server.js";
import { runServer } from "./server.js";

async function main(): Promise<number> {
  try {
    const options = parseArgs();

    if (options.transport === "http") {
      await runHttpServer({ port: options.port, host: options.host });
    } else {
      await runServer();
    }
    return 0;
  } catch (error) {
    console.error("Error starting server:", error);
    return 1;
  }
}

main()
  .then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
