import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

const CHECKOUT_STATUS_WARNING =
  "IMPORTANT - status field semantics. " +
  "`status: \"active\"` means the checkout record exists in admin and is not soft-deleted. " +
  "It does NOT necessarily mean the checkout is publicly purchasable, in a current funnel, " +
  "or being actively promoted. A team may have stopped linking to it from sales pages " +
  "while leaving the API status as active. To determine 'currently publicly sold', " +
  "cross-reference active checkouts against the merchant's main-website sales pages.";

const CHECKOUT_PRODUCT_INDEPENDENCE_NOTE =
  "Checkouts can exist WITHOUT a product wrapper (v1 legacy pattern). " +
  "Conversely, products can exist without active checkouts (grandfathered subscription delivery). " +
  "Always treat the checkout id as the canonical identifier for a commerce surface, " +
  "not the product id.";

const CHECKOUT_LIST_DESCRIPTION =
  "List checkouts (the buyer-facing commerce surfaces). Hits the v1 endpoint " +
  "because Spiffy has no /v2/checkouts at time of writing. " +
  "\n\n" +
  "Response shape (v1 pagination, differs from v2 list endpoints): " +
  "`{ count: <total>, page: <current>, checkouts: [{ id, status, name, url_slug }] }`. " +
  "Iterate by incrementing `page` until you have accumulated `count` items. " +
  "There is no per_page parameter (page size is fixed at ~50). " +
  "\n\n" +
  "Each checkout returns only 4 fields. There is no GET /v1/checkouts/{id} " +
  "endpoint (404 if you try). To get richer detail (pricing, options), find the " +
  "checkout's parent product via `products_list` / `product_get` and read the " +
  "nested `checkouts[]` array. " +
  "\n\n" +
  CHECKOUT_STATUS_WARNING +
  "\n\n" +
  CHECKOUT_PRODUCT_INDEPENDENCE_NOTE;

const CHECKOUT_FILTER_DESCRIPTION =
  "Optional status filter. Applied client-side because Spiffy v1 does not support " +
  "?status= as a server-side query parameter. Values: 'active', 'expired', 'deleted'. " +
  "REMINDER: 'active' here means 'exists in admin', NOT 'publicly purchasable' " +
  "(see status semantics warning).";

interface V1CheckoutListResponse {
  count: number;
  page: number;
  checkouts: Array<{
    id: number;
    status: "active" | "expired" | "deleted";
    name: string;
    url_slug: string;
  }>;
}

export async function listCheckouts(
  client: SpiffyClient,
  args: { page?: number; status?: "active" | "expired" | "deleted" },
): Promise<V1CheckoutListResponse> {
  const params: Record<string, string | number | boolean> = {};
  if (args.page !== undefined) params.page = args.page;
  const response = await client.get<V1CheckoutListResponse>(
    "/v1/checkouts",
    params,
  );
  if (!args.status) return response;
  return {
    ...response,
    checkouts: response.checkouts.filter((c) => c.status === args.status),
  };
}

export function registerCheckoutTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "checkout_list",
    CHECKOUT_LIST_DESCRIPTION,
    {
      page: z
        .number()
        .int()
        .optional()
        .describe("Page number (1-based, default 1). v1 page size is fixed."),
      status: z
        .enum(["active", "expired", "deleted"])
        .optional()
        .describe(CHECKOUT_FILTER_DESCRIPTION),
    },
    async (args) => jsonResult(await listCheckouts(client, args)),
  );
}
