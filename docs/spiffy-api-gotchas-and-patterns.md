# Spiffy API - Gotchas and Common Patterns

**Source:** iDD project session, 2026-05-12 (querying products, checkouts, and orders for the Institute of Digital Dentistry course catalog)
**Audience:** Future Claude sessions using this plugin, plugin maintainer, anyone integrating Spiffy from outside the Spiffy admin UI

This doc captures friction points that weren't obvious from the public API docs at https://developers.spiffy.co/api during the iDD session, plus common-operation patterns that should have been documented but had to be discovered. The goal is to save the next person from re-discovering the same things.

---

## Part 1 - Gotchas (non-obvious behaviour)

### 1.1 Base URL is not explicit in the auth docs

The authentication page at https://developers.spiffy.co/api/getting-started/authentication references `https://api.spiffy.co/oauth/token` and `https://app.spiffy.co/oauth/authorize` for OAuth, but does not explicitly state "the base URL for all API calls is `https://api.spiffy.co`." The first time someone integrates, they have to infer this. The Products endpoint page DOES say `Base URL: https://api.spiffy.co` but you only find that after navigating into a specific resource page.

**Fix idea:** Put the base URL prominently on the Getting Started / Authentication page.

### 1.2 Mixed API versions - /v2/products but /v1/checkouts

The Products list lives at `/v2/products`. Checkouts live at `/v1/checkouts`. There is no `/v2/checkouts` endpoint at the time of this writing - `GET /v2/checkouts` returns 404 with an HTML body (`Cannot GET /v2/checkouts`). This is not documented anywhere we could find.

The `/v2/products/{id}` response DOES nest a `checkouts` array on each product, but that only shows the checkouts attached to that product - it does NOT surface v1 checkouts that exist without a product wrapper (see 1.5 below).

**Workaround:** Always hit `/v1/checkouts` for the full checkout list. Don't trust the `/api` index page that lists resources (Customers, Orders, Products, Subscriptions, etc.) - "Checkouts" is not listed there even though it's a primary commerce concept.

### 1.3 /v2/products/counts returns misleading data

Calling `GET /v2/products/counts` on an account with 26 active products returned:

```json
{"subscription_product_count": 1, "onetime_product_count": 1}
```

Total of 2, when the actual count was 26. The list endpoint (`/v2/products?page=1&page_size=50`) returned the correct 26.

We don't know whether `counts` is buggy, cached, or returns a specific subset (e.g., "only products created in the last N days"). Either way, **do not trust `/v2/products/counts` for accurate inventory totals.** Use the list endpoint's `pagination.total_count`.

### 1.4 No GET /v1/checkouts/{id} for individual detail

Both `GET /v1/checkouts/{id}` and `GET /v2/checkouts/{id}` return 404. The only way to get detail on a single checkout is to find it via either:

- `GET /v1/checkouts` (returns id + status + name + url_slug for ALL checkouts) - but no pricing, no associated product
- `GET /v2/products/{id}` (returns nested `checkouts` array with checkout_id + internal_name + amount) - but only for checkouts attached to that product

This means you can't enrich a single checkout-by-id with more info on demand. Workflow forces you to pull the full list + match by id.

### 1.5 Checkouts can exist WITHOUT a product wrapper

Spiffy's v1 model allowed checkouts to exist standalone. The v2 model introduced products as a wrapper for standardised reporting + bump orders + add-ons + upsells. But v1 checkouts persist.

**Example from iDD:** the checkout `mastering-exocad-course-spanish` (id 27442) is an active paid commerce surface with no Spiffy product. The amount and frequency are configured on the checkout itself, not via a product's options/prices.

**Implication:** Always treat the CHECKOUT id as the canonical identifier for a commerce surface, not the product id. A product can exist without a checkout (delivery-only for grandfathered subscribers); a checkout can exist without a product (v1 pattern).

### 1.6 Checkout `status: "active"` is necessary but not sufficient for "publicly sold"

`/v1/checkouts` returns a `status` field with values `active`, `expired`, or `deleted`. But `active` only means "the checkout record exists and isn't soft-deleted in admin." It does NOT mean:

