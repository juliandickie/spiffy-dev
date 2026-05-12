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
import { registerPaymentTools } from "./tools/payments.js";
import { registerProductTools } from "./tools/products.js";
import { registerPromoReadTools } from "./tools/promos.js";
import { registerAffiliateTools } from "./tools/affiliates.js";
import { registerCheckoutTools } from "./tools/checkouts.js";
import { registerWriteTools } from "./tools/writes.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new SpiffyClient(config);

  // Startup validation: confirm the API key works before we accept any tool calls.
  // Uses /v1/account because /v2/account does not exist (returns 404 HTML).
  // The v1 response is flat (no data wrapper) with fields: account_id, account_name,
  // user_id, user_email, user_name.
  try {
    const account = await client.get<{ account_name?: string }>("/v1/account");
    console.error(
      `[spiffy-mcp] Connected to Spiffy account: ${account.account_name ?? "(unnamed)"}${
        config.dryRun ? " [DRY RUN, writes disabled]" : ""
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
  registerPaymentTools(server, client);
  registerProductTools(server, client);
  registerPromoReadTools(server, client);
  registerAffiliateTools(server, client);
  registerCheckoutTools(server, client);
  registerWriteTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[spiffy-mcp] Fatal: ${(err as Error).message}`);
  process.exit(1);
});
