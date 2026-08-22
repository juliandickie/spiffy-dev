import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpiffyClient } from "../client.js";
import { jsonResult, normalizeFilterArgs } from "./util.js";
import { currentOperator, writeAuditEntry } from "../audit.js";
import { WRITE_WARNING, requireConfirmation } from "./writes.js";

// The six server-side report types as of Spiffy r85 (2026-08-19):
// product_sales, affiliate_performance, attribution_performance,
// checkout_performance, payment_plan_performance, customer_cohort_ltv.
// report_types_list is the authoritative discovery endpoint; do not
// hard-code this list in prompts.

const reportFilterSchema = z.object({
  name: z.string().describe("Filter name from report_types_list"),
  comparison: z.string().describe("Comparison operator, e.g. 'eq', 'in'"),
  values: z.array(z.unknown()).optional(),
  value: z.unknown().optional(),
});

const reportUserSchema = z.object({
  user_id: z.number().int().optional(),
  email: z.string().optional(),
});

export interface ReportFilter {
  name: string;
  comparison: string;
  values?: unknown[];
  value?: unknown;
}

export interface ReportUser {
  user_id?: number;
  email?: string;
}

export interface CreateReportArgs {
  type: string;
  name?: string;
  filters?: ReportFilter[];
  timezone?: string;
  relative_date?: string;
  frequency?: "day" | "week" | "month" | "year";
  frequency_count?: number;
  users?: ReportUser[];
  confirmed_by_user: true;
  confirmation_summary: string;
}

export interface UpdateReportArgs {
  report_id: number;
  name?: string | null;
  filters?: ReportFilter[];
  timezone?: string;
  relative_date?: string | null;
  frequency?: "day" | "week" | "month" | "year" | null;
  frequency_count?: number | null;
  users?: ReportUser[];
  is_active?: boolean;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export interface DeleteReportArgs {
  report_id: number;
  confirmed_by_user: true;
  confirmation_summary: string;
}

export async function listReportTypes(client: SpiffyClient): Promise<unknown> {
  return client.get("/v2/reports/types");
}

export async function listReports(
  client: SpiffyClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  return client.get("/v2/reports", normalizeFilterArgs(args));
}

export async function getReport(
  client: SpiffyClient,
  args: { report_id: number },
): Promise<unknown> {
  return client.get(`/v2/reports/${args.report_id}`);
}

export async function createReport(
  client: SpiffyClient,
  args: CreateReportArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const {
    confirmed_by_user: _c,
    confirmation_summary: _s,
    ...body
  } = args;
  const response = await client.post<{
    id?: number;
    data?: { id?: number };
  }>("/v2/reports", body);
  const responseId = response.data?.id ?? response.id;
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "report.create",
    summary: args.confirmation_summary,
    responseId: String(responseId ?? "unknown"),
  });
  return response;
}

export async function updateReport(
  client: SpiffyClient,
  args: UpdateReportArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const {
    report_id,
    confirmed_by_user: _c,
    confirmation_summary: _s,
    ...body
  } = args;
  const response = await client.patch<{
    id?: number;
    data?: { id?: number };
  }>(`/v2/reports/${report_id}`, body);
  const responseId = response.data?.id ?? response.id;
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "report.update",
    summary: args.confirmation_summary,
    responseId: String(responseId ?? report_id),
  });
  return response;
}

export async function deleteReport(
  client: SpiffyClient,
  args: DeleteReportArgs,
): Promise<unknown> {
  requireConfirmation(args.confirmed_by_user, args.confirmation_summary);
  const response = await client.delete(`/v2/reports/${args.report_id}`);
  writeAuditEntry({
    timestamp: new Date(),
    operator: currentOperator(),
    operation: "report.delete",
    summary: args.confirmation_summary,
    responseId: String(args.report_id),
  });
  return response ?? { deleted: true, report_id: args.report_id };
}

