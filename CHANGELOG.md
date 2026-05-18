# Changelog

All notable changes to the Spiffy Claude Code Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.4] - 2026-05-18

### Added

- New `/spiffy-doctor` slash command. Diagnoses why Spiffy tools are missing or failing by checking every API key source (the `SPIFFY_API_KEY` env var, a 1Password `op://` reference, and `~/.config/spiffy-plugin/config.toml`) and reporting the exact cause and the single fix to apply. Read-only, and never prints the full key. Replaces the manual bundled-source read that diagnosing issue #14 required.

### Fixed

- `loadFromTomlFallback` in `mcp/src/config.ts` no longer silently swallows every error. A `~/.config/spiffy-plugin/config.toml` that exists but cannot yield an `api_key` (invalid TOML, dotenv `SPIFFY_API_KEY=...` syntax, or valid TOML with no `api_key` field) now fails startup with a specific error naming the file path and the precise reason, and points at the correct TOML form when it detects the dotenv mistake. Only a genuine ENOENT (no file present) still falls through to the env-var path as before. Fixes #14, a configuration mistake that produced a 5-day silent outage because the failure was reported as the generic and misleading "SPIFFY_API_KEY is not set".

### Changed

- `.env.example` reworked. Its first line previously read as the canonical "where you put your Spiffy key" file in dotenv syntax, which was trivially mis-saved as `config.toml` (the trigger in #14, and a repeat of the class of mistake recorded in gotcha 7.5). It now states up front that it is dev-tooling only (consumed solely by `npm run smoke`, the server has no dotenv loader), that it must not be saved as `config.toml`, and points end users at the README "Configure your API key" section. The misleading "skip this file and use config.toml instead" option was removed.

### Verification

- 54 unit tests pass across 9 test files (was 51). Three new `config.test.ts` cases cover the dotenv-in-config.toml mistake (the exact #14 repro), valid TOML with no `api_key`, and the `SPIFFY_API_KEY`-as-a-TOML-key variant. The existing no-config test was hardened to simulate a real ENOENT (`err.code`), proving the fall-through path does not regress. typecheck clean.

## [0.2.2] - 2026-05-13

Cosmetic cleanup. Smaller plugin icon and consistent text styling across user-facing strings.

### Changed

- Optimised plugin icons via PNG palette quantisation (256 colours, no visible quality loss). `plugin/.claude-plugin/icon.png` dropped from 761KB to 147KB, `icon-256.png` from 47KB to 11.5KB, `icon-64.png` from 4.7KB to 1.9KB. Total `plugin/.claude-plugin/` directory shrank from 808KB to 164KB.

- Removed em-dashes and en-dashes from all user-facing strings (plugin manifest description, slash command guidance, skill files, tool description strings, README bullets and troubleshooting entries). Replacements followed CLAUDE.md preference: commas for continuing thoughts, periods for new sentences, parentheses for asides, hyphens-with-spaces for title segments. Mathematical minus sign (U+2212) in formulas was correctly left untouched.

### Fixed

- Total plugin install footprint reduced from approximately 1.6MB to approximately 1.0MB. Combined with the v0.2.1 restructure, the install is now ~42% of the v0.1.0 size.

### Internal

- ImageMagick `magick ... -strip -colors 256 -define png:compression-level=9` used for icon optimisation. The 1024x1024 master compressed best with 256-colour palette quantisation; flat regions and smooth gradients in icon-style images compress dramatically with this approach.

- Em-dash sweep skipped `docs/superpowers/` (archived dev artifacts) and `spiffy-openapi.json` (third-party API spec).

## [0.2.1] - 2026-05-13

Structural cleanup, no user-visible behaviour change. Reorganises the repository so the plugin source occupies a dedicated `./plugin/` subdirectory rather than the repo root. Dev infrastructure (TypeScript source, tests, smoke script, OpenAPI reference, design docs) stays at the repo root where it does not bloat user installs.

### Changed

- `marketplace.json` plugin source now points at `./plugin` instead of `./`. Claude Code copies only the plugin subdirectory into the user's install cache.

- The build target moves. `esbuild` now writes the bundled MCP server directly to `plugin/mcp/dist/index.js` rather than `mcp/dist/index.js`. Dev workflows under `mcp/` are unchanged (`npm test`, `npm run smoke`, `npm run typecheck` still run from the same place).

- `marketplace.json` `metadata.version` synced from `0.1.0` to `0.2.1` so the catalog version reflects the catalog change.

- `marketplace.json` `plugins[].version` field removed. Per Claude Code's docs, setting `version` in both the plugin's `plugin.json` and the marketplace entry can silently mask the real version. `plugin.json` is now the single source of truth.

### Fixed

- Install footprint reduced from approximately 2.4MB to 1.6MB by no longer shipping `spiffy-openapi.json` (572KB), `mcp/src/` (72KB), `mcp/tests/` (48KB), `mcp/scripts/` (12KB), `docs/superpowers/` (130KB), or `docs/spiffy-api-gotchas-and-patterns.md` (18KB) with user installs.

- The gotchas doc is now correctly classified as a developer reference rather than runtime documentation. Tool description "See docs/..." tail references and the equivalent reference in `spiffy-active-commerce-surface` skill have been removed. The substantive content stays inline in tool descriptions where the LLM actually sees it. JSDoc references in source files are preserved because they are developer-facing and do not bundle into the runtime.

### Internal

- Files moved into `./plugin/` via `git mv` to preserve history. Old `mcp/dist/` deleted (the build now writes to the new location).

- `.gitignore` updated to point its build-artifact rules at `plugin/mcp/dist/` rather than `mcp/dist/`.

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

[Unreleased]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.2.4
[0.2.2]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.2.2
[0.2.1]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.2.1
[0.2.0]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.2.0
[0.1.0]: https://github.com/Institute-of-Digital-Dentistry/spiffy-plugin/releases/tag/v0.1.0

