---
name: spiffy-churn-report
description: Report subscription churn for a given period — cancellations, failed renewals, retention rate. Use when the user says "churn", "cancellations", "failed renewals", or "retention".
---

# Spiffy Churn Report

Produce a canonical churn + retention report.

## Inputs

- **Period**: default last 30 days.

## Data sources

1. `subscriptions_list` with `filter.status=canceled` and `filter.canceled_at.gte/lte` for cancellations.
2. `payments_list` with `filter.status=failed` and `filter.created_at.gte/lte` for failed charges.
3. `subscriptions_list` with `filter.status=active` to compute retention denominator.

## Calculation

- **Cancelled in period**: count of subs with canceled_at in range.
- **Failed renewals**: count of failed payments that are subscription-related in range.
- **Retention rate** = (active at period start − cancellations in period) / active at period start.

## Output format

```markdown
# Spiffy Churn Report — {period label}

**Generated {YYYY-MM-DD HH:MM UTC}** • Data from api.spiffy.co

## Summary

- **Cancellations:** {N}
- **Failed renewals:** {N}
- **Retention rate:** {X.X}%
- **Active subscriptions (end of period):** {N}

## At-risk subscriptions (past-due)

| Customer | Subscription | Days past due | MRR at stake |
|---|---|---:|---:|
| {name} | {sub_id} | {d} | ${X.XX} |

## Cancellations in period

| Customer | Cancelled on | Plan | Reason (if provided) |
|---|---|---|---|
| {name} | {date} | {plan} | {reason or '—'} |

## Notes

- {Caveats e.g. "Cancellation reason not available via v2 API — shown as '—'."}
```

## Failure modes

- If zero cancellations and zero failed renewals, produce the report with zeros and "No churn detected in this period." in the Summary.
