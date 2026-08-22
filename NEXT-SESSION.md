# NEXT SESSION - Spiffy plugin post-0.3.0 (release decision, then portal groundwork)

Updated 2026-08-22 by the session that executed the r85 catch-up. The r85 work described in the previous version of this file is DONE and merged; this file now covers what remains.

## Previous handoff

The 2026-08-21 version of this file (git history, commit 6cc9861) staged the r85 gap work. It was executed and landed by PR (see State).

## Goal

The r85 catch-up itself is complete. What remains is (1) Julian's release decision for v0.3.0 and (2) the downstream Academy auto-login portal, which was explicitly out of scope for the plugin work.

## State

State verified as of 2026-08-22 (session bbd4dc34, working from ~/code/spiffy): the r85 feature branch was merged to main via PR and deleted; see the PR link in the merge commit for review context. Plugin version 0.3.0 in plugin/.claude-plugin/plugin.json, CHANGELOG has the full 0.3.0 entry. 80 unit tests across 13 files, typecheck clean, `claude plugin validate plugin --strict` passes, live smoke 12 PASS + 1 expected INFO against account 1008.

**NOT TAGGED. v0.3.0 is release-ready but unpublished.** Pushing tag `v0.3.0` triggers `.github/workflows/publish-plugin.yml`, which publishes the payload to the public `juliandickie/spiffy-plugin` repo, a user-facing release. That is Julian's call, not a session-close step. To release: `git tag v0.3.0 && git push origin v0.3.0` on main, then verify the Action run and the spiffy-plugin repo picked it up, then `/plugin marketplace update` + reinstall locally to verify the installed cache.

## What shipped in 0.3.0 (all merged)

- spiffy-openapi.json refreshed from `https://api.spiffy.co/openapi.json` (110 paths, 154 operations; recipe now in CLAUDE.md).

- Analytics tools (analytics_capabilities, analytics_query), reports tools (the full /v2/reports surface, 11 tools), magic-link login tools (3, confirmation-gated + audited), events_list (r85 activity log, an addition beyond the staged ranked list, flagged in the PR).

- New client.postRead (dry-run-exempt POST for the pure-read analytics query). New /spiffy-report and /spiffy-login-link commands. New spiffy-analytics-report skill; the four client-side report skills now lead with prefer-server-side sections.

- docs/spiffy-api-gotchas-and-patterns.md Part 9 (spec location, /v2/checkouts discovery, analytics envelope and cents, verified quota wording, magic-link semantics, postRead rationale).

## Decisions (this session)

- Skills shipped alongside tools (the staged goal line said "tools and skills"; the open question in the prior handoff was resolved in favour of shipping one new skill plus four skill updates).

- Version 0.3.0 (prior handoff said "0.3.0 looks right").

- report_create/update/delete are confirmation-gated (saved reports can email recipients on a schedule); run/poll/results/export are ungated but dry-run-blocked. Magic links gated + audited (credential issuance).

- checkout_list stays on /v1/checkouts. /v2/checkouts now exists live (discovered by the smoke INFO) but is undocumented and returns total_count=33 vs v1's 103 on the same account; subset semantics unknown. See gotcha 9.2 before touching this.

## Tried and failed

- developers.spiffy.co serves no OpenAPI file at any obvious URL (all 404). The spec lives at api.spiffy.co/openapi.json.

- The spec's own endpoint descriptions are the only quota-cost annotations; there are no x-cost extensions. Analytics query and results-page fetches carry NO stated per-call cost, so tool descriptions do not claim one.

## Recipes and footguns

- Everything from the previous handoff still applies (bare sk_ Bearer key from ~/.config/spiffy-plugin/config.toml, never shell-source .env, positional report results joined on ids).

- Smoke now costs one real quota call per run (the live analytics query that proves the postRead dry-run exemption).

- The smoke's "Gotcha 1.2 /v2/checkouts still 404" check reports INFO now, permanently, until 9.2 is resolved. That INFO is expected; do not "fix" it.

- Analytics currency values are cents. Analytics dates UTC-only; reports bucket in the report's own timezone.

## Open work, ranked

1. Julian: release decision on v0.3.0 (tag push publishes; see State).

2. After release: verify the installed plugin cache actually updates (the stripe-plugin hardening session found installed caches lag releases).

3. Academy auto-login portal (downstream, WordPress side): token call server-side in WP only, never expose the API key in the browser; SpiffyJS snippet in header; Academy domain in Spiffy Trusted Domains; WP email must match Spiffy customer email; tokenless embed as fallback. The plugin side (customer_magic_link tools) is ready.

4. Optional: ask Spiffy to document /v2/checkouts (gotcha 9.2) and consider migrating checkout_list if they confirm the contract and the count semantics.

5. Optional: upstream docs feedback per Part 4 of the gotchas doc still stands.

## Questions Julian needs to answer

- Ship v0.3.0 now, or hold for anything else in the same release?

- For the Academy portal: which WP plugin or theme location should own the server-side token call (rocket-net-plugin territory, wp-manager, or a standalone snippet)?
