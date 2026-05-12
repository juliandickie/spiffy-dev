---
name: spiffy-active-commerce-surface
description: Enumerate everything Spiffy is currently selling, including active products, active checkouts, and orphan products. Use when the user says "what are we selling", "active commerce surface", "current product catalogue", or "what's currently in market".
---

# Spiffy Active Commerce Surface

Produce a snapshot of the merchant's current commerce surface. Combines products and checkouts because neither alone tells the full story.

## Why this skill exists

A Spiffy product can be `is_active: true` with no purchasable checkout (grandfathered subscription delivery) and a checkout can exist without a product wrapper (v1 legacy pattern). Listing only products or only checkouts is misleading. This skill combines both views and flags the gap.

Important. `status: "active"` on a checkout means "exists in admin", not "publicly purchasable". A team member may have removed the sales-page link while leaving the API status as active. To confirm "publicly sold", cross-reference active checkouts against the merchant's main-website sales pages. See `docs/spiffy-api-gotchas-and-patterns.md` (gotchas 1.5, 1.6, 1.7).

## Inputs

- No required inputs. Defaults to the full account inventory.

## Data sources

1. `products_list` with pagination, accumulate all products until `meta.pagination.has_more` is false. (Pagination metadata lives under `meta.pagination`, NOT at the top level.)

2. `product_get` per product (provides nested `options[].prices[].amount` in cents and the `checkouts[]` array of attached checkouts).

3. `checkout_list` with pagination, accumulate all checkouts until accumulated length is at least the `count` field.

4. Cross-reference.

   - Products whose `checkouts[]` array contains at least one entry with status `active` in the v1 list, classify as "live products".

   - Products with `is_active: true` but zero active checkouts, classify as "orphan products" (typically grandfathered).

   - Checkouts with status `active` whose `id` does not appear in any product's `checkouts[]` array, classify as "orphan checkouts" (v1 legacy pattern).

## Output format

```markdown
# Spiffy Active Commerce Surface - {YYYY-MM-DD HH:MM UTC}

**Account** {account name}. **Products total** {N}. **Checkouts total** {N}.

## Live products ({M})

Products with at least one active checkout. Candidates for "currently sold". Verify against the merchant's website before publishing externally.

| Product | Product ID | Price | Frequency | Active checkouts |
|---|---|---:|---|---|
| {name} | {pid} | ${X.XX} | {month / year / one-time} | {cid_1, cid_2} |

## Orphan products ({M})

Products with `is_active: true` and zero active checkouts. Typically grandfathered subscription products still delivering to existing customers but closed to new sales.

| Product | Product ID | Last checkout status | Notes |
|---|---|---|---|
| {name} | {pid} | {expired or deleted} | {if relevant} |

## Orphan checkouts ({M})

Active checkouts not wrapped by any product. v1 legacy pattern. Price is configured on the checkout itself.

| Checkout | Checkout ID | URL slug | Status |
|---|---|---|---|
| {name} | {cid} | /{slug} | active |

## Caveats

- "Live products" reflects API-purchasable state. To confirm "publicly sold", cross-reference `{merchant subdomain}.spiffy.co/checkout/{slug}` against the merchant's main-website sales pages.

- Prices shown read from `options[0].prices[0].amount`. Multi-option products may have additional tiers; use `product_get` for full detail.

- Currency assumed single-account-wide (typically USD). Multi-currency accounts will need adaptation.
```

## Failure modes

- If `products_list` pagination would exceed ~20 pages (1000+ products), warn the user and offer to scope by a filter such as recently created.

- If `checkout_list` pagination would exceed ~20 pages, same.

- If `product_get` returns 404 for a product surfaced in `products_list` (race during deletion), skip and add a note to Caveats.

- If the account has zero active products and zero active checkouts, produce the report with zeros and "No active commerce surface found." in the summary.
