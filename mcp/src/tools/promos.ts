import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";
import { requireConfirmation, WRITE_WARNING } from "./writes.js";

// Issued codes belong to unique-mode promotions (Spiffy r87, Rev 10.26).
// Issue, revoke and reissue change what a customer can redeem, so they carry
// the same confirmation gate and audit trail as the other writes. Spiffy
// does not email an issued code; it fires the promo:code_issued webhook.

interface Gated {
  confirmed_by_user: true;
  confirmation_summary: string;
}

export interface IssuePromoCodeArgs extends Gated {
  promo_id: number;
  customer_id?: number;
  email?: string;
}

export interface PromoCodeActionArgs extends Gated {
  promo_id: number;
  code_id: number;
}

export interface CheckPromoCodeArgs {
  code: string;
  customer_id?: number;
  email?: string;
  checkout_id?: number;
  product_id?: number;
  product_option_id?: number;
  product_option_price_id?: number;
}

async function auditedPost(
  client: SpiffyClient,
  path: string,
  body: unknown,
  operation: string,
  summary: string,
): Promise<unknown> {
  const response = await client.post<{ data?: { id?: number } }>(path, body);
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation,
    summary,
    responseId: String(response?.data?.id ?? "unknown"),
  });
  return response;
}

export async function issuePromoCode(
  client: SpiffyClient,
  args: IssuePromoCodeArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  if ((args.customer_id === undefined) === (args.email === undefined)) {
    throw new Error("Send exactly one of customer_id or email.");
  }
  const body =
    args.customer_id !== undefined
      ? { customer_id: args.customer_id }
      : { email: args.email };
  return auditedPost(
    client,
    `/v2/promos/${args.promo_id}/codes`,
    body,
    "promo_code.issue",
    args.confirmation_summary,
  );
}

export async function revokePromoCode(
  client: SpiffyClient,
  args: PromoCodeActionArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  return auditedPost(
    client,
    `/v2/promos/${args.promo_id}/codes/${args.code_id}/revoke`,
    {},
    "promo_code.revoke",
    args.confirmation_summary,
  );
}

export async function reissuePromoCode(
  client: SpiffyClient,
  args: PromoCodeActionArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  return auditedPost(
    client,
    `/v2/promos/${args.promo_id}/codes/${args.code_id}/reissue`,
    {},
    "promo_code.reissue",
    args.confirmation_summary,
  );
}

export async function checkPromoCode(
  client: SpiffyClient,
  args: CheckPromoCodeArgs,
): Promise<unknown> {
  const { code, customer_id, email, ...ctx } = args;
  const contextKeys = Object.keys(ctx).filter(
    (k) => ctx[k as keyof typeof ctx] !== undefined,
  );
  if (contextKeys.length > 1) {
    throw new Error(
      "Send at most one context: checkout_id, product_id, product_option_id or product_option_price_id.",
    );
  }
  const body: Record<string, unknown> = { code };
  if (customer_id !== undefined) body.customer_id = customer_id;
  if (email !== undefined) body.email = email;
  if (contextKeys.length === 1) {
    const k = contextKeys[0] as keyof typeof ctx;
    body.context = { [k]: ctx[k] };
  }
  // A pure read that travels as a POST, so it stays live under dry-run.
  return client.postRead("/v2/promos/check", body);
}

const gate = {
  confirmed_by_user: z.literal(true),
  confirmation_summary: z.string().min(1),
};

const codeStatus = z
  .enum(["active", "redeemed", "revoked", "expired"])
  .optional()
  .describe("Code status. 'expired' means past effective_expires_at.");

