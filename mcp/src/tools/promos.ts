import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

export function registerPromoReadTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "promo_list",
    "List all promos (code, discount, uses, expiry, is_expired).",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) =>
      jsonResult(await client.get("/v2/promos/", normalizeFilterArgs(args))),
  );

  server.tool(
    "promo_get",
    "Get a single promo by ID. Includes ordered_count and is_expired.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/promos/${args.id}`)),
  );
}
