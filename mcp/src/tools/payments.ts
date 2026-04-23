import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

export function registerPaymentTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "payment_get",
    "Get a single payment by ID.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/payments/${args.id}`)),
  );

  server.tool(
    "payments_list",
    "List payments. Filter by status ('successful', 'failed', 'refunded') for dashboards.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z.string().optional(),
      "filter.created_at.gte": z.string().optional(),
      "filter.created_at.lte": z.string().optional(),
    },
    async (args) =>
      jsonResult(await client.get("/v2/payments/", normalizeFilterArgs(args))),
  );

  server.tool(
    "payment_plan_get",
    "Get a single payment plan (for installment purchases).",
    { id: z.number().int() },
    async (args) =>
      jsonResult(await client.get(`/v2/paymentplans/${args.id}`)),
  );

  server.tool(
    "payment_plans_list",
    "List payment plans. Useful for arrears reports ('who's behind on installments').",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z.string().optional(),
    },
    async (args) =>
      jsonResult(
        await client.get("/v2/paymentplans/", normalizeFilterArgs(args)),
      ),
  );
}
