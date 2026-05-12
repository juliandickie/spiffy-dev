// Tests that lock in the response-wrapper behaviour discovered during the
// 2026-05-13 live-API smoke. See docs/spiffy-api-gotchas-and-patterns.md
// Part 7.2 (data wrapper) and Part 7.4 (subscription field reality).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpiffyClient } from "../../src/client.js";
import { registerSubscriptionTools } from "../../src/tools/subscriptions.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function captureSubscriptionBillingScheduleTool(
  client: SpiffyClient,
): (args: { id: number }) => Promise<{ content: Array<{ type: string; text: string }> }> {
  let captured: ((args: { id: number }) => Promise<{ content: Array<{ type: string; text: string }> }>) | undefined;
  const server = {
    tool(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (args: { id: number }) => Promise<{ content: Array<{ type: string; text: string }> }>,
    ) {
      if (name === "subscription_billing_schedule") captured = handler;
    },
  } as unknown as McpServer;
  registerSubscriptionTools(server, client);
  if (!captured) throw new Error("subscription_billing_schedule not registered");
  return captured;
}

describe("subscription_billing_schedule", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps the {data: {...}} response shape from /v2/subscriptions/{id}", async () => {
    // Real Spiffy v2 single-resource GETs wrap in {data: ...}. Pre-fix the
    // tool projected fields off the wrapper and returned all-undefined.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 354954,
            status: "active",
            next_payment_at: "2027-08-01T14:00:00.000Z",
            canceled_at: null,
            unpaid_at: null,
            trial_days: 0,
            current_payment_status: "paid",
            product_option_price_id: 88,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const handler = captureSubscriptionBillingScheduleTool(client);
    const result = await handler({ id: 354954 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
      id: 354954,
      status: "active",
      next_payment_at: "2027-08-01T14:00:00.000Z",
      canceled_at: null,
      unpaid_at: null,
      trial_days: 0,
      current_payment_status: "paid",
      product_option_price_id: 88,
    });
  });

  it("falls back to top-level fields when {data: {...}} is absent", async () => {
    // Backward compat. If Spiffy ever stops wrapping, the tool still works.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          status: "canceled",
          next_payment_at: null,
          canceled_at: "2026-01-15T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const handler = captureSubscriptionBillingScheduleTool(client);
    const result = await handler({ id: 1 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.id).toBe(1);
    expect(payload.status).toBe("canceled");
    expect(payload.canceled_at).toBe("2026-01-15T00:00:00.000Z");
  });

  it("uses the field name `next_payment_at`, not `next_billing_date`", async () => {
    // Documents the field-name finding from Part 7.4. The OpenAPI spec and the
    // pre-fix code used `next_billing_date` which does not exist in the real API.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 1,
            next_payment_at: "2026-06-01T00:00:00.000Z",
            next_billing_date: "WRONG_FIELD_NAME_FROM_OPENAPI",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const handler = captureSubscriptionBillingScheduleTool(client);
    const result = await handler({ id: 1 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.next_payment_at).toBe("2026-06-01T00:00:00.000Z");
    expect(payload).not.toHaveProperty("next_billing_date");
  });
});
