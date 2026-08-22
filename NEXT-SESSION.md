# NEXT SESSION - Spiffy plugin r85 catch-up (analytics, reports, magic links)

Staged 2026-08-21 from a session that did NOT touch this repo (it closed the iDD Academy WP 7.1 outage). This file packages the r85 gap assessment done earlier on 2026-08-21 so a fresh session can execute without re-research.

## Previous handoff

None in this repo. Prior context lives in docs/spiffy-api-gotchas-and-patterns.md and the memory note "Spiffy r85 gap assessment".

## Goal

Bring the spiffy plugin (v0.2.4) up to Spiffy release r85 (19 Aug 2026) - add the v2 analytics and reports surfaces plus magic-link customer login as MCP tools and skills, so reports match dashboard numbers instead of client-side computation over raw lists.

## State

State verified as of 2026-08-21 (session 6bf17891, working from ~/code): repo clean, main = c93ebf6 (merge of PR #18), in sync with origin/main, no branches in flight, no other session's WIP. Plugin version 0.2.4. Nothing is deploy-pending.

## What the assessment established (2026-08-21, verified against live API)

- spiffy-openapi.json (100 paths) has NONE of: `/v2/analytics/query`, `/v2/analytics/capabilities`, the `/v2/reports` group (types, saved reports, async runs, results, CSV exports). No MCP tools for any of them.
- AUTH VERIFIED LIVE: the existing `sk_` Bearer key from `~/.config/spiffy-plugin/config.toml` authenticates against `/v2/analytics/capabilities` (returned 13 metrics, 7 dimensions). No OAuth work needed.
- Magic-link endpoints (`/v1/customers/login` etc.) ARE in the current spec but were never wrapped as tools.
- Six server-side report types: product_sales, affiliate_performance, attribution_performance (new in r85), checkout_performance, payment_plan_performance, customer_cohort_ltv. Results arrive as positional arrays (token-efficient) - parse accordingly.
- Cost model per docs: every analytics query, report-run trigger, poll, page fetch, and export-URL creation costs one monthly API call; the CSV download itself is free. Per standing feedback, VERIFY these against the API reference annotations before writing them into tool descriptions.

## Open work, ranked

1. Refresh spiffy-openapi.json from upstream (developers.spiffy.co) FIRST - do not hand-author paths.
2. Add analytics tools: `/v2/analytics/capabilities`, `/v2/analytics/query`.
3. Add the `/v2/reports` group: list types, saved reports, trigger async run, poll, fetch results, CSV export URL.
4. Wrap magic-link endpoints (`/v1/customers/login` etc.) as tools - needed later for the Academy auto-login portal.
5. Surface the API-call cost model in tool descriptions (verified wording only).
6. Tests + `claude plugin validate --strict` + version bump (0.2.4 -> 0.3.0 looks right; sibling repos stripe-plugin and rocket-net-plugin set the conventions).
7. OUT OF SCOPE here but downstream: the Academy auto-login portal page (token call must be server-side in WP, never expose the API key in the browser; SpiffyJS snippet in header, Academy domain in Trusted Domains, WP email must match Spiffy customer email, tokenless embed as fallback).

## Recipes and footguns

- API base api.spiffy.co, bare `sk_` Bearer key from `~/.config/spiffy-plugin/config.toml` (chmod 600, never commit).
- Read docs/spiffy-api-gotchas-and-patterns.md before touching request/response handling (modifier_items nesting, rollback detection).
- Never shell-source .env-style files; parse with Python.
- Report results are positional arrays keyed by a columns list - build the join on returned ids, never on echoed text.

## Questions for Julian

- Ship analytics/reports as new skills too (spiffy-analytics-report style), or tools only in this pass?
- 0.3.0 acceptable as the version, or keep 0.2.x?
