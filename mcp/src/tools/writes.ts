import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";

const WRITE_WARNING =
  "⚠️ DESTRUCTIVE: This tool writes to Spiffy. Do not call it directly. " +
  "Use the corresponding /spiffy-* slash command, which presents a confirmation summary " +
  "to the user before invoking this tool. Direct invocation without human confirmation " +
  "is a safety violation.";

function requireConfirmation(confirmed: boolean, summary: string): void {
  if (confirmed !== true) {
    throw new Error(
      "confirmed_by_user must be true. This tool can only be called from the /spiffy-* " +
        "slash command after showing the user a confirmation summary and receiving explicit approval.",
    );
  }
  if (!summary || summary.trim().length === 0) {
    throw new Error(
      "confirmation_summary must be a non-empty human-readable description of what the user approved.",
    );
  }
}

export interface AddCustomerNoteArgs {
  customer_id: number;
  notes: string;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function addCustomerNote(
  client: SpiffyClient,
  args: AddCustomerNoteArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const response = await client.post<{
    id?: number;
    data?: { id?: number };
  }>(`/v2/customers/${args.customer_id}/notes`, { notes: args.notes });
  // v2 single-resource responses wrap the resource in {data: {...}}.
  // Fall back to top-level for backward compatibility with older API behaviour.
  const responseId = response.data?.id ?? response.id;
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "note.add",
    summary: args.confirmation_summary,
    responseId: String(responseId ?? "unknown"),
  });
  return response;
}

export interface CreatePromoArgs {
  code: string;
  onetime_discount_type?: "percent" | "amount";
  onetime_discount_offset?: number;
  subscription_discount_type?: "percent" | "amount";
  subscription_discount_offset?: number;
  subscription_duration_in_months?: number;
  expire_at?: string;
  order_limit?: number;
  per_customer_limit?: number;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function createPromo(
  client: SpiffyClient,
  args: CreatePromoArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const { confirmed_by_user: _c, confirmation_summary: _s, ...body } = args;
  const response = await client.post<{
    id?: number;
    code?: string;
    data?: { id?: number; code?: string };
  }>("/v2/promos/", body);
  const responseId = response.data?.id ?? response.id;
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "promo.create",
    summary: args.confirmation_summary,
    responseId: String(responseId ?? "unknown"),
  });
  return response;
}

export function registerWriteTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "customer_add_note",
    WRITE_WARNING + " — Adds a note to a customer record.",
    {
      customer_id: z.number().int().describe("Customer ID"),
      notes: z.string().min(1).describe("Note text (min 1 char)"),
      confirmed_by_user: z
        .literal(true)
        .describe(
          "MUST be literally true. The slash command sets this AFTER user explicitly confirms.",
        ),
      confirmation_summary: z
        .string()
        .min(1)
        .describe(
          "Non-empty human-readable summary the user saw and approved (e.g. 'Add note to Jane Smith: \"Called about refund\"').",
        ),
    },
    async (args) =>
      jsonResult(await addCustomerNote(client, args as AddCustomerNoteArgs)),
  );

  server.tool(
    "promo_create",
    WRITE_WARNING +
      " — Creates a promo code. Only the bare promo is created; linking to checkouts " +
      "and scoping to products must be done in the Spiffy dashboard after creation " +
      "(see /spiffy-promo command for the full workflow).",
    {
      code: z
        .string()
        .min(1)
        .describe("Promo code (will be uppercased by Spiffy)"),
      onetime_discount_type: z.enum(["percent", "amount"]).optional(),
      onetime_discount_offset: z.number().optional(),
      subscription_discount_type: z.enum(["percent", "amount"]).optional(),
      subscription_discount_offset: z.number().optional(),
      subscription_duration_in_months: z
        .number()
        .optional()
        .describe("0 = forever"),
      expire_at: z.string().optional().describe("ISO-8601 expiry"),
      order_limit: z
        .number()
        .optional()
        .describe("Max total orders (0 = unlimited). For single-use, set to 1."),
      per_customer_limit: z.number().optional(),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await createPromo(client, args as CreatePromoArgs)),
  );
}
