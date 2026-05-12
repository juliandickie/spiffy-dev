import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";

export async function searchCustomers(
  client: SpiffyClient,
  args: { query: string; limit?: number },
): Promise<unknown> {
  return client.get("/v2/customers/", {
    search: args.query,
    per_page: args.limit ?? 25,
  });
}

export async function getFullCustomerProfile(
  client: SpiffyClient,
  args: { id: number },
): Promise<unknown> {
  return client.get(`/v2/customers/${args.id}`, {
    include: "cards,stats,fields",
  });
}

export async function listCustomerOrders(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number },
): Promise<unknown> {
  return client.get("/v2/orders/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export async function listCustomerSubscriptions(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number },
): Promise<unknown> {
  return client.get("/v2/subscriptions/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export async function listCustomerPayments(
  client: SpiffyClient,
  args: { customer_id: number; page?: number; per_page?: number },
): Promise<unknown> {
  return client.get("/v2/payments/", {
    "filter[customer_id]": args.customer_id,
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export function registerCustomerTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "customer_search",
    "Search customers by email, name, or partial match. Returns up to 25 matches.",
    {
      query: z
        .string()
        .describe("Search term, email, name, or ID fragment"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results, default 25"),
    },
    async (args) => jsonResult(await searchCustomers(client, args)),
  );

  server.tool(
    "customer_get_full_profile",
    "Get a customer with cards, stats, and custom fields included. Use for 'tell me about X' inquiries.",
    {
      id: z.number().int().describe("Customer ID (integer)"),
    },
    async (args) => jsonResult(await getFullCustomerProfile(client, args)),
  );

  server.tool(
    "customer_list_orders",
    "List orders placed by a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerOrders(client, args)),
  );

  server.tool(
    "customer_list_subscriptions",
    "List subscriptions belonging to a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerSubscriptions(client, args)),
  );

  server.tool(
    "customer_list_payments",
    "List payments belonging to a given customer (paginated).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listCustomerPayments(client, args)),
  );
}