export function registerPromoTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "promo_list",
    "List all promos. Each promo carries code (null for unique mode), name, mode " +
      "(shared or unique), application (checkouts or products), scope_targets, starts_at, " +
      "expire_at, status (scheduled, active, expired or inactive), summary, " +
      "issued_count, redeemed_count, customer_count and attachments. Amount discounts " +
      "are in the smallest currency unit (cents).",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      search: z.string().optional(),
    },
    async (args) =>
      jsonResult(await client.get("/v2/promos/", normalizeFilterArgs(args))),
  );

  server.tool(
    "promo_get",
    "Get a single promo by ID, including a deleted one (status 'inactive'). Returns " +
      "mode, application, scope_targets, starts_at, status, summary, attachments (the " +
      "checkout items it is attached to), issued and redeemed counts. Amount discounts " +
      "are in cents.",
    { id: z.number().int() },
    async (args) => jsonResult(await client.get(`/v2/promos/${args.id}`)),
  );

  server.tool(
    "promo_code_list",
    "List the codes issued for a unique-mode promotion (GET /v2/promos/{id}/codes). " +
      "Each code carries customer_id, status, effective_expires_at, redeemed_order_id " +
      "and a promo summary.",
    {
      promo_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional().describe("Max 100"),
      search: z.string().optional().describe("Search across code"),
      include: z.string().optional().describe("Comma-separated expansions: customer, promo"),
      "filter.status": codeStatus,
      "filter.customer_id": z.number().int().optional(),
      "filter.code": z.string().optional().describe("Exact code"),
      "filter.source": z
        .enum(["dashboard", "api", "action", "system"])
        .optional(),
    },
    async ({ promo_id, ...rest }) =>
      jsonResult(
        await client.get(`/v2/promos/${promo_id}/codes`, normalizeFilterArgs(rest)),
      ),
  );

  server.tool(
    "promo_code_get",
    "Get one issued code by its code id (GET /v2/promos/{id}/codes/{code_id}).",
    { promo_id: z.number().int(), code_id: z.number().int() },
    async (args) =>
      jsonResult(
        await client.get(`/v2/promos/${args.promo_id}/codes/${args.code_id}`),
      ),
  );

  server.tool(
    "customer_promo_codes",
    "List the promo codes issued to one customer (GET /v2/customers/{id}/promo-codes).",
    {
      customer_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional().describe("Max 100"),
      "filter.status": codeStatus,
    },
    async ({ customer_id, ...rest }) =>
      jsonResult(
        await client.get(
          `/v2/customers/${customer_id}/promo-codes`,
          normalizeFilterArgs(rest),
        ),
      ),
  );

  server.tool(
    "promo_check",
    "Check why a promo code does or does not work (POST /v2/promos/check). Runs every " +
      "eligibility check, not stopping at the first failure, and returns the resolved " +
      "promo and code plus checks[] of {check, pass, detail}. Pass customer_id or email " +
      "to test the recipient lock and per-customer limit. Pass ONE context " +
      "(checkout_id, product_id, product_option_id or product_option_price_id) to test " +
      "whether it applies there. Read-only; runs even under dry-run. Run it before " +
      "giving a customer a code.",
    {
      code: z.string().min(1),
      customer_id: z.number().int().optional(),
      email: z.string().optional(),
      checkout_id: z.number().int().optional(),
      product_id: z.number().int().optional(),
      product_option_id: z.number().int().optional(),
      product_option_price_id: z.number().int().optional(),
    },
    async (args) => jsonResult(await checkPromoCode(client, args)),
  );

  server.tool(
    "promo_code_issue",
    WRITE_WARNING +
      " Issues a unique code for a unique-mode promotion to one customer " +
      "(POST /v2/promos/{id}/codes). Send exactly one of customer_id or email; an email " +
      "with no customer creates a minimal customer record. Idempotent: if the customer " +
      "already holds an active code it is returned with created: false. Refused for " +
      "shared, inactive, ended or not-yet-started promos. Spiffy does not email the code.",
    {
      promo_id: z.number().int(),
      customer_id: z.number().int().optional(),
      email: z.string().optional(),
      ...gate,
    },
    async (args) => jsonResult(await issuePromoCode(client, args as IssuePromoCodeArgs)),
  );

  server.tool(
    "promo_code_revoke",
    WRITE_WARNING +
      " Revokes an issued code. Idempotent for a code already revoked or expired. A " +
      "redeemed code cannot be revoked (409 PROMO_CODE_NOT_ACTIVE).",
    { promo_id: z.number().int(), code_id: z.number().int(), ...gate },
    async (args) =>
      jsonResult(await revokePromoCode(client, args as PromoCodeActionArgs)),
  );

  server.tool(
    "promo_code_reissue",
    WRITE_WARNING +
      " Revokes an issued code and issues a replacement to the same customer. Returns " +
      "{data, replaced, created}; if the customer already holds another active code, " +
      "that code is returned with created: false. A redeemed code cannot be reissued (409).",
    { promo_id: z.number().int(), code_id: z.number().int(), ...gate },
    async (args) =>
      jsonResult(await reissuePromoCode(client, args as PromoCodeActionArgs)),
  );
}
