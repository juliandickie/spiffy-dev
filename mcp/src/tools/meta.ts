import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export interface SpiffyAccount {
  account_id?: number;
  account_name?: string;
  user_id?: number;
  user_email?: string;
  user_name?: string;
}

/**
 * Fetch the currently-authenticated Spiffy account.
 *
 * Uses /v1/account. /v2/account does not exist (returns 404 HTML); see
 * docs/spiffy-api-gotchas-and-patterns.md Part 7.1. The v1 response is
 * flat (no {data: {...}} wrapper) with fields account_id, account_name,
 * user_id, user_email, user_name.
 */
export async function getAccount(client: SpiffyClient): Promise<SpiffyAccount> {
  return client.get<SpiffyAccount>("/v1/account");
}

export function registerMetaTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "account_get",
    "Get the currently-authenticated Spiffy account. Returns account_id, " +
      "account_name, user_id, user_email, user_name. " +
      "Uses /v1/account because /v2/account does not exist (404). The v1 " +
      "response is flat with no `data` wrapper, unlike most v2 endpoints.",
    {},
    async () => jsonResult(await getAccount(client)),
  );
}
