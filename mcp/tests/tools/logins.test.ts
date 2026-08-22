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
  createCustomerMagicLink,
  createCustomerMagicLinkByEmail,
  createAffiliateMagicLink,
} from "../../src/tools/logins.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

function tokenResponse(): Response {
  return new Response(JSON.stringify({ magic_link_token: "tok_abc" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockAppendFileSync.mockReset();
  mockMkdirSync.mockReset();
});

describe("createCustomerMagicLink", () => {
  it("rejects without confirmation (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      createCustomerMagicLink(client, {
        customer_id: 7,
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs /v1/customers/{id}/login and writes an audit entry", async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse());
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await createCustomerMagicLink(client, {
      customer_id: 7,
      url: "https://academy.example.com/dashboard",
      confirmed_by_user: true,
      confirmation_summary: "Magic link for customer 7",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/customers/7/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://academy.example.com/dashboard",
    });
    expect(result).toEqual({ magic_link_token: "tok_abc" });
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("login.customer_magic_link");
    expect(auditLine).toContain("customer_7");
  });

  it("sends an empty body when url is omitted", async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse());
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createCustomerMagicLink(client, {
      customer_id: 7,
      confirmed_by_user: true,
      confirmation_summary: "Magic link for customer 7",
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body as string)).toEqual({});
  });
});

describe("createCustomerMagicLinkByEmail", () => {
  it("POSTs /v1/customers/login with the email in the body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse());
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createCustomerMagicLinkByEmail(client, {
      email: "jane@example.com",
      confirmed_by_user: true,
      confirmation_summary: "Magic link for jane@example.com",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/customers/login");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "jane@example.com",
    });
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("login.customer_magic_link_by_email");
  });

  it("rejects without confirmation", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      createCustomerMagicLinkByEmail(client, {
        email: "jane@example.com",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("createAffiliateMagicLink", () => {
  it("POSTs /v1/affiliates/{id}/login and audits", async () => {
    const mockFetch = vi.fn().mockResolvedValue(tokenResponse());
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createAffiliateMagicLink(client, {
      affiliate_id: 12,
      confirmed_by_user: true,
      confirmation_summary: "Magic link for affiliate 12",
    });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v1/affiliates/12/login");
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("login.affiliate_magic_link");
    expect(auditLine).toContain("affiliate_12");
  });

  it("is blocked by dry-run mode (POST goes through client.post)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient({ ...baseConfig, dryRun: true }, mockFetch);
    const result = await createAffiliateMagicLink(client, {
      affiliate_id: 12,
      confirmed_by_user: true,
      confirmation_summary: "Magic link for affiliate 12",
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect((result as { dry_run?: boolean }).dry_run).toBe(true);
  });
});
