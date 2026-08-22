import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export interface AnalyticsQueryArgs {
  object: "account" | "checkout" | "product";
  objId?: string;
  metrics: string[];
  groupBy: string;
  period: { start: string; end: string };
  compare?: "previous_period" | { start: string; end: string };
  grouping?: "day" | "week" | "month";
  touch?: "first" | "last";
}

/**
 * Fetch the analytics catalog: every metric with its family, kind, date
 * anchor, and compatible groupBy values, plus dimensions, intervals, and
 * comparison modes. Call before queryAnalytics to construct valid queries.
 */
export async function getAnalyticsCapabilities(
  client: SpiffyClient,
): Promise<unknown> {
  return client.get("/v2/analytics/capabilities");
}

/**
 * Run an analytics query against /v2/analytics/query.
 *
 * This is a POST but it is a pure read (no account state changes), so it
 * goes through client.postRead and works even under SPIFFY_DRY_RUN.
 */
export async function queryAnalytics(
  client: SpiffyClient,
  args: AnalyticsQueryArgs,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    object: args.object,
    metrics: args.metrics,
    groupBy: args.groupBy,
    period: args.period,
  };
  if (args.objId !== undefined) body.objId = args.objId;
  if (args.compare !== undefined) body.compare = args.compare;
  if (args.grouping !== undefined) body.grouping = args.grouping;
  if (args.touch !== undefined) body.touch = args.touch;
  return client.postRead("/v2/analytics/query", body);
}

export function registerAnalyticsTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "analytics_capabilities",
    "List the available analytics metrics, dimensions, and groupings. " +
      "Returns every metric with its family, kind (flow/stock/derived), date " +
      "anchor, and compatible groupBy values, plus dimensions, intervals, and " +
      "comparison modes. Call this before analytics_query to construct valid " +
      "queries.",
    {},
    async () => jsonResult(await getAnalyticsCapabilities(client)),
  );

  server.tool(
    "analytics_query",
    "Query dashboard-accurate analytics: revenue, orders, AOV, LTV, " +
      "conversion rate, MRR, subscriptions, refunds, as totals, time series, " +
      "or attribution breakdowns. Prefer this over client-side computation " +
      "across raw list endpoints; the numbers match the Spiffy dashboard. " +
      "\n\n" +
      "groupBy 'interval' returns a day/week/month time series (set " +
      "grouping). groupBy a dimension (channel, utm_source, utm_medium, " +
      "utm_campaign, utm_term, utm_content, referring_domain) breaks " +
      "orders-family metrics down by attribution source. " +
      "Metric families: orders (revenue, orders, aov, customers, " +
      "conversion_rate, ltv; support dimension breakdowns), subscriptions " +
      "(active_subscriptions, new_subscriptions, churned_subscriptions, mrr; " +
      "interval only), billing (refunds, refund_count, failed_payments; " +
      "interval only). " +
      "\n\n" +
      "compare: pass 'previous_period' for automatic period-over-period " +
      "comparison, or a {start, end} object for an explicit window. Dates " +
      "must be UTC ISO 8601 (e.g. '2026-04-13T00:00:00Z'). Call " +
      "analytics_capabilities for the full compatibility matrix.",
    {
      object: z
        .enum(["account", "checkout", "product"])
        .describe("Scope of the query. 'account' for whole-account numbers."),
      objId: z
        .string()
        .optional()
        .describe("Checkout or product ID when object is not 'account'"),
      metrics: z
        .array(z.string())
        .min(1)
        .describe("Metric names, e.g. ['revenue', 'orders']"),
      groupBy: z
        .string()
        .describe("'interval' for a time series, or a dimension name"),
      period: z
        .object({
          start: z.string().describe("UTC ISO 8601 start"),
          end: z.string().describe("UTC ISO 8601 end"),
        })
        .describe("Query window (UTC ISO 8601)"),
      compare: z
        .union([
          z.literal("previous_period"),
          z.object({ start: z.string(), end: z.string() }),
        ])
        .optional()
        .describe("'previous_period' or an explicit {start, end} window"),
      grouping: z
        .enum(["day", "week", "month"])
        .optional()
        .describe("Bucket size when groupBy is 'interval'"),
      touch: z
        .enum(["first", "last"])
        .optional()
        .describe("Attribution touch model for dimension breakdowns"),
    },
    async (args) =>
      jsonResult(await queryAnalytics(client, args as AnalyticsQueryArgs)),
  );
}
