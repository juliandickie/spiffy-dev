import { describe, it, expect, vi } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { listEvents } from "../../src/tools/events.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

describe("listEvents", () => {
  it("calls GET /v2/events with normalized filters", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listEvents(client, {
      page: 1,
      "filter.customer_id": 42,
      "filter.name": "subscription.canceled",
      "filter.created_at.gte": "2026-08-01T00:00:00Z",
      sort: "-created_at",
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("https://api.spiffy.co/v2/events?");
    expect(url).toContain("filter%5Bcustomer_id%5D=42");
    expect(url).toContain("filter%5Bname%5D=subscription.canceled");
    expect(url).toContain("filter%5Bcreated_at.gte%5D=");
    expect(url).toContain("sort=-created_at");
  });
});
