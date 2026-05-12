import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";

const PRODUCT_GET_DESCRIPTION =
  "Get a single product (course, bundle) by ID. " +
  "Detail response includes nested `options[].prices[].amount` (price values are in CENTS, " +
  "not dollars) and a `checkouts[]` array of attached checkouts. " +
  "\n\n" +
  "IMPORTANT: `is_active: true` on a product is CATALOGUE state and does NOT mean " +
  "'currently sold'. Legacy products keep is_active true for grandfathered subscription " +
  "delivery even while all their checkouts are disabled. To confirm purchasability, " +
  "check the associated checkouts via `checkout_list`.";

const PRODUCTS_LIST_DESCRIPTION =
  "List all products in the Spiffy account. " +
  "\n\n" +
  "Response shape. `{ data: [...], meta: { pagination: { page, page_size, " +
  "total_count, total_pages, has_more } } }`. Pagination metadata lives under " +
  "`meta.pagination`, NOT at the top level. The list response does NOT include " +
  "nested options/prices/checkouts; fetch those via `product_get` per product. " +
  "\n\n" +
  "AVOID `/v2/products/counts` for inventory totals. It has been observed to " +
  "return misleading numbers (2 vs an actual 26). Use " +
  "`meta.pagination.total_count` from this endpoint instead.";

export function registerProductTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "product_get",
    PRODUCT_GET_DESCRIPTION,
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/products/${args.id}`)),
  );

  server.tool(
    "products_list",
    PRODUCTS_LIST_DESCRIPTION,
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional().describe("Items per page (max 100)"),
      search: z.string().optional(),
      sort: z
        .string()
        .optional()
        .describe("Sort field; prefix with - for descending (e.g. '-created_at')"),
    },
    async (args) =>
      jsonResult(await client.get("/v2/products/", normalizeFilterArgs(args))),
  );
}
