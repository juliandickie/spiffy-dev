// Tests that lock in the /v1/account fix. See
// docs/spiffy-api-gotchas-and-patterns.md Part 7.1.
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpiffyClient } from "../../src/client.js";
import { registerMetaTools } from "../../src/tools/meta.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function captureAccountGet(
  client: SpiffyClient,
): () => Promise<{ content: Array<{ type: string; text: string }> }> {
  let captured: (() => Promise<{ content: Array<{ type: string; text: string }> }>) | undefined;
  const server = {
    tool(name: string, _d: string, _s: unknown, handler: () => Promise<{ content: Array<{ type: string; text: string }> }>) {
      if (name === "account_get") captured = handler;
    },
  } as unknown as McpServer;
  registerMetaTools(server, client);
  if (!captured) throw new Error("account_get not registered");
  return captured;
}

describe("account_get", () => {
  it("calls /v1/account (NOT /v2/account, which 404s)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account_id: 1008,
          account_name: "Test Account",
          user_id: 1,
          user_email: "test@example.com",
          user_name: "Test User",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const handler = captureAccountGet(client);
    await handler();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/account");
    expect(url).not.toContain("/v2/account");
  });

  it("returns the v1 flat shape (account_name, user_email) not v2 (name, email)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account_id: 1008,
          account_name: "Test Account",
          user_email: "test@example.com",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const handler = captureAccountGet(client);
    const result = await handler();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.account_name).toBe("Test Account");
    expect(payload.account_id).toBe(1008);
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("plan");
  });
});