- The checkout is purchasable by the public (a team member may have disabled the buy button via a different mechanism)
- The product is in the current public funnel (no sales page may link to it)
- The product is being actively promoted

**Example from iDD:** the iDD Premium Membership checkout (id 8513) was `status: "active"` for several hours despite being functionally disabled - the team had stopped linking to it from anywhere but the API still showed it as active. Only after we asked the team to disable it explicitly did `status` flip to `expired`.

**The real "publicly sold" signal is:** at least one active checkout PLUS a main-site sales page that links to that checkout. Active checkout alone = "purchasable if URL shared directly," which is different from "in the public funnel."

This distinction is not captured by any single Spiffy API field. Cross-reference with the merchant's main website to be confident.

### 1.7 Product `is_active: true` is independent of checkout state

A product can have `is_active: true` even if all its checkouts are expired or deleted. This is intentional - it lets merchants keep a product in the catalogue for grandfathered subscription delivery + renewals while disabling new sales.

**Example from iDD:** iDD Premium Membership (product id 3771) had `is_active: true` (still delivering to existing subscribers) but its only checkout (8513) was disabled (no new sales). Treating `is_active: true` as "currently sold" would be wrong.

**Implication:** Don't infer "currently sold" from product state alone. Always check the associated checkout(s).

### 1.8 Pagination shape varies between v1 and v2

`/v2/products` returns:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_count": 26,
    "total_pages": 1,
    "has_more": false
  }
}
```

`/v1/checkouts` returns:

```json
{
  "count": 94,
  "page": 1,
  "checkouts": [...]
}
```

Note: different keys (`data` vs `checkouts`, `pagination.total_count` vs top-level `count`, no `has_more` flag on v1). Pagination logic must be branched per endpoint. The v1 endpoint requires fetching until you've accumulated >= `count` items.

### 1.9 Price location is deeply nested

For a product with options (most have at least one), the price isn't on the product itself. It's at:

```
product.options[0].prices[0].amount  // integer, in cents
```

Plus there's a checkout-level `amount` that may differ (e.g., if the checkout offers a discount or bundle override).

**Implication:** When fetching pricing, ALWAYS use the product detail endpoint (`GET /v2/products/{id}`) - the list endpoint doesn't include the nested options/prices. And remember the value is in cents, not dollars.

### 1.10 Currency field implies multi-currency but accounts are typically single-currency

The product and price records have a `currency` field. iDD's account was confirmed USD-only globally by Julian. Multi-currency support may be supported per account but isn't documented as universal - check with the merchant before assuming.

### 1.11 No documented programmatic way to disable/expire a checkout

We could not find an endpoint to programmatically change a checkout's status. The Products API supports `PUT /v2/products/{id}` to modify product settings, but no equivalent `PATCH /v1/checkouts/{id}` is documented and our attempts to GET `/v1/checkouts/{id}` returned 404.

Practical implication: cleaning up stale checkouts requires the merchant to manually click through the Spiffy admin UI per checkout. For a merchant with dozens of -em variants to disable, this is painful.

**Feature request:** programmatic checkout state management (or at minimum, document why it isn't exposed if there's an intentional reason).

### 1.12 The `/api` resource index is incomplete

https://developers.spiffy.co/api lists: Customers, Orders, Products, Subscriptions, Payments, Paymentplans, Promos, Affiliates.

It does NOT list Checkouts. But /v1/checkouts is a primary endpoint. Easy to miss.

---

## Part 2 - Common operations (with example commands)

All examples use `${SPIFFY_API_KEY}` from environment. Bearer auth.

### 2.1 List all active products with pagination

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v2/products?page=1&page_size=50" | jq '.data[] | {id, name, is_active, is_subscription}'
```

For >50 products, loop with `page=2`, `page=3`, etc. until `pagination.has_more` is false.

### 2.2 Enrich a single product with options, prices, checkouts

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v2/products/8579" | jq
```

Returns full detail including `options[].prices[]` (the amounts in cents) and `checkouts[]` (the checkouts attached to this product).

### 2.3 List all checkouts (active + expired + deleted)

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v1/checkouts?page=1" | jq '.checkouts[] | {id, status, name, url_slug}'
```

