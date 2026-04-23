---
name: spiffy-mrr-snapshot
description: Generate a canonical MRR (monthly recurring revenue) snapshot for a given period. Use when the user says "MRR", "monthly recurring revenue", "revenue snapshot", or asks for a subscription-revenue overview.
---

# Spiffy MRR Snapshot

Produce a markdown MRR report. Always use the canonical format below so multiple runs are comparable.

## Inputs (from the user or default)

- **Period**: default "this month" (current calendar month). Accept `this month`, `last month`, `2025-Q1`, `YYYY-MM`, or an explicit `YYYY-MM-DD..YYYY-MM-DD` range.

## Data sources (Spiffy MCP tools)

Use the following MCP tools — compose them to gather the data:

1. `subscriptions_list` with `filter.status=active`, paginate to get every active subscription.
2. For delta vs prior period: call again with `filter.created_at.lte` set to the start of the current period and `filter.status=active` to get "active at start of period".

## Calculation

- **MRR** = sum of normalized monthly price across all active subscriptions.
  - If a subscription's interval is `month` with price P: contributes P.
  - If `year` with price P: contributes P / 12.
  - If `week` with price P: contributes P × 4.345.
- **Active subscription count** = number of subs with status=`active`.
- **Delta vs prior period** = current MRR − prior MRR (absolute and percent).

## Output format (always use this, verbatim structure)

```markdown
# Spiffy MRR Snapshot — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary

- **Current MRR:** ${X,XXX.XX}
- **Active subscriptions:** {N}
- **Delta vs prior period:** {+/-}${X.XX} ({+/-}X.X%)

## Breakdown by plan (if multiple plans)

| Plan | Subs | MRR contribution |
|---|---:|---:|
| Basic | 42 | $420.00 |
| Pro | 18 | $1,800.00 |

## Notes
- Figures normalized to monthly ({conversion rules applied}).
- {Any caveats — e.g. "3 subs had null price; excluded."}
```

Always include the "Generated ... Data from api.spiffy.co" footer.

## Failure modes

- If no active subscriptions exist, output the report with `$0.00` and "0 active subscriptions" rather than erroring.
- If pagination would require more than 10 pages of `subscriptions_list`, stop at 10 pages and add a note: "Truncated at 1,000 subscriptions — contact support if you have more."
