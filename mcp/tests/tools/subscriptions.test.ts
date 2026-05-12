// Tests for the subscription billing-schedule projection. Cover the wrapper
// behaviour discovered in the 2026-05-13 live-API smoke (gotchas Part 7.2
// and 7.4).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { getSubscriptionBillingSchedule } from "../../src/tools/subscriptions.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getSubscriptionBillingSchedule", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps the {data: {...}} envelope from /v2/subscriptions/{id}", async () => {
    // Real Spiffy v2 single-resource GETs wrap in {data: ...}. Pre-fix the
    // projection read fields off the wrapper and returned all-undefined.
    const mockFetch = vi.fn().mockResolvedValue(
      mockJson({
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
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await getSubscriptionBillingSchedule(client, 354954);
    expect(result).toEqual({
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
    // Backward compat. If Spiffy ever stops wrapping, the projection still works.
    const mockFetch = vi.fn().mockResolvedValue(
      mockJson({
        id: 1,
        status: "canceled",
        next_payment_at: null,
        canceled_at: "2026-01-15T00:00:00.000Z",
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await getSubscriptionBillingSchedule(client, 1);
    expect(result.id).toBe(1);
    expect(result.status).toBe("canceled");
    expect(result.canceled_at).toBe("2026-01-15T00:00:00.000Z");
  });

  it("uses the field name `next_payment_at`, not `next_billing_date`", async () => {
    // The OpenAPI spec and the pre-fix code used `next_billing_date` which
    // does not exist in the real API. See gotchas Part 7.4.
    const mockFetch = vi.fn().mockResolvedValue(
      mockJson({
        data: {
          id: 1,
          next_payment_at: "2026-06-01T00:00:00.000Z",
          next_billing_date: "WRONG_FIELD_NAME_FROM_OPENAPI",
        },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await getSubscriptionBillingSchedule(client, 1);
    expect(result.next_payment_at).toBe("2026-06-01T00:00:00.000Z");
    expect(result).not.toHaveProperty("next_billing_date");
  });

  it("hits /v2/subscriptions/{id} (the only single-resource endpoint that works)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockJson({ data: { id: 42 } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getSubscriptionBillingSchedule(client, 42);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/subscriptions/42");
  });
});