The default response is up to 50 per page. With ~100 checkouts iterate `page=1, page=2, ...` until accumulated count >= `count` field.

### 2.4 Filter to active checkouts only (client-side, no server-side filter found)

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v1/checkouts?page=1" \
  | jq '.checkouts[] | select(.status == "active")'
```

The API doesn't appear to support a `?status=active` query parameter - we tried `/v2/checkouts?is_active=true` and similar variants and they all 404'd. So filter client-side.

### 2.5 Count checkouts by status

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v1/checkouts?page=1" \
  | jq '.checkouts | group_by(.status) | map({status: .[0].status, count: length})'
```

Useful for a quick health check: "how many of my checkouts are still active vs expired vs deleted?"

### 2.6 List recent orders (to see what's actually selling)

```bash
curl -s -H "Authorization: Bearer ${SPIFFY_API_KEY}" \
  "https://api.spiffy.co/v2/orders?limit=10" | jq '.data[] | {id, customer_id, display_total, currency, created_at}'
```

`display_total` is in cents. Divide by 100 to get dollars.

### 2.7 Buyer-facing URL pattern

The merchant subdomain (not the API host) serves the checkout pages. Format:

```
https://{merchant-subdomain}.spiffy.co/checkout/{url_slug}
```

For iDD: `https://instituteofdigitaldentistry.spiffy.co/checkout/cerec-same-day-excellence`

The `url_slug` field on each checkout is the only path component you need. The merchant subdomain is typically constant per account.

### 2.8 Identify "currently publicly sold" vs "active in admin"

The Spiffy API alone cannot answer this - it only knows the admin-side state. To determine if a product is currently publicly sold:

1. Pull checkouts via `/v1/checkouts?status=active` (client-filter)
2. Cross-reference each active checkout's `url_slug` against the merchant's main-website sales pages
3. A checkout is "publicly sold" only if at least one main-site sales page links to its buyer URL

The iDD project codified this as `is_publicly_sold = has_sales_page AND active_checkout_exists`. See the iDD course registry (`output/index/idd-course-registry.json` in the iDD repo) for the pattern note `sales_page_is_canonical_commerce_surface`.

### 2.9 Spot orphan products (active product, no active checkouts)

These are products that may be in "grandfathered subscription delivery" mode - still serving existing customers but no new sales possible.

```bash
# Pseudocode: pull both lists, find products whose checkouts are all non-active
products=$(curl ... /v2/products)
checkouts=$(curl ... /v1/checkouts)
# For each product, check if its product detail's checkouts[] array contains
# any with status == active in the /v1/checkouts list
```

For iDD this surfaced Premium Membership and (initially) Mastering Medit Level 1 as products with no purchase pathways but still active in catalogue.

---

## Part 3 - Schema notes

### Field cheat sheet for the resources we used

**Product (`/v2/products`)**

| Field | Type | Notes |
|---|---|---|
| `id` | int | Stable identifier |
| `account_id` | int | Constant per merchant account |
| `name` | string | Display name |
| `is_active` | bool | Catalogue state (NOT "currently sold"; see 1.7) |
| `is_subscription` | bool | True for recurring products |
| `use_options` | bool | True if multiple options (tier/variant), false for simple one-price products |
| `is_taxable` | bool | Affects checkout calculations |
| `stripe_product_id` | string\|null | Optional Stripe linkage |
| `created_at`, `updated_at` | ISO timestamp | Standard |
| `options[]` | array | Each option has `prices[]` |
| `options[].prices[].amount` | int | **In cents** |
| `options[].prices[].currency` | string | E.g. "usd" |
| `options[].prices[].frequency` | string\|null | "month" / "year" for subscriptions; null for one-time |
| `checkouts[]` | array | Checkouts attached to this product (may be empty) |
| `checkouts[].checkout_id` | int | Cross-reference with /v1/checkouts |
| `checkouts[].amount` | int | In cents |

**Checkout (`/v1/checkouts`)**

