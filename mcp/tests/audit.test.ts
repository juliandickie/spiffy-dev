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

import { formatAuditLine, writeAuditEntry } from "../src/audit.js";

describe("formatAuditLine", () => {
  it("formats a one-line record with timestamp, operator, operation, response_id, and summary", () => {
    const line = formatAuditLine({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "promo.create",
      summary: "Create JANE-MAY26-A7KQ 20% off for cus_123",
      responseId: "promo_456",
    });
    expect(line).toBe(
      '2026-04-23T14:32:01.000Z\tjulian\tpromo.create\tresponse_id=promo_456\tsummary="Create JANE-MAY26-A7KQ 20% off for cus_123"\n',
    );
  });

  it("escapes tabs and newlines in the summary", () => {
    const line = formatAuditLine({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "note.add",
      summary: "Line one\nLine\ttwo",
      responseId: "note_1",
    });
    expect(line).toContain('summary="Line one\\nLine\\ttwo"');
  });

  it("escapes embedded quotes and backslashes", () => {
    const line = formatAuditLine({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "note.add",
      summary: 'Said: "hi" with \\slash',
      responseId: "note_1",
    });
    expect(line).toContain('summary="Said: \\"hi\\" with \\\\slash"');
  });
});

describe("writeAuditEntry", () => {
  beforeEach(() => {
    mockAppendFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  it("appends a line to the audit log file under ~/.local/share/spiffy-plugin/", () => {
    writeAuditEntry({
      timestamp: new Date("2026-04-23T14:32:01Z"),
      operator: "julian",
      operation: "note.add",
      summary: "test",
      responseId: "note_1",
    });

    expect(mockMkdirSync).toHaveBeenCalled();
    const mkdirPath = String(mockMkdirSync.mock.calls[0][0]);
    expect(mkdirPath).toContain(".local/share/spiffy-plugin");

    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const [path, line, encoding] = mockAppendFileSync.mock.calls[0];
    expect(String(path)).toContain(".local/share/spiffy-plugin/audit.log");
    expect(String(line)).toContain("note.add");
    expect(encoding).toBe("utf8");
  });
});
