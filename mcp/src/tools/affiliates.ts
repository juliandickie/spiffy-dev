import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerAffiliateTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "affiliate_get",
    "Get a single affiliate by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/affiliates/${args.id}`)),
  );

  server.tool(
    "affiliates_list",
    "List all affiliates.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) => {
      const params: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) params[k] = v as string | number | boolean;
      }
      return jsonResult(await client.get("/v2/affiliates/", params));
    },
  );

  server.tool(
    "affiliate_program_get",
    "Get a single affiliate program by ID (contains checkouts, prices, options, links).",
    { program_id: z.number().int() },
    async (args) =>
      jsonResult(await client.get(`/v2/affiliates/programs/${args.program_id}`)),
  );
}
