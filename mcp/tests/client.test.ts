import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpiffyClient } from "../src/client.js";
import { SpiffyError } from "../src/errors.js";

const baseConfig = {
  apiKey: "sk_test",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

describe("SpiffyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("makes a GET request with Bearer auth and returns JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 1 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);

    const result = await client.get<{ data: unknown[] }>("/v2/customers/");
    expect(result).toEqual({ data: [{ id: 1 }] });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/customers/");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test",
    );
    expect((init.headers as Record<string, string>).Accept).toBe(
      "application/json",
    );
  });

  it("encodes query params into the URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await client.get("/v2/customers/", { search: "jane", per_page: 10 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.spiffy.co/v2/customers/?search=jane&per_page=10",
    );
  });

  it("URL-encodes special characters in query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await client.get("/v2/customers/", { "filter[email]": "a+b@c.com" });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("filter%5Bemail%5D=a%2Bb%40c.com");
  });

  it("throws SpiffyError on 4xx responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "nope" } }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(client.get("/v2/customers/1")).rejects.toBeInstanceOf(
      SpiffyError,
    );
  });

  it("includes SpiffyError status and code", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "nope" } }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(client.get("/v2/customers/1")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("makes a POST request with a JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await client.post("/v2/customers/1/notes", {
      notes: "hello",
    });
    expect(result).toEqual({ id: 42 });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ notes: "hello" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("supports PUT, PATCH, DELETE", async () => {
    const mockFetch = vi.fn().mockImplementation(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await client.put("/v2/x", { a: 1 });
    await client.patch("/v2/x", { b: 2 });
    await client.delete("/v2/x");
    expect(mockFetch.mock.calls.map((c) => c[1].method)).toEqual([
      "PUT",
      "PATCH",
      "DELETE",
    ]);
  });

  it("handles 204 No Content responses", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await client.delete("/v2/x");
    expect(result).toBeUndefined();
  });
});
