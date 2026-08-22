// Spiffy plugin live-API smoke test. Read-only.
//
// Verifies that the plugin's MCP tool surface still matches the live Spiffy
// API behaviour. This catches structural drift that mock-driven unit tests
// cannot, because mocks are authored to match documentation rather than
// reality. See docs/spiffy-api-gotchas-and-patterns.md Part 7 for the
// findings that motivated this script.
//
// Usage:
//   cd mcp && npm run smoke
//
// Or manually:
//   cd mcp && npx tsx scripts/smoke.ts
//
// The script loads SPIFFY_API_KEY from the repo-root `.env` if present.
// It forces SPIFFY_DRY_RUN=1 belt-and-suspenders to make accidental writes
// impossible. Every request is a read: GETs, plus one POST to
// /v2/analytics/query, which is a pure read that goes through
// client.postRead (deliberately exempt from dry-run; see client.ts).
//
// Exits 0 if all checks pass, 1 if any check fails or errors.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SpiffyClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { listCheckouts } from "../src/tools/checkouts.js";
import { getAccount } from "../src/tools/meta.js";
import { getSubscriptionBillingSchedule } from "../src/tools/subscriptions.js";
import {
  getAnalyticsCapabilities,
  queryAnalytics,
} from "../src/tools/analytics.js";
import { listReportTypes, listReports } from "../src/tools/reports.js";
import { listEvents } from "../src/tools/events.js";

function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", ".env"),
    join(here, "..", ".env"),
    join(process.cwd(), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    return;
  }
}

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "INFO";
  detail: string;
}

