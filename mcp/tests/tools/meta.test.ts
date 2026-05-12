// Tests for the account fetch. Locks in the /v1/account fix from gotcha
// Part 7.1.
import { describe, it, expect, vi } from "vitest";
import { SpiffyClient } from "../../src/client.js";
import { getAccount } from "../../src/tools/meta.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function mockJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("getAccount", () => {
  it("calls /v1/account (NOT /v2/account, which 404s)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJson({
        account_id: 1008,
        account_name: "Test Account",
        user_id: 1,
        user_email: "test@example.com",
        user_name: "Test User",
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getAccount(client);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/account");
    expect(url).not.toContain("/v2/account");
  });

  it("returns the v1 flat shape (account_name, user_email), not v2 (name, email)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockJson({
        account_id: 1008,
        account_name: "Test Account",
        user_email: "test@example.com",
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const account = await getAccount(client);
    expect(account.account_name).toBe("Test Account");
    expect(account.account_id).toBe(1008);
    expect(account.user_email).toBe("test@example.com");
    expect(account).not.toHaveProperty("name");
    expect(account).not.toHaveProperty("plan");
  });
});
