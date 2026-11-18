# NEXT SESSION - Spiffy plugin 0.4.0 (r87 Promotions) awaits review, a live create test and release

Updated 2026-11-19 by the session that brought the plugin up to Spiffy release r87. The work is on branch `feat/r87-promotions` with a PR open against main. Nothing is merged, tagged or published.

## Previous handoff

The 2026-08-22 version of this file (git history, commit 3d144a1) covered the v0.3.0 release, the expired publish token and the Academy auto-login portal. Both of those open items still stand and are carried below.

## Goal

Ship 0.4.0: the plugin's promo tools and `/spiffy-promo` match Spiffy r87 (17 November 2026), so a customer coupon is scoped to the product behind the checkout, needs no dashboard step, and is checked with `promo_check` before the customer gets it.

## State

State verified as of 2026-11-19, working from ~/code/spiffy on `feat/r87-promotions`.

**Done, in the PR:**

- `promo_create` takes the r87 fields (`name`, `mode`, `application`, `scope_targets`, `starts_at`, `code_prefix`, `issue_expiry_days`, `is_locked_to_recipient`).

- New tools: `promo_update` (partial PUT, `null` clears, `detach`), `promo_code_list`, `promo_code_get`, `customer_promo_codes`, `promo_code_issue`, `promo_code_revoke`, `promo_code_reissue`, `promo_check`, `checkout_get`. Every write keeps the `confirmed_by_user` gate and the audit log. `promo_check` is a read through `client.postRead`, so it runs under dry-run.

- `/spiffy-promo` reads the checkout's line items with `checkout_get`. Every paid line has a product: products scope, no dashboard step, `?c=CODE` link. A paid line with no product: the old checkout-driven path with dashboard steps. It runs `promo_check` before calling the message ready.

- Two bugs fixed in `/spiffy-promo`: generated codes were `JANE-MAY26-A7KQ`, which Spiffy now refuses (letters and digits only), and `--amount 50` was sent as 50 cents. Codes are now `JANENOV26A7KQ` and amounts are multiplied by 100.

- Spiffy error `details` now ride in the error message, so `PROMO_FOREIGN_TARGET` and `PROMO_HAS_ATTACHMENTS` reach the caller.

- `spiffy-openapi.json` refreshed (121 paths, 166 operations). Gotchas doc Part 10 added. README, CHANGELOG and both version files at 0.4.0.

**Verified:** 94 unit tests across 14 files, typecheck clean, `npm run build` clean, `claude plugin validate plugin --strict` passes. Live smoke 15/15 PASS on account 1008 with read calls and `/v2/promos/check` only. The built server lists 51 tools over stdio, including every new one. The `promo_update` schema accepts `null`.

**Not verified:** no promo was created through the new code. The end-to-end products path of `/spiffy-promo` (create, check, open the `?c=` link logged out) has not run live, because creating a test promo needs Julian's go.

**Not installed:** the plugin is not installed on Julian's machine right now.

## Decisions (this session)

- Kept `checkout_list` on `/v1/checkouts`. `/v2/checkouts` is now documented, but it lists active checkouts only by default and its `search` does not cover `url_slug`. Added `checkout_get` on `/v2/checkouts/{id}` instead, because its `items[].product_id` is exactly the signal `/spiffy-promo` needs.

- Product scope in `/spiffy-promo` is at the `product` grain, one target per distinct product on the paid lines. The 2026-11-18 test used the `product_option_price` grain; both work.

- Dropped the product sweep idea (scan every product's `checkouts[]`) in favour of `checkout_get`, which is one call.

- No new flags beyond `--checkout ID`. Scheduled starts and unique codes are available as tools but are not in `/spiffy-promo`, which stays a one-customer coupon command.

## Tried and failed

- `GET /v2/checkouts?search=<url_slug>` finds nothing. Search covers `internal_name` and `offer_name` only.

- `POST /v2/promos/check` answers flat (`{promo, promo_code, checks}`), not in a `data` wrapper. The first smoke version read `data.checks` and failed.

## Recipes and footguns

- Everything from the previous handoff still applies (bare 64-character hex Bearer key from ~/.config/spiffy-plugin/config.toml, never shell-source .env).

- One-off live reads from a scratch script: name it `.mts` (tsx rejects top-level await in `.ts` outside the package) and import from `~/code/spiffy/mcp/src/...` by absolute path.

- Amount offsets are cents everywhere, promos included.

- A `products` promo never auto-applies. The buyer needs `?c=CODE` or a typed code.

## Open work, ranked

1. **Julian: review the PR.** Release needs your go.

2. **Julian's go for one live create test** before tagging. Suggested: on account 1008, `/spiffy-promo` for Julian's own customer record on the 3Shape TRIOS Design Studio checkout (35208, product 9481), `--amount 1 --uses 1 --expires 1d`. Expect the products path, `promo_check` all pass, and the logged-out checkout at `?c=CODE` showing $1 off. Then expire it with `promo_update` sending only `expire_at`. Also run the fallback once against checkout 21860 (paid line has no product) and stop at the confirmation summary.

3. **Julian: regenerate the publish token** before the release. The `SPIFFY_PLUGIN_PUBLISH_TOKEN` secret in spiffy-dev (Settings, Secrets and variables, Actions) expired before v0.3.0. It needs contents write on `juliandickie/spiffy-plugin`. A fine-grained PAT with a long expiry, or a GitHub App, stops this recurring. Without it the release must be published by hand (the v0.3.0 recipe is in the workflow file).

4. After merge and Julian's go: tag `v0.4.0` on main, confirm the Action publishes to `spiffy-plugin`, then install or update the plugin locally and restart Claude Code.

5. Academy auto-login portal (carried from 0.3.0, downstream WordPress work). The plugin side is shipped.

6. Optional: an ActiveCampaign route for unique codes. Spiffy never emails an issued code; it fires `promo:code_issued`. Nothing is built.

7. Optional: refresh the spiffy catalog descriptions in the marketplace repos to mention promotions, analytics and magic links.

## Questions Julian needs to answer

- Go for the live create test in item 2?

- Publish token replacement: fine-grained PAT or GitHub App?
