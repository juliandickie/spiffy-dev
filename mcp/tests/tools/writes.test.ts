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
  addCustomerNote,
  createPromo,
} from "../../src/tools/writes.js";

const baseConfig = {
  apiKey: "k",
  baseUrl: "https://api.spiffy.co",
  dryRun: false,
};

describe("addCustomerNote — confirmation guard", () => {
  beforeEach(() => {
    mockAppendFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  it("rejects confirmed_by_user=false (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      addCustomerNote(client, {
        customer_id: 1,
        notes: "test",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "summary",
      }),
    ).rejects.toThrow(/confirmed_by_user must be true/);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it("rejects empty confirmation_summary (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      addCustomerNote(client, {
        customer_id: 1,
        notes: "test",
        confirmed_by_user: true,
        confirmation_summary: "",
      }),
    ).rejects.toThrow(/confirmation_summary/);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only confirmation_summary", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      addCustomerNote(client, {
        customer_id: 1,
        notes: "test",
        confirmed_by_user: true,
        confirmation_summary: "   \n  ",
      }),
    ).rejects.toThrow(/confirmation_summary/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the note and writes an audit entry when confirmation valid", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await addCustomerNote(client, {
      customer_id: 1,
      notes: "Called about refund",
      confirmed_by_user: true,
      confirmation_summary: "Add note to cus 1: Called about refund",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/customers/1/notes");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ notes: "Called about refund" }));
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("note.add");
    expect(auditLine).toContain("response_id=42");
    expect(result).toEqual({ id: 42 });
  });
});

describe("createPromo — confirmation guard", () => {
  beforeEach(() => {
    mockAppendFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  it("rejects missing confirmation (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      createPromo(client, {
        code: "TEST-ABC",
        onetime_discount_type: "percent",
        onetime_discount_offset: 20,
        order_limit: 1,
        expire_at: "2026-05-01",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the promo with confirmation fields stripped and writes audit", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 99, code: "TEST-ABC" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await createPromo(client, {
      code: "TEST-ABC",
      onetime_discount_type: "percent",
      onetime_discount_offset: 20,
      order_limit: 1,
      expire_at: "2026-05-01",
      confirmed_by_user: true,
      confirmation_summary: "Create TEST-ABC 20% off single-use",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/promos/");
    expect(init.method).toBe("POST");
    // Request body should NOT include confirmation fields
    const body = JSON.parse(init.body as string);
    expect(body.confirmed_by_user).toBeUndefined();
    expect(body.confirmation_summary).toBeUndefined();
    expect(body.code).toBe("TEST-ABC");
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("promo.create");
    expect(auditLine).toContain("response_id=99");
    expect(result).toEqual({ id: 99, code: "TEST-ABC" });
  });
});
