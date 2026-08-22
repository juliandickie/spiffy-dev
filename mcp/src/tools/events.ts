import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

export async function listEvents(
  client: SpiffyClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  return client.get("/v2/events", normalizeFilterArgs(args));
}

export function registerEventTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "events_list",
    "List audit events, the account activity log. Each event records an " +
      "action taken by a dashboard user, a customer, or the system " +
      "(automated billing): subscription changes, payments, card updates, " +
      "notes, and more. `name` identifies the action, `data` carries " +
      "action-specific detail, and the *_id fields link to the related " +
      "customer, order, subscription, payment plan, or payment. New in " +
      "Spiffy r85.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.name": z
        .string()
        .optional()
        .describe("Action name, e.g. subscription.canceled"),
      "filter.type": z.string().optional(),
      "filter.user_id": z.number().int().optional(),
      "filter.customer_id": z.number().int().optional(),
      "filter.order_id": z.number().int().optional(),
      "filter.subscription_id": z.number().int().optional(),
      "filter.paymentplan_id": z.number().int().optional(),
      "filter.payment_id": z.number().int().optional(),
      "filter.created_at.gte": z.string().optional(),
      "filter.created_at.lte": z.string().optional(),
      sort: z.string().optional().describe("e.g. '-created_at'"),
    },
    async (args) => jsonResult(await listEvents(client, args)),
  );
}
