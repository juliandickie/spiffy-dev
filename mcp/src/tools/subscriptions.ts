import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

export function registerSubscriptionTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "subscription_get",
    "Get a single subscription by ID (status, current period, next renewal).",
    { id: z.number().int() },
    async (args) =>
      jsonResult(await client.get(`/v2/subscriptions/${args.id}`)),
  );

  server.tool(
    "subscriptions_list",
    "List subscriptions with optional filters. Useful for churn reports and status dashboards.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.status": z
        .string()
        .optional()
        .describe("e.g. active, canceled, past_due"),
      "filter.created_at.gte": z.string().optional(),
      "filter.created_at.lte": z.string().optional(),
    },
    async (args) =>
      jsonResult(
        await client.get("/v2/subscriptions/", normalizeFilterArgs(args)),
      ),
  );

  server.tool(
    "subscription_billing_schedule",
    "Get a subscription's upcoming billing date and status (projection of " +
      "subscription_get). " +
      "Returns id, status, next_payment_at (the actual field name; not " +
      "`next_billing_date`), canceled_at, unpaid_at, trial_days, " +
      "current_payment_status, and product_option_price_id. " +
      "\n\n" +
      "Note. The subscription record does NOT carry a price field directly. " +
      "To resolve to a dollar amount, use product_option_price_id with the " +
      "associated product (call `product_get` and walk options[].prices[]). " +
      "Spiffy v2 single-resource responses wrap the resource in {data: {...}}; " +
      "this tool unwraps that for you.",
    { id: z.number().int() },
    async (args) => {
      const raw = await client.get<{
        data?: Record<string, unknown>;
      } & Record<string, unknown>>(`/v2/subscriptions/${args.id}`);
      const sub = (raw.data ?? raw) as Record<string, unknown>;
      return jsonResult({
        id: sub.id,
        status: sub.status,
        next_payment_at: sub.next_payment_at,
        canceled_at: sub.canceled_at,
        unpaid_at: sub.unpaid_at,
        trial_days: sub.trial_days,
        current_payment_status: sub.current_payment_status,
        product_option_price_id: sub.product_option_price_id,
      });
    },
  );
}