| Field | Type | Notes |
|---|---|---|
| `id` | int | Stable identifier |
| `status` | enum | `active`, `expired`, or `deleted`. NOT a purchasability signal (see 1.6) |
| `name` | string | Display name |
| `url_slug` | string | The path component for the buyer URL |

The list endpoint returns only these 4 fields. The detail endpoint (per-id) does not exist (see 1.4).

**Order (`/v2/orders`)**

| Field | Type | Notes |
|---|---|---|
| `id` | int | Stable identifier |
| `customer_id` | int | Cross-reference with Customers |
| `checkout_publish_id` | int | Maps to the checkout that produced this order |
| `display_total` | int | **In cents** |
| `currency` | string | E.g. "usd" |
| `shipping_country` | string\|null | If physical product |
| `url_token` | UUID | Order-specific token (e.g. for receipts) |

---

## Part 4 - Documentation improvement opportunities

If the Spiffy team is open to docs PRs:

1. Put the API base URL prominently on the Getting Started page (currently buried in resource-specific pages)
2. Add a "Checkouts" section to the `/api` resource index (currently missing)
3. Document the v1/v2 split explicitly: which endpoints are v1 vs v2 and why
4. Clarify what `status: "active"` on a checkout means in terms of purchasability (this is the single biggest source of confusion)
5. Document the product/checkout independence model and the "checkout without product" v1 pattern
6. Fix or remove `/v2/products/counts` (currently returns misleading counts; we don't know if it's a bug or an intentional subset)
7. Add per-checkout detail endpoint OR document that the only way to get checkout detail is via product nesting
8. Document programmatic checkout state management if it exists, or formally state it doesn't (so integrators don't keep looking)
9. Add a "publicly sold vs purchasable" guidance section - integrators will keep getting this wrong otherwise

---

## Part 5 - iDD-specific context (for the iDD-Spiffy integration only)

These are conventions specific to the iDD account that other accounts won't share, but they're documented here because they affected this session's interpretation:

- **One global Spiffy account.** No per-region accounts. USD only.
- **`-em` suffix in checkout URL slugs** = "Emerging Markets" - a now-discontinued reduced-price program based on country of residence. Being made inactive across the board (8 -em variants disabled 2026-05-12).
- **Sales-page-is-canonical principle.** A product is "publicly sold" only if a main-site sales page links to an active checkout. The iDD course registry encodes this as `is_publicly_sold` (boolean) derived from `has_sales_page AND active_checkout_exists`.
- **Legacy products keep their product record active.** iDD Premium Membership is `is_active: true` indefinitely for grandfathered subscribers, but all its checkouts are disabled. Don't infer "currently sold" from product state alone.
- **Spiffy checkout admin URL pattern.** Buyer URLs at `https://instituteofdigitaldentistry.spiffy.co/checkout/{url_slug}`.

---

## Part 6 - Useful patterns developed during this session

These were built on top of the API for the iDD project and may be useful as plugin features or skills:

### "Active commerce surface" enumeration

Pull `/v2/products` + `/v2/products/{id}` (with detail) + `/v1/checkouts`, then derive:

- All active products + their primary checkout id + price
- Orphan products (active, no active checkouts)
- Orphan checkouts (active, no product wrapper - v1 pattern)
- Checkouts marked active but disabled in practice (cross-reference with merchant website)

Implementation reference: `pull-spiffy-checkouts.py` in the iDD repo.

### Checkout status snapshot

For a quick "is anything stale?" check:

- `active` count - should match the merchant's expected "currently selling" list
- `expired` count - normal accumulation over time as products are retired
- `deleted` count - one-off cleanup events
- Active checkouts whose URL slugs contain `-em` or other internal markers - candidates for cleanup

### Recent-orders sanity check

`/v2/orders?limit=20` confirms that the active checkouts are actually receiving orders. Useful as a smoke test after disabling stale checkouts to verify you didn't kill an active funnel.

---

## Closing note for the next session

If you're using this plugin and the API behaviour doesn't match what's documented here, two things to check first:

