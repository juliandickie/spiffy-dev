---
name: spiffy-recent-orders-check
description: Smoke-test the active commerce funnel by listing recent orders with their originating checkouts. Use when the user says "recent orders", "are we still selling", "post-cleanup check", or after disabling checkouts.
---

# Spiffy Recent Orders Check

A short sanity check that the active commerce funnel is still receiving orders. Designed primarily for use immediately after disabling stale checkouts, to confirm a live checkout was not taken down by accident.

## Inputs

- **Limit** (default 20). How many recent orders to inspect.

- **Hours back** (optional). If set, filter to orders created within the last N hours by passing `filter.created_at.gte`.

## Data sources

1. `orders_list` with `per_page={limit}`, optionally with `filter.created_at.gte`.

2. For each unique `checkout_publish_id` seen on those orders, optionally `checkout_list` to resolve the human name (orders carry the checkout id but not the name).

## Calculation

- Group orders by `checkout_publish_id`, count and sum `display_total` (in cents, divide by 100 for dollars).

- Identify a health signal. If zero orders in the window, flag for follow-up. If orders are concentrated on a single checkout that is expected to be live, looks healthy.

## Output format

```markdown
# Spiffy Recent Orders Check - {YYYY-MM-DD HH:MM UTC}

**Window** {last N hours OR most recent {limit} orders}. **Orders found** {N}. **Total revenue** ${X,XXX.XX}.

## Activity by checkout

| Checkout (id) | Orders | Revenue |
|---|---:|---:|
| {name} ({cid}) | {N} | ${X.XX} |

## Most recent orders

| Order ID | Customer ID | Total | Currency | Created | Checkout |
|---|---|---:|---|---|---|
| {oid} | {cid} | ${X.XX} | {usd} | {timestamp} | {name} |

## Health signal

{One of}

- "Recent orders flowing to active checkouts. Funnel looks healthy."

- "WARNING. Zero orders in the last {N} hours. If you just disabled checkouts, verify none of the live ones were taken down by accident."

- "Orders concentrated on checkout {cid} ({name}). Confirm that is intended."
```

## Failure modes

- Zero orders in the window is a meaningful signal, not a silent empty report. Always surface it explicitly in the Health signal section.

- `display_total` is in cents. Divide by 100 before showing dollars.

- If `checkout_publish_id` on an order does not appear in the current `checkout_list` (rare, but possible for very old orders against deleted checkouts), show the id without a name and note it under Health signal.
