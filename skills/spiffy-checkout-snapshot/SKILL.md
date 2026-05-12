---
name: spiffy-checkout-snapshot
description: Quick health check on Spiffy checkouts, counts by status and flags candidates for cleanup. Use when the user says "checkout snapshot", "checkout health", "stale checkouts", or "what should we clean up".
---

# Spiffy Checkout Snapshot

A fast diagnostic on the checkout layer. Useful before, during, or after a cleanup of stale checkouts.

## Inputs

- **Cleanup filter** (optional). A substring to flag as "candidates for cleanup" against each active checkout's `url_slug`. Example for the iDD account, `-em` flags discontinued Emerging Markets variants.

## Data sources

1. `checkout_list` with pagination, accumulate the full list.

## Calculation

- Count checkouts by status (`active`, `expired`, `deleted`).

- If a cleanup filter was provided, identify active checkouts whose `url_slug` contains that substring.

## Output format

```markdown
# Spiffy Checkout Snapshot - {YYYY-MM-DD HH:MM UTC}

**Total checkouts** {N}

## Counts by status

| Status | Count |
|---|---:|
| active | {N} |
| expired | {N} |
| deleted | {N} |

## Candidates for cleanup ({M})

Shown only when a cleanup filter is supplied. Active checkouts whose URL slug matches the filter substring. Common reasons include discontinued program variants, internal test checkouts, and superseded versions.

| Checkout ID | Name | URL slug |
|---|---|---|
| {cid} | {name} | /{slug} |

## Recommendations

- {Status-count observations, e.g. "expired-to-deleted ratio above 5:1 suggests soft-delete is rarely used and the active list may include functionally retired checkouts."}

- Reminder. Active checkouts not linked from any sales page are functionally disabled but still report `status: "active"` via the API. Truly disabling requires the merchant to change status in the Spiffy admin UI. The API does not expose a programmatic disable endpoint.
```

## Failure modes

- If `checkout_list` pagination would exceed ~20 pages, accumulate what is available and note the cutoff in Recommendations.

- If the account has zero checkouts, report zeros and "No checkouts on this account."
