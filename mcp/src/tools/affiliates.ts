import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

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
    "List all affiliates. Search covers name_first, name_last, email, slug, paypal_email.",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional().describe("Items per page (max 100)"),
      search: z.string().optional(),
      sort: z
        .string()
        .optional()
        .describe("Sort field; prefix with - for descending"),
      "filter.email": z.string().optional().describe("Exact email match"),
      "filter.email.contains": z
        .string()
        .optional()
        .describe("Email contains (case-insensitive)"),
      "filter.name_last": z.string().optional(),
      "filter.name_last.contains": z.string().optional(),
      "filter.slug": z.string().optional(),
      "filter.slug.contains": z.string().optional(),
      "filter.is_ready_for_payout": z
        .string()
        .optional()
        .describe("'true' or 'false'"),
    },
    async (args) =>
      jsonResult(
        await client.get("/v2/affiliates/", normalizeFilterArgs(args)),
      ),
  );

  server.tool(
    "affiliate_program_get",
    "Get a single affiliate program by ID (contains checkouts, prices, options, links).",
    { program_id: z.number().int() },
    async (args) =>
      jsonResult(await client.get(`/v2/affiliates/programs/${args.program_id}`)),
  );
}
