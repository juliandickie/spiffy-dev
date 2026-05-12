---
name: spiffy-affiliate-report
description: Rank affiliates by revenue, signups, and commissions for a given period. Use when the user says "affiliate report", "affiliate performance", "top affiliates", or asks "who's driving the most revenue".
---

# Spiffy Affiliate Performance Report

Produce a canonical ranked report of affiliate performance.

## Inputs

- **Period**: default last 30 days. Accept any standard range notation.
- **Top N**: default 10.

## Data sources

1. `affiliates_list` — paginate all affiliates.
2. `orders_list` with `filter.created_at.gte` and `filter.created_at.lte` for the period. Orders have an affiliate association; group by affiliate_id.
3. `affiliate_program_get` for commission rules (if needed to compute commission).

## Output format

```markdown
# Spiffy Affiliate Report — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary

- **Total affiliate-driven revenue:** ${X,XXX.XX}
- **Total signups from affiliates:** {N}
- **Active affiliates (drove ≥1 order):** {N}

## Top {N} affiliates by revenue

| Rank | Affiliate | Signups | Revenue | Commission owed |
|---:|---|---:|---:|---:|
| 1 | {name} | {n} | ${X.XX} | ${X.XX} |

## Notes

- Commission computed using program `{program_name}` rules (`{rule_desc}`).
- {Any caveats}
```

## Failure modes

- If no affiliate-tagged orders in the period, produce the report with zero values and "No affiliate-driven orders in this period".
- Affiliates with no orders in the period are listed in a collapsed "Inactive in period" footer count.
