import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAppendFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    appendFileSync: mockAppendFileSync,
    mkdirSync: mockMkdirSync,
  };
});

import { SpiffyClient } from "../../src/client.js";
import {
  issuePromoCode,
  revokePromoCode,
  reissuePromoCode,
  checkPromoCode,
} from "../../src/tools/promos.js";
import { updatePromo, createPromo } from "../../src/tools/writes.js";

const baseConfig = { apiKey: "k", baseUrl: "https://api.spiffy.co", dryRun: false };

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockAppendFileSync.mockReset();
  mockMkdirSync.mockReset();
});

describe("createPromo, r87 fields", () => {
  it("sends mode, application, scope_targets and starts_at through to Spiffy", async () => {
    const mockFetch = vi.fn().mockResolvedValue(ok({ data: { id: 7 } }, 201));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createPromo(client, {
      code: "JANENOV26A7KQ",
      mode: "shared",
      application: "products",
      scope_targets: [{ type: "product", id: 55 }],
      onetime_discount_type: "amount",
      onetime_discount_offset: 5000,
      starts_at: "2026-12-01T00:00:00Z",
      confirmed_by_user: true,
      confirmation_summary: "Create JANENOV26A7KQ $50 off product 55",
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toEqual({
      code: "JANENOV26A7KQ",
      mode: "shared",
      application: "products",
      scope_targets: [{ type: "product", id: 55 }],
      onetime_discount_type: "amount",
      onetime_discount_offset: 5000,
      starts_at: "2026-12-01T00:00:00Z",
    });
    expect(String(mockAppendFileSync.mock.calls[0][1])).toContain("response_id=7");
  });
});

describe("updatePromo", () => {
  it("rejects without confirmation (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      updatePromo(client, {
        id: 1,
        expire_at: "2026-12-01",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("PUTs only the fields sent, keeps null, strips id and gate fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue(ok({ data: { id: 28518 } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await updatePromo(client, {
      id: 28518,
      expire_at: null,
      application: "products",
      detach: true,
      confirmed_by_user: true,
      confirmation_summary: "Clear expiry, switch to products, detach",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/promos/28518");
    expect(init.method).toBe("PUT");
    // Partial update: absent keys must not appear, null must survive.
    expect(JSON.parse(init.body as string)).toEqual({
      expire_at: null,
      application: "products",
      detach: true,
    });
    const audit = String(mockAppendFileSync.mock.calls[0][1]);
    expect(audit).toContain("promo.update");
    expect(audit).toContain("response_id=28518");
  });

  it("surfaces PROMO_HAS_ATTACHMENTS details in the error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      ok(
        {
          error: {
            code: "conflict",
            message: "Promotion is attached",
            details: { reason: "PROMO_HAS_ATTACHMENTS", attachments: [{ checkout_id: 9 }] },
          },
        },
        409,
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      updatePromo(client, {
        id: 1,
        application: "products",
        confirmed_by_user: true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/PROMO_HAS_ATTACHMENTS/);
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });
});

describe("issuePromoCode", () => {
  it("rejects without confirmation", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      issuePromoCode(client, {
        promo_id: 1,
        customer_id: 2,
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires exactly one of customer_id or email", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    const gate = { confirmed_by_user: true as const, confirmation_summary: "x" };
    await expect(issuePromoCode(client, { promo_id: 1, ...gate })).rejects.toThrow(
      /exactly one/,
    );
    await expect(
      issuePromoCode(client, { promo_id: 1, customer_id: 2, email: "a@b.co", ...gate }),
    ).rejects.toThrow(/exactly one/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs the customer to /v2/promos/{id}/codes and audits the code id", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(ok({ data: { id: 3, code: "WB-X8K92F" }, created: true }, 201));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await issuePromoCode(client, {
      promo_id: 28520,
      email: "a@b.co",
      confirmed_by_user: true,
      confirmation_summary: "Issue code to a@b.co",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/promos/28520/codes");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co" });
    const audit = String(mockAppendFileSync.mock.calls[0][1]);
    expect(audit).toContain("promo_code.issue");
    expect(audit).toContain("response_id=3");
  });
});

describe("revoke and reissue", () => {
  it("revoke rejects without confirmation", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      revokePromoCode(client, {
        promo_id: 1,
        code_id: 2,
        confirmed_by_user: true,
        confirmation_summary: " ",
      }),
    ).rejects.toThrow(/confirmation_summary/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("revoke and reissue POST to their paths and write audit lines", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => ok({ data: { id: 4 } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    const gate = { confirmed_by_user: true as const, confirmation_summary: "x" };
    await revokePromoCode(client, { promo_id: 1, code_id: 3, ...gate });
    await reissuePromoCode(client, { promo_id: 1, code_id: 3, ...gate });
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.spiffy.co/v2/promos/1/codes/3/revoke",
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.spiffy.co/v2/promos/1/codes/3/reissue",
    );
    expect(String(mockAppendFileSync.mock.calls[0][1])).toContain("promo_code.revoke");
    expect(String(mockAppendFileSync.mock.calls[1][1])).toContain("promo_code.reissue");
  });

  it("dry-run blocks revoke (no fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient({ ...baseConfig, dryRun: true }, mockFetch);
    const result = await revokePromoCode(client, {
      promo_id: 1,
      code_id: 3,
      confirmed_by_user: true,
      confirmation_summary: "x",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dry_run: true });
  });
});

describe("checkPromoCode", () => {
  it("wraps one context key and runs even under dry-run (pure read)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(ok({ data: { checks: [] } }));
    const client = new SpiffyClient({ ...baseConfig, dryRun: true }, mockFetch);
    await checkPromoCode(client, {
      code: "IDDTESTR87A",
      email: "a@b.co",
      checkout_id: 21860,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/promos/check");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "IDDTESTR87A",
      email: "a@b.co",
      context: { checkout_id: 21860 },
    });
  });

  it("sends no context when none is given", async () => {
    const mockFetch = vi.fn().mockResolvedValue(ok({ data: {} }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await checkPromoCode(client, { code: "ABC" });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({ code: "ABC" });
  });

  it("refuses two contexts (Spiffy accepts exactly one)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      checkPromoCode(client, { code: "ABC", checkout_id: 1, product_id: 2 }),
    ).rejects.toThrow(/at most one context/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
