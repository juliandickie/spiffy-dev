---
name: spiffy-analytics-report
description: Answer revenue, orders, AOV, LTV, conversion, MRR, churn, refund, and attribution questions with dashboard-accurate numbers from Spiffy's server-side analytics and reports engines. Use when the user asks "how much revenue", "sales last month", "compare to last month", "where did orders come from", "UTM breakdown", "run the product sales report", or any performance question a Spiffy dashboard chart could answer.
---

# Spiffy Analytics Report

Answer performance questions using Spiffy's SERVER-SIDE analytics and reports engines. The numbers match the Spiffy dashboard. Prefer these tools over paginating raw list endpoints and computing client-side; client-side computation is the legacy fallback, not the default.

## Choosing the engine

Two engines, one decision:

- **Analytics** (`analytics_query`): ad-hoc questions, time series, period comparisons, attribution breakdowns. Synchronous, one call, one answer. Use for "revenue last month vs the month before", "orders by utm_source", "MRR trend this quarter".

- **Reports** (`report_*` tools): the six dashboard report types (product_sales, affiliate_performance, attribution_performance, checkout_performance, payment_plan_performance, customer_cohort_ltv), run asynchronously with full row-level datasets and CSV export. Use for "run the product sales report", recurring scheduled reports, or when the user needs the full table rather than a headline number.

## Analytics workflow

1. If unsure which metrics or groupings are valid, call `analytics_capabilities` once and cache the answer for the session.

2. Build the query. Dates are UTC ISO 8601 only. `groupBy: "interval"` plus `grouping` gives a time series; `groupBy` a dimension (channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referring_domain) gives an attribution breakdown (orders-family metrics only). `compare: "previous_period"` gets period-over-period automatically.

3. Call `analytics_query` and present the totals (and comparison deltas when asked for a trend). Amounts are in cents; divide by 100.

## Reports workflow

1. `report_types_list` to discover filters and relative_date presets (first time only).

2. Creating or changing a saved report is a gated write; route it through the /spiffy-report command flow with user confirmation.

3. `report_run_create` to trigger, then poll `report_run_get` no faster than every 30 seconds until `completed` or `failed`. Every poll costs one monthly API call, so do not poll hot.

4. Read `flat_stats` from the completed run FIRST; it answers most questions without fetching rows. Fetch `report_run_results` only for row-level detail. Rows are positional arrays keyed by a columns list; join on returned ids, never on echoed text.

5. For the full dataset, `report_run_export` returns a signed CSV URL (expires in 15 minutes, no auth needed, the download itself costs no quota).

## Footguns

- Analytics dates are UTC-only. Reports bucket dates in the report's own timezone field. Do not assume the two engines agree to the day across a timezone boundary.

- Scheduled reports (frequency set) EMAIL their recipients. Never add a schedule without the user seeing the recipient list.

- The dashboard product-sales export historically missed orders from unretrofitted line-item checkouts (see docs gotcha 8.7 in the dev repo). If a reconciliation against order lists does not tie out for mixed-era months, that is the first suspect.

- Every analytics query, run trigger, poll, and results page is a metered API call. Answer from flat_stats and totals wherever possible.

## Output format

Lead with the headline number and the period, then the breakdown table if one was requested. Always state the data source ("Spiffy analytics engine" or "Spiffy report run {id}") and the period boundaries in the output, so figures are reproducible.
