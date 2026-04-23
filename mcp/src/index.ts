#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SpiffyClient } from "./client.js";
import { SpiffyError } from "./errors.js";
import { registerMetaTools } from "./tools/meta.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerSubscriptionTools } from "./tools/subscriptions.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new SpiffyClient(config);

  // Startup validation: confirm the API key works before we accept any tool calls.
  try {
    const account = await client.get<{ name?: string }>("/v2/account");
    console.error(
      `[spiffy-mcp] Connected to Spiffy account: ${account.name ?? "(unnamed)"}${
        config.dryRun ? " [DRY RUN — writes disabled]" : ""
      }`,
    );
  } catch (err) {
    if (err instanceof SpiffyError && err.status === 401) {
      console.error(
        "[spiffy-mcp] ERROR: API key invalid (401 Unauthorized). " +
          "Regenerate your key at Settings → API in the Spiffy dashboard.",
      );
    } else {
      console.error(
        `[spiffy-mcp] ERROR: could not reach Spiffy API: ${(err as Error).message}`,
      );
    }
    process.exit(1);
  }

  const server = new McpServer({
    name: "spiffy",
    version: "0.1.0",
  });

  registerMetaTools(server, client);
  registerCustomerTools(server, client);
  registerOrderTools(server, client);
  registerSubscriptionTools(server, client);
  // More tool registrations are added in subsequent tasks.

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[spiffy-mcp] Fatal: ${(err as Error).message}`);
  process.exit(1);
});
