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
    "Get a subscription's upcoming billing date and recent billing info " +
      "(projection of subscription_get). " +
      "NOTE: `price` is read as a flat field here. If your subscription returns null " +
      "for price, the value may live nested at `options[].prices[].amount` (in cents) " +
      "and you should call `subscription_get` for the full structure. " +
      "See docs/spiffy-api-gotchas-and-patterns.md (gotcha 1.9).",
    { id: z.number().int() },
    async (args) => {
      const sub = await client.get<Record<string, unknown>>(
        `/v2/subscriptions/${args.id}`,
      );
      return jsonResult({
        id: sub.id,
        status: sub.status,
        next_billing_date: sub.next_billing_date,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        price: sub.price,
      });
    },
  );
}