1. Has Spiffy added a `/v2/checkouts` endpoint? (At time of writing, they hadn't.)
2. Has the `status` semantic for checkouts been clarified? (At time of writing, "active" meant "exists in admin," not "purchasable.")

If both still hold, the patterns above should still apply.

---

## Part 7 - Findings from the smoke-test session (2026-05-13)

These structural quirks surfaced during a live-API smoke test of the plugin. The original session (Parts 1 to 6, 2026-05-12) did not exercise these paths, so the gotchas there are correct but incomplete. Treat Parts 1 to 6 as operational gotchas and Part 7 as structural gotchas.

### 7.1 /v2/account does not exist. Use /v1/account.

The plugin's startup health check and the `account_get` tool initially called `GET /v2/account`. This returns 404 with an HTML body (`Cannot GET /v2/account`). The correct endpoint is `GET /v1/account`. Real response shape:

```json
{
  "account_id": 1008,
  "account_name": "Institute of Digital Dentistry",
  "user_id": 1261,
  "user_email": "...",
  "user_name": "..."
}
```

Notable. The v1 account response is FLAT. It does NOT use the `{data: {...}}` wrapper that v2 single-resource responses do. Field names also differ from a typical v2 resource (`account_name` not `name`, `user_email` not `email`).

Fixed in the plugin via the bug-fix commit that landed alongside this addendum.

### 7.2 All v2 single-resource GETs wrap the resource in `{data: {...}}`

Discovered by probing `/v2/products/{id}`, `/v2/orders/{id}`, `/v2/customers/{id}`, `/v2/subscriptions/{id}` against live data. Every one returns:

```json
{"data": {<the actual resource>}}
```

Same wrapper convention as the list endpoints (where `data` is the array), just with an object inside. The plugin's `_get` tools pass the response through unchanged, so the LLM consumes the wrapper and reads `data` accordingly. The bug surfaced only where the plugin's own code reached into the response, specifically `subscription_billing_schedule`, which projected fields directly off the top level without unwrapping. Fixed in the same commit.

### 7.3 Pagination metadata lives at `meta.pagination`, not top-level `pagination`

The shape Part 1 (gotcha 1.8) of this doc described, and the shape the local OpenAPI spec describes, was `{data: [...], pagination: {...}}` at the top level. Both are wrong against the live API. Real shape:

```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "page_size": 50,
      "total_count": 4452,
      "total_pages": 89,
      "has_more": true
    }
  }
}
```

So `meta.pagination.has_more`, not `pagination.has_more`. Same for `total_count`, `page_size`, etc. Plugin tool descriptions and skill files updated accordingly.

### 7.4 Subscriptions have no `price` field, flat or nested

The subscription resource (after unwrapping `data`) has these top-level fields. Highlighting what's MISSING.

- Has. `id, status, next_payment_at, canceled_at, unpaid_at, trial_days, product_option_price_id, order_id, stripe_subscription_id, current_payment_status, retry_schedule, payment_ids`.

- Does NOT have. `price, options, next_billing_date, current_period_start, current_period_end`.

To resolve a subscription to a dollar amount you must follow `product_option_price_id` to the associated product (call `product_get` and walk `options[].prices[].amount`). There is no shortcut field on the subscription itself.

Gotcha 1.9 (price in cents at `options[].prices[].amount`) still applies on PRODUCTS. On subscriptions it does not, because the subscription record only carries the price-id reference.

The `subscription_billing_schedule` tool now correctly returns `next_payment_at` (the actual field name) and `product_option_price_id` so the caller can resolve the price via a follow-up `product_get` if needed.

### 7.5 .env.example documented an outdated key format

The example showed `sk_live_your_key_here` as the format. Real Spiffy API keys are 64-character bare hex strings, no `sk_live_` prefix. Cosmetic but misleading. Fixed.

### 7.6 Mock-driven tests masked all of the above

All 44 plugin unit tests passed (and continue to pass) with the bugs in 7.1, 7.2, 7.3 present, because the test mocks were authored to match the OpenAPI's documented shape rather than the live API's actual shape. The original "Task 27 smoke verification" was apparently mock-driven too. A live-API smoke (against a sandbox key if Spiffy offers one) would catch these structurally and is worth considering as a CI improvement. The Part 6 patterns can serve as a starting point for that smoke suite.
