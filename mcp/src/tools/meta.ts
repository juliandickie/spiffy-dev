import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpiffyClient } from "../client.js";

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
    async () => {
      const account = await client.get("/v1/account");
      return {
        content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
      };
    },
  );
}
