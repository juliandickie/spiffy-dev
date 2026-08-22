---
name: spiffy-top-products-report
description: Rank products (courses) by units sold or revenue for a given period. Use when the user says "top products", "bestsellers", "product revenue", or "best-selling courses".
---

# Spiffy Top Products Report

Produce a canonical ranked bestsellers report.

## Prefer the server-side report (v0.3.0+)

Run the `product_sales` report type first (report_run_create on a product_sales saved report, then read flat_stats and results). It is dashboard-accurate and returns the full ranked table without paginating orders. See the spiffy-analytics-report skill for the run/poll/results flow. Fall back to the client-side aggregation below only if the reports engine is unavailable, and beware docs gotcha 8.7 (mixed-era months can under-count line-item-era checkouts in the report; reconcile against orders_list if the totals look light).

## Inputs

- **Period**: default this month.
- **Metric**: `revenue` (default) or `units`.
- **Top N**: default 10.

## Data sources

1. `orders_list` with `filter.created_at.gte/lte` for the period (paginate).
2. For each order, inspect line items (product_id, quantity, price).
3. Aggregate by product_id.
4. `product_get` or `products_list` to resolve product names.

## Output format

```markdown
# Spiffy Top Products - {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary

- **Total orders:** {N}
- **Total revenue:** ${X,XXX.XX}
- **Distinct products sold:** {N}

## Top {N} by {metric}

| Rank | Product | Units | Revenue | Avg. order value |
|---:|---|---:|---:|---:|
| 1 | {name} | {u} | ${X.XX} | ${X.XX} |

## Notes

- {Caveats e.g. "2 orders had missing line items and were excluded."}
```

## Failure modes

- If no orders in period, produce zero-value report with "No orders in this period."
- If pagination would exceed 10 pages, truncate and note.
