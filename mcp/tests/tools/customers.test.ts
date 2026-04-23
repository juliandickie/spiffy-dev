import { describe, it, expect, vi } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import {
  searchCustomers,
  getFullCustomerProfile,
  listCustomerOrders,
} from "../../src/tools/customers.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

describe("searchCustomers", () => {
  it("calls GET /v2/customers/ with search param", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 1, email: "jane@x.com" }],
          pagination: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await searchCustomers(client, { query: "jane", limit: 25 });
    expect((result as { data: unknown[] }).data).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("search=jane");
    expect(url).toContain("per_page=25");
  });
});

describe("getFullCustomerProfile", () => {
  it("calls GET /v2/customers/{id} with include=cards,stats,fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, email: "x@y.com" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getFullCustomerProfile(client, { id: 1 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/v2/customers/1");
    expect(url).toContain("include=cards%2Cstats%2Cfields");
  });
});

describe("listCustomerOrders", () => {
  it("calls GET /v2/orders/ with filter[customer_id]", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listCustomerOrders(client, { customer_id: 42 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("filter%5Bcustomer_id%5D=42");
  });
});
