# Changelog

All notable changes to the Spiffy Claude Code Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-13

First substantive release after the marketplace launch. Adds the missing checkouts surface, three commerce-diagnostic skills, a live-API smoke verification step, and fixes four pre-existing bugs surfaced by running that smoke against a production Spiffy account for the first time.

### Added

- New MCP tool `checkout_list` covering `/v1/checkouts`. Spiffy has no `/v2/checkouts` at time of writing; this closes the gap. Tool description carries the operational gotchas (status semantics, no per-id GET, v1 pagination shape, product-wrapper independence).

- Three new commerce-diagnostic skills.
  - `spiffy-active-commerce-surface`, enumerates what is currently being sold by combining products and checkouts.
  - `spiffy-checkout-snapshot`, status counts and stale-checkout candidates for cleanup.
  - `spiffy-recent-orders-check`, smoke test for the active funnel after disabling checkouts.

- `npm run smoke` script at `mcp/scripts/smoke.ts`. Read-only live-API verification covering eight checks. Loads `SPIFFY_API_KEY` from repo-root `.env`, forces `SPIFFY_DRY_RUN=1`, exits non-zero on any failure.

- Documented filter parameters on `affiliates_list` (email, name_last, slug, is_ready_for_payout with `.contains` variants) and a `sort` parameter on both `affiliates_list` and `products_list`.

- New "For plugin integrators" section in `README.md` pointing to `docs/spiffy-api-gotchas-and-patterns.md`.

- New "Live-API smoke" subsection under Development in `README.md`.

### Changed

- Exported `getSubscriptionBillingSchedule(client, id)` from `subscriptions.ts` and `getAccount(client)` from `meta.ts` as pure projection functions, matching the convention already in `customers.ts` and `writes.ts`. MCP tool handlers are now one-liners that call these functions. Tests and the live smoke call the exported functions directly rather than scaffolding fake MCP servers.

- `products_list`, `promo_list`, and `affiliates_list` now use `normalizeFilterArgs` for consistency with the other list tools.

- Tool descriptions across `product_get`, `products_list`, `order_get`, `orders_list`, `subscription_billing_schedule`, and `checkout_list` now explicitly call out the operational gotchas they relate to.

### Fixed

- `/v2/account` does not exist on Spiffy v2. Startup health check and `account_get` tool now use `/v1/account` and read the flat response (`account_id`, `account_name`, `user_id`, `user_email`, `user_name`).

- `subscription_billing_schedule` previously projected all-undefined fields. Two compounding causes. The response wraps the resource in `{data: {...}}` and the code read fields off the wrapper. Field names were also wrong (real fields are `next_payment_at`, `canceled_at`, `unpaid_at`, `trial_days`, `current_payment_status`, `product_option_price_id`; there is no `next_billing_date`, `current_period_*`, or `price`). Both fixed.

- Pagination metadata lives at `meta.pagination`, not top-level `pagination`. Tool descriptions and skill files updated to the correct path.

- `addCustomerNote` and `createPromo` audit-id reads now defensively unwrap the POST response (`response.data?.id ?? response.id`) so the audit log records the real id rather than `unknown`.

- `.env.example` previously documented an outdated `sk_live_` key format. Updated to reflect the real 64-character bare hex key format.

### Documentation

- `docs/spiffy-api-gotchas-and-patterns.md` Part 7 captures four new structural findings discovered during the live-API smoke that Parts 1 to 6 missed.
  - 7.1, `/v2/account` does not exist
  - 7.2, v2 single-resource GETs wrap responses in `{data: {...}}`
  - 7.3, pagination at `meta.pagination`, not top-level
  - 7.4, subscriptions have no `price` field, flat or nested
  - 7.5, `.env.example` had an outdated key format
  - 7.6, mock-driven tests masked all of the above

### Verification

- 51 unit tests pass across 9 test files. Was 44 across 7 at 0.1.0.

- 8/8 live-API smoke checks pass against the iDD production account in read-only mode.

- esbuild bundle rebuilds to 802.8KB. Byte-identical to 0.1.0 because the version string is not embedded in the bundle.

### Upgrade notes

None. All changes are API-additive or bug fixes. Existing MCP tool names and skill names are unchanged.

## [0.1.0] - 2026-04-27

Initial marketplace release. Distributed via the Claude Code plugin marketplace at `Institute-of-Digital-Dentistry/spiffy-plugin`.

### Added

- MCP server bundled as a self-contained pre-built file at `mcp/dist/index.js` so end users do not need to run `npm install`.

- Customer-lookup tools. `customer_search`, `customer_get_full_profile`, `customer_list_orders`, `customer_list_subscriptions`, `customer_list_payments`.

- Read tools across the v2 surface. Orders, subscriptions, payments (one-time and payment plans), products, promos, affiliates.

- Write tools with explicit confirmation gates. `customer_add_note`, `promo_create`. Both require `confirmed_by_user: true` and a `confirmation_summary` string before sending to Spiffy, and both log to an audit file at `~/.local/share/spiffy-plugin/audit.log`.

- Slash commands. `/spiffy-note <customer> "<text>"` and `/spiffy-promo <customer> --percent N --expires Nd`.

- Four report skills. `spiffy-mrr-snapshot`, `spiffy-churn-report`, `spiffy-affiliate-report`, `spiffy-top-products-report`.

- Three API key configuration paths. Environment variable, 1Password CLI reference, and `~/.config/spiffy-plugin/config.toml` fallback.

- Dry-run mode via `SPIFFY_DRY_RUN=1` that blocks writes and returns synthetic responses.

- Rate-limit-aware HTTP client with retry-on-429 honouring `X-RateLimit-Reset`.

- Pre-push git hook at `.githooks/pre-push` blocking direct pushes to `main`.

[Unreleased]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.2.0
[0.1.0]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/commit/99bc904

