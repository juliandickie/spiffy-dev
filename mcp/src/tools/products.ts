import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export function registerProductTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "product_get",
    "Get a single product (course, bundle) by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/products/${args.id}`)),
  );

  server.tool(
    "products_list",
    "List all products in the Spiffy account.",
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
      return jsonResult(await client.get("/v2/products/", params));
    },
  );
}
