import { describe, it, expect, vi } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import {
  getAnalyticsCapabilities,
  queryAnalytics,
} from "../../src/tools/analytics.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getAnalyticsCapabilities", () => {
  it("calls GET /v2/analytics/capabilities", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { metrics: [], dimensions: [] } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getAnalyticsCapabilities(client);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/analytics/capabilities");
    expect(init.method).toBe("GET");
  });
});

describe("queryAnalytics", () => {
  it("POSTs the query body to /v2/analytics/query", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ groups: [], totals: {} }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await queryAnalytics(client, {
      object: "account",
      metrics: ["revenue"],
      groupBy: "interval",
      grouping: "day",
      period: { start: "2026-06-01T00:00:00Z", end: "2026-06-30T23:59:59Z" },
      compare: "previous_period",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/analytics/query");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      object: "account",
      metrics: ["revenue"],
      groupBy: "interval",
      grouping: "day",
      period: { start: "2026-06-01T00:00:00Z", end: "2026-06-30T23:59:59Z" },
      compare: "previous_period",
    });
  });

  it("omits optional fields that were not provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ totals: {} }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await queryAnalytics(client, {
      object: "account",
      metrics: ["orders"],
      groupBy: "utm_source",
      period: { start: "2026-06-01T00:00:00Z", end: "2026-06-30T23:59:59Z" },
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect("objId" in body).toBe(false);
    expect("compare" in body).toBe(false);
    expect("grouping" in body).toBe(false);
    expect("touch" in body).toBe(false);
  });

  it("still issues the request under dry-run (a query is a pure read)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ totals: {} }));
    const client = new SpiffyClient(
      { ...baseConfig, dryRun: true },
      mockFetch,
    );
    const result = await queryAnalytics(client, {
      object: "account",
      metrics: ["revenue"],
      groupBy: "interval",
      period: { start: "2026-06-01T00:00:00Z", end: "2026-06-30T23:59:59Z" },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((result as { dry_run?: boolean }).dry_run).toBeUndefined();
  });
});
