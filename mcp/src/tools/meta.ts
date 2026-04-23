import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpiffyClient } from "../client.js";

export function registerMetaTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "account_get",
    "Get the currently-authenticated Spiffy account (name, plan, quota usage).",
    {},
    async () => {
      const account = await client.get("/v2/account");
      return {
        content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
      };
    },
  );
}
