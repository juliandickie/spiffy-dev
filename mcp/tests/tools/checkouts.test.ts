import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { listCheckouts } from "../../src/tools/checkouts.js";

const baseConfig = {
  apiKey: "sk_test",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function mockListResponse(checkouts: Array<{
  id: number;
  status: "active" | "expired" | "deleted";
  name: string;
  url_slug: string;
}>): Response {
  return new Response(
    JSON.stringify({ count: checkouts.length, page: 1, checkouts }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("listCheckouts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("hits /v1/checkouts (NOT /v2/checkouts which 404s)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockListResponse([]));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listCheckouts(client, {});
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/checkouts");
  });

  it("returns the v1 pagination shape unchanged when no status filter", async () => {
    const checkouts = [
      { id: 1, status: "active" as const, name: "A", url_slug: "a" },
      { id: 2, status: "expired" as const, name: "B", url_slug: "b" },
    ];
    const mockFetch = vi.fn().mockResolvedValue(mockListResponse(checkouts));
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await listCheckouts(client, {});
    expect(result).toEqual({ count: 2, page: 1, checkouts });
  });

  it("client-side filters by status when provided", async () => {
    const checkouts = [
      { id: 1, status: "active" as const, name: "A", url_slug: "a" },
      { id: 2, status: "expired" as const, name: "B", url_slug: "b" },
      { id: 3, status: "active" as const, name: "C", url_slug: "c" },
    ];
    const mockFetch = vi.fn().mockResolvedValue(mockListResponse(checkouts));
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await listCheckouts(client, { status: "active" });
    expect(result.checkouts).toEqual([
      { id: 1, status: "active", name: "A", url_slug: "a" },
      { id: 3, status: "active", name: "C", url_slug: "c" },
    ]);
    expect(result.count).toBe(3);
    expect(result.page).toBe(1);
  });

  it("passes page parameter through to the API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockListResponse([]));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listCheckouts(client, { page: 3 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/checkouts?page=3");
  });

  it("does NOT send a server-side status query parameter (v1 has no support)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockListResponse([]));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listCheckouts(client, { status: "active" });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/checkouts");
    expect(url).not.toContain("status=");
  });
});
