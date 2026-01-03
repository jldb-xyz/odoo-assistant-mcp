#!/usr/bin/env node
import { runServer } from "./server.js";

async function main(): Promise<number> {
  try {
    await runServer();
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