async function check(
  name: string,
  fn: () => Promise<{ status: CheckResult["status"]; detail: string }>,
): Promise<CheckResult> {
  try {
    const { status, detail } = await fn();
    return { name, status, detail };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      detail: (err as Error).message.split("\n")[0].slice(0, 200),
    };
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  // Force dry-run as defense in depth. We only call GETs, but if something
  // ever leaks a POST into this script we want it to be a no-op.
  process.env.SPIFFY_DRY_RUN = "1";

  const cfg = await loadConfig();
  const client = new SpiffyClient(cfg);

  console.log("Spiffy plugin live-API smoke test");
  console.log("=================================");
  console.log(
    `Config. baseUrl=${cfg.baseUrl} dryRun=${cfg.dryRun} key=${cfg.apiKey.slice(0, 6)}*** keyLen=${cfg.apiKey.length}`,
  );
  console.log();

  const results: CheckResult[] = [];

  // Bug A regression guard: getAccount() (exported production function)
  // hits /v1/account and returns the flat shape.
  results.push(
    await check("Bug A. getAccount() via /v1/account", async () => {
      const account = await getAccount(client);
      if (!account.account_id || !account.account_name) {
        return {
          status: "FAIL",
          detail: `expected flat {account_id, account_name}, got ${JSON.stringify(account).slice(0, 120)}`,
        };
      }
      return {
        status: "PASS",
        detail: `account_id=${account.account_id} name="${account.account_name}"`,
      };
    }),
  );

  // Bug A negative guard: /v2/account is still 404.
  results.push(
    await check("Bug A. /v2/account remains 404 (regression check)", async () => {
      try {
        await client.get("/v2/account");
        return {
          status: "INFO",
          detail: "Spiffy may have added /v2/account. Consider updating plugin to use it.",
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          return { status: "PASS", detail: "still 404 as expected" };
        }
        return { status: "FAIL", detail: `unexpected error: ${msg.slice(0, 120)}` };
      }
    }),
  );

  // Bug B regression guard: getSubscriptionBillingSchedule() (exported
  // production function) unwraps {data} and projects real field names.
  results.push(
    await check(
      "Bug B. getSubscriptionBillingSchedule() (unwrap and field names)",
      async () => {
        const subs = await client.get<{
          data: Array<{ id: number }>;
        }>("/v2/subscriptions/", { per_page: 1 });
        const subId = subs.data[0]?.id;
        if (!subId) {
          return { status: "SKIP", detail: "no subscriptions on account" };
        }
        const projection = await getSubscriptionBillingSchedule(client, subId);
        const populated = Object.values(projection).filter(
          (v) => v !== undefined,
        ).length;
        if (populated < 3) {
          return {
            status: "FAIL",
            detail: `only ${populated}/8 fields populated. Wrapper or field names may have changed.`,
          };
        }
        return {
          status: "PASS",
          detail: `${populated}/8 fields populated (id=${projection.id} status=${projection.status})`,
        };
      },
    ),
  );

  // Bug C regression guard: pagination lives at meta.pagination.
  results.push(
    await check("Bug C. pagination at meta.pagination (not top-level)", async () => {
      const resp = await client.get<{
        data: unknown[];
        meta?: { pagination?: { total_count?: number; has_more?: boolean } };
        pagination?: unknown;
      }>("/v2/products/", { per_page: 1 });
      const metaPag = resp.meta?.pagination;
      const topPag = resp.pagination;
      if (!metaPag || typeof metaPag.total_count !== "number") {
        return {
          status: "FAIL",
          detail: `meta.pagination.total_count missing. meta=${JSON.stringify(resp.meta).slice(0, 120)}`,
        };
      }
      if (topPag) {
        return {
          status: "INFO",
          detail: `meta.pagination works but top-level pagination ALSO present. Spiffy may have added both shapes.`,
        };
      }
      return {
        status: "PASS",
        detail: `total_count=${metaPag.total_count} has_more=${metaPag.has_more}`,
      };
    }),
  );

  // checkout_list end-to-end (the new tool from this branch).
  results.push(
    await check("checkout_list tool (the new v1 surface)", async () => {
      const result = await listCheckouts(client, { page: 1 });
      const statuses = result.checkouts.reduce<Record<string, number>>(
        (acc, c) => {
          acc[c.status] = (acc[c.status] ?? 0) + 1;
          return acc;
        },
        {},
      );
      if (typeof result.count !== "number" || !Array.isArray(result.checkouts)) {
        return {
          status: "FAIL",
          detail: `expected v1 shape {count, checkouts}. Got ${JSON.stringify(result).slice(0, 120)}`,
        };
      }
      return {
        status: "PASS",
        detail: `total=${result.count} on_p1=${result.checkouts.length} by_status=${JSON.stringify(statuses)}`,
      };
    }),
  );

  // checkout_list filter (client-side).
  results.push(
    await check("checkout_list status filter (client-side)", async () => {
      const active = await listCheckouts(client, { page: 1, status: "active" });
      const allOnPage = (await listCheckouts(client, { page: 1 })).checkouts.length;
      if (active.checkouts.length > allOnPage) {
        return {
          status: "FAIL",
          detail: `filter returned MORE rows than unfiltered. Client-side filter broken.`,
        };
      }
      if (active.checkouts.some((c) => c.status !== "active")) {
        return {
          status: "FAIL",
          detail: `filter let through non-active rows.`,
        };
      }
      return {
        status: "PASS",
        detail: `active=${active.checkouts.length}/${allOnPage} on page 1`,
      };
    }),
  );

  // Gotcha 1.2 sanity. /v2/checkouts should still 404.
  results.push(
    await check("Gotcha 1.2 sanity. /v2/checkouts still 404", async () => {
      try {
        await client.get("/v2/checkouts");
        return {
          status: "INFO",
          detail: "Spiffy may have added /v2/checkouts. Consider migrating checkout_list.",
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          return { status: "PASS", detail: "still 404 as expected (gotcha 1.2 still applies)" };
        }
        return { status: "FAIL", detail: `unexpected error: ${msg.slice(0, 120)}` };
      }
    }),
  );

  // Gotcha 1.3 sanity. /v2/products/counts misreports.
  results.push(
    await check("Gotcha 1.3 sanity. /v2/products/counts misreports", async () => {
      const counts = await client.get<{
        subscription_product_count?: number;
        onetime_product_count?: number;
      }>("/v2/products/counts");
      const list = await client.get<{
        meta: { pagination: { total_count: number } };
      }>("/v2/products/", { per_page: 1 });
      const summed =
        (counts.subscription_product_count ?? 0) +
        (counts.onetime_product_count ?? 0);
      const real = list.meta.pagination.total_count;
      if (summed === real) {
        return {
          status: "INFO",
          detail: `counts now matches real total (${real}). Spiffy may have fixed gotcha 1.3.`,
        };
      }
      return {
        status: "PASS",
        detail: `counts says ${summed}, real total is ${real} (gotcha 1.3 still applies)`,
      };
    }),
  );

  // r85 surface. analytics capabilities catalog.
  results.push(
    await check("r85. analytics_capabilities catalog", async () => {
      const resp = (await getAnalyticsCapabilities(client)) as {
        data?: { metrics?: unknown[]; dimensions?: unknown[] };
        metrics?: unknown[];
        dimensions?: unknown[];
      };
      const body = resp.data ?? resp;
      const metrics = Array.isArray(body.metrics) ? body.metrics.length : 0;
      const dimensions = Array.isArray(body.dimensions)
        ? body.dimensions.length
        : 0;
      if (metrics === 0) {
        return {
          status: "FAIL",
          detail: `no metrics in catalog. Got ${JSON.stringify(resp).slice(0, 120)}`,
        };
      }
      return {
        status: "PASS",
        detail: `${metrics} metrics, ${dimensions} dimensions`,
      };
    }),
  );

  // r85 surface. analytics_query is a pure-read POST that must bypass
  // dry-run (client.postRead). One monthly quota call.
  results.push(
    await check("r85. analytics_query revenue (POST read, 1 quota call)", async () => {
      const now = new Date();
      const end = now.toISOString().slice(0, 19) + "Z";
      const start =
        new Date(now.getTime() - 7 * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 19) + "Z";
      const resp = (await queryAnalytics(client, {
        object: "account",
        metrics: ["revenue"],
        groupBy: "interval",
        grouping: "day",
        period: { start, end },
      })) as { dry_run?: boolean; data?: unknown; totals?: unknown };
      if (resp.dry_run) {
        return {
          status: "FAIL",
          detail: "query was swallowed by dry-run; postRead exemption broken",
        };
      }
      const body = (resp.data ?? resp) as { totals?: unknown; groups?: unknown[] };
      if (body.totals === undefined) {
        return {
          status: "FAIL",
          detail: `no totals in response. Got ${JSON.stringify(resp).slice(0, 120)}`,
        };
      }
      return {
        status: "PASS",
        detail: `totals=${JSON.stringify(body.totals).slice(0, 80)}`,
      };
    }),
  );

  // r85 surface. report types discovery lists the six server-side types.
  results.push(
    await check("r85. report_types_list has the six types", async () => {
      const resp = (await listReportTypes(client)) as {
        data?: unknown;
      };
      const body = resp.data ?? resp;
      const names = JSON.stringify(body);
      const expected = [
        "product_sales",
        "affiliate_performance",
        "attribution_performance",
        "checkout_performance",
        "payment_plan_performance",
        "customer_cohort_ltv",
      ];
      const missing = expected.filter((t) => !names.includes(t));
      if (missing.length > 0) {
        return {
          status: "FAIL",
          detail: `missing types: ${missing.join(", ")}`,
        };
      }
      return { status: "PASS", detail: "all six report types present" };
    }),
  );

  // r85 surface. saved reports list.
  results.push(
    await check("r85. report_list", async () => {
      const resp = (await listReports(client, { per_page: 1 })) as {
        data?: unknown[];
      };
      if (!Array.isArray(resp.data)) {
        return {
          status: "FAIL",
          detail: `expected {data: [...]}. Got ${JSON.stringify(resp).slice(0, 120)}`,
        };
      }
      return { status: "PASS", detail: `list ok (${resp.data.length} on page 1)` };
    }),
  );

  // r85 surface. events lister.
  results.push(
    await check("r85. events_list", async () => {
      const resp = (await listEvents(client, { per_page: 1 })) as {
        data?: unknown[];
      };
      if (!Array.isArray(resp.data)) {
        return {
          status: "FAIL",
          detail: `expected {data: [...]}. Got ${JSON.stringify(resp).slice(0, 120)}`,
        };
      }
      return { status: "PASS", detail: `list ok (${resp.data.length} on page 1)` };
    }),
  );

  // Render results
  console.log();
  const maxNameLen = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const pad = " ".repeat(Math.max(0, maxNameLen - r.name.length));
    console.log(`  ${r.name}${pad}  ${r.status}  ${r.detail}`);
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const info = results.filter((r) => r.status === "INFO").length;
  console.log();
  console.log(`${passed}/${results.length} passed. ${failed} failed, ${skipped} skipped, ${info} info.`);

  if (failed > 0) {
    console.log("FAILURES detected. Review the live API behaviour and fix the plugin.");
    process.exit(1);
  }
  if (info > 0) {
    console.log("INFO items detected. Spiffy may have changed behaviour. Review docs/spiffy-api-gotchas-and-patterns.md.");
  }
}

main().catch((err) => {
  console.error(`\n[FATAL] ${(err as Error).message}`);
  process.exit(1);
});
