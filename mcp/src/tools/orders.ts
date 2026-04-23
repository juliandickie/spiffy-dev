import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

export function registerOrderTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "order_get",
    "Get a single order by ID, including line items.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/orders/${args.id}`)),
  );

  server.tool(
    "orders_list",
    "List orders with optional filters. Dates as ISO-8601.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
      "filter.customer_id": z
        .number()
        .int()
        .optional()
        .describe("Filter by customer ID"),
      "filter.created_at.gte": z
        .string()
        .optional()
        .describe("Created on or after (ISO-8601)"),
      "filter.created_at.lte": z
        .string()
        .optional()
        .describe("Created on or before (ISO-8601)"),
      "filter.currency": z.string().optional(),
    },
    async (args) => jsonResult(await client.get("/v2/orders/", normalizeFilterArgs(args))),
  );
}
