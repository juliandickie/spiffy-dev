import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";
import { requireConfirmation } from "./writes.js";

// Magic-link tools issue real login credentials for customers and
// affiliates. They do not modify account data, but a token in the wrong
// hands is an account takeover, so they carry the same confirmed_by_user
// gate and audit trail as destructive writes. The API returns the token
// only; it does NOT email anyone.

const LOGIN_WARNING =
  "⚠️ SENSITIVE: This tool issues a real login credential (magic link " +
  "token). Do not call it directly. Use the /spiffy-login-link slash " +
  "command, which presents a confirmation summary to the user before " +
  "invoking this tool. Direct invocation without human confirmation is a " +
  "safety violation. The token is generated only; Spiffy does not email it.";

export interface CustomerMagicLinkArgs {
  customer_id: number;
  url?: string;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export interface CustomerMagicLinkByEmailArgs {
  email: string;
  url?: string;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export interface AffiliateMagicLinkArgs {
  affiliate_id: number;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function createCustomerMagicLink(
  client: SpiffyClient,
  args: CustomerMagicLinkArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const body: Record<string, unknown> = {};
  if (args.url !== undefined) body.url = args.url;
  const response = await client.post<{ magic_link_token?: string }>(
    `/v1/customers/${args.customer_id}/login`,
    body,
  );
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "login.customer_magic_link",
    summary: args.confirmation_summary,
    responseId: `customer_${args.customer_id}`,
  });
  return response;
}

export async function createCustomerMagicLinkByEmail(
  client: SpiffyClient,
  args: CustomerMagicLinkByEmailArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const body: Record<string, unknown> = { email: args.email };
  if (args.url !== undefined) body.url = args.url;
  const response = await client.post<{ magic_link_token?: string }>(
    "/v1/customers/login",
    body,
  );
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "login.customer_magic_link_by_email",
    summary: args.confirmation_summary,
    responseId: args.email,
  });
  return response;
}

export async function createAffiliateMagicLink(
  client: SpiffyClient,
  args: AffiliateMagicLinkArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const response = await client.post<{ magic_link_token?: string }>(
    `/v1/affiliates/${args.affiliate_id}/login`,
    {},
  );
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "login.affiliate_magic_link",
    summary: args.confirmation_summary,
    responseId: `affiliate_${args.affiliate_id}`,
  });
  return response;
}

export function registerLoginTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "customer_magic_link",
    LOGIN_WARNING +
      " Generates a magic link login token for a customer by ID. Returns " +
      "{magic_link_token}; no email is sent.",
    {
      customer_id: z.number().int().describe("Customer ID"),
      url: z
        .string()
        .optional()
        .describe("Optional destination URL the login should land on"),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(
        await createCustomerMagicLink(client, args as CustomerMagicLinkArgs),
      ),
  );

  server.tool(
    "customer_magic_link_by_email",
    LOGIN_WARNING +
      " Generates a magic link login token for a customer identified by " +
      "email address. Returns {magic_link_token}; no email is sent.",
    {
      email: z.string().describe("Customer email address"),
      url: z
        .string()
        .optional()
        .describe("Optional destination URL the login should land on"),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(
        await createCustomerMagicLinkByEmail(
          client,
          args as CustomerMagicLinkByEmailArgs,
        ),
      ),
  );

  server.tool(
    "affiliate_magic_link",
    LOGIN_WARNING +
      " Generates a magic link login token for an affiliate by ID. Returns " +
      "{magic_link_token}; no email is sent.",
    {
      affiliate_id: z.number().int().describe("Affiliate ID"),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(
        await createAffiliateMagicLink(client, args as AffiliateMagicLinkArgs),
      ),
  );
}
