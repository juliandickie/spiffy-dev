import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";

export const WRITE_WARNING =
  "⚠️ DESTRUCTIVE: This tool writes to Spiffy. Do not call it directly. " +
  "Use the corresponding /spiffy-* slash command, which presents a confirmation summary " +
  "to the user before invoking this tool. Direct invocation without human confirmation " +
  "is a safety violation.";

export function requireConfirmation(confirmed: boolean, summary: string): void {
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

export interface ScopeTarget {
  type: "product" | "product_option" | "product_option_price";
  id: number;
}

// Promo fields shared by create and update (POST and PUT /v2/promos).
// Amount offsets are in the smallest currency unit ($5.00 = 500).
export interface PromoFields {
  code?: string;
  name?: string;
  application?: "checkouts" | "products";
  scope_targets?: ScopeTarget[];
  onetime_discount_type?: "percent" | "amount";
  onetime_discount_offset?: number;
  subscription_discount_type?: "percent" | "amount";
  subscription_discount_offset?: number;
  subscription_duration_in_months?: number;
  starts_at?: string;
  expire_at?: string;
  order_limit?: number;
  per_customer_limit?: number;
  code_prefix?: string;
  issue_expiry_days?: number;
  is_locked_to_recipient?: boolean;
}

export interface CreatePromoArgs extends PromoFields {
  mode?: "shared" | "unique";
  confirmed_by_user: true;
  confirmation_summary: string;
}

// Update is partial since Rev 10.26: an omitted field keeps its value and
// null clears it. `mode` is immutable, so it is not offered.
export type UpdatePromoArgs = {
  [K in keyof PromoFields]?: PromoFields[K] | null;
} & {
  id: number;
  detach?: boolean;
  confirmed_by_user: true;
  confirmation_summary: string;
};

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

export async function updatePromo(
  client: SpiffyClient,
  args: UpdatePromoArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const { confirmed_by_user: _c, confirmation_summary: _s, id, ...body } = args;
  const response = await client.put(`/v2/promos/${id}`, body);
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "promo.update",
    summary: args.confirmation_summary,
    responseId: String(id),
  });
  return response;
}

const scopeTargetSchema = z.object({
  type: z.enum(["product", "product_option", "product_option_price"]),
  id: z.number().int().positive(),
});

// zod shapes for the promo fields; `nullable` adds .nullable() for update.
function promoFieldShape(nullable: boolean) {
  const n = <T extends z.ZodTypeAny>(t: T) =>
    (nullable ? t.nullable() : t).optional();
  return {
    code: n(z.string().min(1)).describe(
      "Shared-mode code. Letters and numbers only (no spaces, hyphens or punctuation); " +
        "Spiffy trims and uppercases it. Not allowed in unique mode.",
    ),
    name: n(z.string().min(1)).describe(
      "Merchant-facing name. Required for unique mode; defaults to the code for shared mode.",
    ),
    application: n(z.enum(["checkouts", "products"])).describe(
      "checkouts (default): discounts the checkout items it is attached to in the dashboard. " +
        "products: discounts any checkout line whose product, option or price is in " +
        "scope_targets, on every checkout, with no attach step. A products promo cannot " +
        "auto-apply, so the buyer needs the ?c=CODE link or must type the code.",
    ),
    scope_targets: n(z.array(scopeTargetSchema)).describe(
      "products application only. [{type: product|product_option|product_option_price, id}]. " +
        "[] means every product. Spiffy answers PROMO_FOREIGN_TARGET when an id is not a " +
        "product, option or price on this account.",
    ),
    onetime_discount_type: n(z.enum(["percent", "amount"])),
    onetime_discount_offset: n(z.number().nonnegative()).describe(
      "percent: 0 to 100. amount: smallest currency unit, so $50.00 = 5000.",
    ),
    subscription_discount_type: n(z.enum(["percent", "amount"])),
    subscription_discount_offset: n(z.number().nonnegative()).describe(
      "percent: 0 to 100. amount: smallest currency unit, so $50.00 = 5000.",
    ),
    subscription_duration_in_months: n(z.number().int().nonnegative()).describe("0 = forever"),
    starts_at: n(z.string()).describe(
      "ISO-8601. The promo is not servable before this instant (status 'scheduled'). Omit for immediately.",
    ),
    expire_at: n(z.string()).describe("ISO-8601 expiry"),
    order_limit: n(z.number().int().nonnegative()).describe(
      "Max total orders (0 = unlimited). For single-use, set to 1.",
    ),
    per_customer_limit: n(z.number().int().nonnegative()).describe(
      "Shared mode: max uses per customer (0 = unlimited). Ignored in unique mode.",
    ),
    code_prefix: n(z.string()).describe(
      "Unique mode: 1 to 12 letters or digits prefixed to issued codes (WB gives WB-X8K92F).",
    ),
    issue_expiry_days: n(z.number().int().nonnegative()).describe(
      "Unique mode: issued codes expire this many days after issue (omit = only expire_at applies).",
    ),
    is_locked_to_recipient: n(z.boolean()).describe(
      "Unique mode (default true): an issued code only works for the email it was issued to.",
    ),
  };
}

export function registerWriteTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "customer_add_note",
    WRITE_WARNING + " Adds a note to a customer record.",
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
      " Creates a promotion (POST /v2/promos). mode 'shared' (default) is one code " +
      "everyone types; 'unique' has no code of its own and issues one per customer via " +
      "promo_code_issue. application 'products' with scope_targets works on every " +
      "checkout selling those products with NO dashboard step. application 'checkouts' " +
      "(the default) still has to be attached to checkout items in the Spiffy dashboard " +
      "(see /spiffy-promo for both workflows).",
    {
      mode: z
        .enum(["shared", "unique"])
        .optional()
        .describe("shared (default) or unique. Cannot be changed after creation."),
      ...promoFieldShape(false),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await createPromo(client, args as CreatePromoArgs)),
  );

  server.tool(
    "promo_update",
    WRITE_WARNING +
      " Updates a promotion (PUT /v2/promos/{id}). PARTIAL update: send only the " +
      "fields to change; an omitted field keeps its value. null clears expire_at and " +
      "the discount types; on the numeric fields null means 0 (unlimited or forever). " +
      "mode cannot be changed. Switching application to 'products' on an attached promo " +
      "answers 409 PROMO_HAS_ATTACHMENTS listing the checkouts; resend with detach: true " +
      "to remove every attachment.",
    {
      id: z.number().int().describe("Promo ID"),
      ...promoFieldShape(true),
      detach: z
        .boolean()
        .optional()
        .describe(
          "true detaches the promo from every checkout item so application can become 'products'.",
        ),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await updatePromo(client, args as UpdatePromoArgs)),
  );
}