export async function createReportRun(
  client: SpiffyClient,
  args: { report_id: number },
): Promise<unknown> {
  return client.post(`/v2/reports/${args.report_id}/runs`, {});
}

export async function listReportRuns(
  client: SpiffyClient,
  args: { report_id: number; page?: number; per_page?: number },
): Promise<unknown> {
  return client.get(`/v2/reports/${args.report_id}/runs`, {
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  });
}

export async function getReportRun(
  client: SpiffyClient,
  args: { report_id: number; run_id: number },
): Promise<unknown> {
  return client.get(`/v2/reports/${args.report_id}/runs/${args.run_id}`);
}

export async function listReportRunResults(
  client: SpiffyClient,
  args: {
    report_id: number;
    run_id: number;
    page?: number;
    per_page?: number;
    sort?: string;
  },
): Promise<unknown> {
  const params: Record<string, string | number> = {
    page: args.page ?? 1,
    per_page: args.per_page ?? 25,
  };
  if (args.sort !== undefined) params.sort = args.sort;
  return client.get(
    `/v2/reports/${args.report_id}/runs/${args.run_id}/results`,
    params,
  );
}

export async function createReportRunExport(
  client: SpiffyClient,
  args: { report_id: number; run_id: number; dataset?: string },
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (args.dataset !== undefined) body.dataset = args.dataset;
  return client.post(
    `/v2/reports/${args.report_id}/runs/${args.run_id}/exports`,
    body,
  );
}

