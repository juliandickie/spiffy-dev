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
  listReportTypes,
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  createReportRun,
  listReportRuns,
  getReportRun,
  listReportRunResults,
  createReportRunExport,
} from "../../src/tools/reports.js";

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

beforeEach(() => {
  mockAppendFileSync.mockReset();
  mockMkdirSync.mockReset();
});

describe("report read tools", () => {
  it("listReportTypes calls GET /v2/reports/types", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listReportTypes(client);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.spiffy.co/v2/reports/types",
    );
  });

  it("listReports normalizes filter args", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listReports(client, {
      page: 2,
      "filter.type": "product_sales",
      "filter.is_active": true,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v2/reports?");
    expect(url).toContain("page=2");
    expect(url).toContain("filter%5Btype%5D=product_sales");
    expect(url).toContain("filter%5Bis_active%5D=true");
  });

  it("getReport calls GET /v2/reports/{id}", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { id: 5 } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getReport(client, { report_id: 5 });
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.spiffy.co/v2/reports/5",
    );
  });
});

describe("createReport", () => {
  it("rejects without confirmation (never calls fetch)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      createReport(client, {
        type: "product_sales",
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs /v2/reports with confirmation fields stripped, audits the id", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { id: 31 } }, 201));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createReport(client, {
      type: "product_sales",
      relative_date: "Last Month",
      frequency: "month",
      confirmed_by_user: true,
      confirmation_summary: "Create monthly product sales report",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/reports");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.confirmed_by_user).toBeUndefined();
    expect(body.confirmation_summary).toBeUndefined();
    expect(body.type).toBe("product_sales");
    expect(body.frequency).toBe("month");
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("report.create");
    expect(auditLine).toContain("response_id=31");
  });
});

describe("updateReport", () => {
  it("PATCHes only the provided fields and preserves explicit nulls", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { id: 31 } }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await updateReport(client, {
      report_id: 31,
      frequency: null,
      confirmed_by_user: true,
      confirmation_summary: "Turn off the schedule for report 31",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/reports/31");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ frequency: null });
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("report.update");
  });

  it("rejects without confirmation", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient(baseConfig, mockFetch);
    await expect(
      updateReport(client, {
        report_id: 31,
        confirmed_by_user: false as unknown as true,
        confirmation_summary: "x",
      }),
    ).rejects.toThrow(/confirmed_by_user/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("deleteReport", () => {
  it("DELETEs /v2/reports/{id}, tolerates 204, audits", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    const result = await deleteReport(client, {
      report_id: 31,
      confirmed_by_user: true,
      confirmation_summary: "Delete report 31",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/reports/31");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ deleted: true, report_id: 31 });
    const auditLine = String(mockAppendFileSync.mock.calls[0][1]);
    expect(auditLine).toContain("report.delete");
    expect(auditLine).toContain("response_id=31");
  });
});

describe("report runs", () => {
  it("createReportRun POSTs /v2/reports/{id}/runs with an empty body", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { id: 900, status: "pending" } }, 201),
      );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createReportRun(client, { report_id: 31 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/reports/31/runs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("createReportRun is blocked by dry-run (a run consumes quota)", async () => {
    const mockFetch = vi.fn();
    const client = new SpiffyClient({ ...baseConfig, dryRun: true }, mockFetch);
    const result = await createReportRun(client, { report_id: 31 });
    expect(mockFetch).not.toHaveBeenCalled();
    expect((result as { dry_run?: boolean }).dry_run).toBe(true);
  });

  it("listReportRuns paginates", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listReportRuns(client, { report_id: 31, page: 3, per_page: 10 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v2/reports/31/runs?");
    expect(url).toContain("page=3");
    expect(url).toContain("per_page=10");
  });

  it("getReportRun polls the run", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { id: 900, status: "completed" } }),
      );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await getReportRun(client, { report_id: 31, run_id: 900 });
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.spiffy.co/v2/reports/31/runs/900",
    );
  });

  it("listReportRunResults passes page, per_page, and sort", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ columns: [], rows: [] }));
    const client = new SpiffyClient(baseConfig, mockFetch);
    await listReportRunResults(client, {
      report_id: 31,
      run_id: 900,
      per_page: 100,
      sort: "-revenue",
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/v2/reports/31/runs/900/results?");
    expect(url).toContain("per_page=100");
    expect(url).toContain("sort=-revenue");
  });

  it("createReportRunExport POSTs the exports endpoint with dataset", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { data: { url: "https://x/signed", expires_at: "2026-08-22T00:15:00Z" } },
          201,
        ),
      );
    const client = new SpiffyClient(baseConfig, mockFetch);
    await createReportRunExport(client, {
      report_id: 31,
      run_id: 900,
      dataset: "default",
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.spiffy.co/v2/reports/31/runs/900/exports");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ dataset: "default" });
  });
});