export function registerReportTools(
  server: McpServer,
  client: SpiffyClient,
): void {
  server.tool(
    "report_types_list",
    "List the available server-side report types with their filters, " +
      "datasets, columns, grouping options, and relative_date presets. " +
      "Discovery endpoint for the reports API; call before report_create. " +
      "Six types: affiliate_performance, attribution_performance, " +
      "checkout_performance, customer_cohort_ltv, payment_plan_performance, " +
      "product_sales. Note: reports bucket dates in the report's own " +
      "timezone field, unlike /v2/analytics which is UTC-only.",
    {},
    async () => jsonResult(await listReportTypes(client)),
  );

  server.tool(
    "report_list",
    "List saved reports (paginated, filterable by type and is_active).",
    {
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      "filter.type": z.string().optional(),
      "filter.is_active": z.boolean().optional(),
      sort: z.string().optional(),
    },
    async (args) => jsonResult(await listReports(client, args)),
  );

  server.tool(
    "report_get",
    "Get a single saved report by ID (type, filters, schedule, recipients).",
    { report_id: z.number().int() },
    async (args) => jsonResult(await getReport(client, args)),
  );

  server.tool(
    "report_create",
    WRITE_WARNING +
      " Creates a saved report. When frequency and relative_date are set, " +
      "the report is emailed to its users on the computed schedule, exactly " +
      "as dashboard-created scheduled reports are; frequency requires " +
      "relative_date (a rolling window such as 'Last Month'). users[] " +
      "entries take {user_id} OR {email}; when scheduling and users is " +
      "omitted, it defaults to the authorizing user. next_run_at is computed " +
      "automatically. Reports are created active. Call report_types_list " +
      "first for valid type values, filter names, and relative_date presets.",
    {
      type: z.string().describe("Report type from report_types_list"),
      name: z
        .string()
        .optional()
        .describe("Optional; auto-generated from type and filters if omitted"),
      filters: z.array(reportFilterSchema).optional(),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone for date bucketing, e.g. 'Australia/Brisbane'"),
      relative_date: z
        .string()
        .optional()
        .describe("Rolling-window preset from report_types_list, e.g. 'Last Month'"),
      frequency: z.enum(["day", "week", "month", "year"]).optional(),
      frequency_count: z.number().int().optional(),
      users: z.array(reportUserSchema).optional(),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await createReport(client, args as CreateReportArgs)),
  );

  server.tool(
    "report_update",
    WRITE_WARNING +
      " Updates a saved report (partial update; only provided fields " +
      "change). Set name, relative_date, frequency, or frequency_count to " +
      "null to clear them; clearing frequency turns the schedule off. Set " +
      "is_active=true to reactivate a soft-deleted report. Supplying users " +
      "replaces the entire recipient list.",
    {
      report_id: z.number().int(),
      name: z.string().nullable().optional(),
      filters: z.array(reportFilterSchema).optional(),
      timezone: z.string().optional(),
      relative_date: z.string().nullable().optional(),
      frequency: z.enum(["day", "week", "month", "year"]).nullable().optional(),
      frequency_count: z.number().int().nullable().optional(),
      users: z.array(reportUserSchema).optional(),
      is_active: z.boolean().optional(),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await updateReport(client, args as UpdateReportArgs)),
  );

  server.tool(
    "report_delete",
    WRITE_WARNING +
      " Soft-deletes a saved report (sets is_active=false; it leaves the " +
      "default list but can be reactivated via report_update).",
    {
      report_id: z.number().int(),
      confirmed_by_user: z.literal(true),
      confirmation_summary: z.string().min(1),
    },
    async (args) =>
      jsonResult(await deleteReport(client, args as DeleteReportArgs)),
  );

  server.tool(
    "report_run_create",
    "Trigger an async run of a saved report. Returns the run in 'pending' " +
      "status; a background worker picks it up (typically starts within " +
      "about 30 seconds, then takes seconds to minutes depending on data " +
      "volume). Poll report_run_get until status is 'completed' or 'failed'. " +
      "Each poll counts against the monthly API quota, so poll no faster " +
      "than every 30 seconds. The report must have a date range " +
      "(relative_date or a report_date filter) or this returns 400. The run " +
      "inherits the report's filters, timezone, and date range; " +
      "relative_date presets are resolved at run time.",
    { report_id: z.number().int() },
    async (args) => jsonResult(await createReportRun(client, args)),
  );

  server.tool(
    "report_run_list",
    "List past runs for a saved report (paginated).",
    {
      report_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
    },
    async (args) => jsonResult(await listReportRuns(client, args)),
  );

  server.tool(
    "report_run_get",
    "Get a report run (poll for status). When completed, the run includes a " +
      "stats block (flat_stats) that answers most questions, total revenue, " +
      "count, and so on, without fetching rows. Read stats first; only fetch " +
      "rows via report_run_results if you need detail. Each poll counts " +
      "against the monthly API quota; poll no faster than every 30 seconds.",
    { report_id: z.number().int(), run_id: z.number().int() },
    async (args) => jsonResult(await getReportRun(client, args)),
  );

  server.tool(
    "report_run_results",
    "Get paginated tabular results for a completed report run. Rows come " +
      "back as positional arrays keyed by a columns list (token-efficient); " +
      "join on returned ids, never on echoed text. Prefer the run's " +
      "flat_stats (via report_run_get) when a summary suffices, and " +
      "report_run_export for the full dataset as CSV.",
    {
      report_id: z.number().int(),
      run_id: z.number().int(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional(),
      sort: z.string().optional(),
    },
    async (args) => jsonResult(await listReportRunResults(client, args)),
  );

  server.tool(
    "report_run_export",
    "Create a short-lived signed CSV download URL for a completed report " +
      "run. One quota call; the URL itself requires no authentication (the " +
      "signed token is the credential) so the download does not consume " +
      "quota. Expires in 15 minutes. The run must be completed " +
      "(status=completed), 409 otherwise; poll report_run_get first. " +
      "dataset selects which dataset to download (default 'default'; a 400 " +
      "lists the available datasets).",
    {
      report_id: z.number().int(),
      run_id: z.number().int(),
      dataset: z.string().optional(),
    },
    async (args) => jsonResult(await createReportRunExport(client, args)),
  );
}
