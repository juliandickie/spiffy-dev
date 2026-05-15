# Lean Public Repo Split - Design Spec

Status - approved design, ready for implementation planning. Date 2026-05-16.

## Problem

`juliandickie/spiffy-plugin` is a public monorepo (~1934 KB tracked). Its root holds development scaffolding - `mcp/` TypeScript source, `docs/`, a 585 KB OpenAPI spec, tests, build tooling - alongside a `plugin/` subdirectory that is the actual shippable Claude Code plugin. A human browsing the GitHub repo sees a busy monorepo and cannot tell at a glance that the installable plugin is just `plugin/`.

The goal is a lean, clean public install face, with development scaffolding kept out of it, while the source stays publicly version controlled and end-user install size does not regress.

## Verified facts that shaped this design

These were confirmed during brainstorming, not assumed.

- **git-subdir is a sparse clone.** Per the Claude Code marketplace docs (code.claude.com/docs/en/plugin-marketplaces.md), a `git-subdir` source fetches only the named subdirectory. The outfit catalog's current spiffy entry already uses `git-subdir` with `path: "plugin"`, so end users already download only `plugin/`. The ~950 KB of dev scaffolding never reaches an install today.

- **A bare-URL source clones the whole repo.** So a naive in-place flatten (move `plugin/` to root, switch the catalog to bare-URL) would regress install size by dragging the full monorepo. A true split avoids this - if dev scaffolding leaves the public repo entirely, the public repo is small and a bare-URL clone of it is cheap.

- **The build couples source to dist by relative path.** `mcp/package.json` runs `esbuild src/index.ts --outfile=../plugin/mcp/dist/index.js`. The bundle is committed (via a `.gitignore` allowlist) so it ships. Because the dev repo remains the intact monorepo, this path does NOT need rework.

- **The pre-push hook is a local speed-bump.** `.githooks/pre-push` blocks direct pushes to `main`/`master` only. It does not block tag pushes, so a release-tag-triggered Action is unaffected.

- **The source is already public** on `juliandickie/spiffy-plugin/main`. The user reconfirmed it stays public after weighing an IP-vs-trust tradeoff.

## Decisions locked

- Topology - two public repos (approach A).

- Dev repo visibility - public.

- Dev repo name - `juliandickie/spiffy-dev`.

- Lean repo history - fresh single seed commit. Provenance lives in `spiffy-dev`.

- Publish automation - GitHub Action triggered on a release tag in `spiffy-dev`.

- Outfit catalog source - bare-URL string, unpinned, consistent with the other four catalog entries.

- In-flight `chore/rename-self-marketplace` branch - deleted, not merged. Its rename and attribution intent is recreated fresh in the lean repo's `marketplace.json`.

- The local `/Users/juliandickie/code/spiffy/CLAUDE.md` - updated to post-restructure reality, then committed into `spiffy-dev` as a migration step. Not committed verbatim while stale.

## Section 1 - End-state topology

Two public repos under the `juliandickie` account.

**`juliandickie/spiffy-dev`** (the existing repo, renamed)

- Literally the current `juliandickie/spiffy-plugin` repo, renamed via GitHub. Preserves all 52 commits, 4 releases (v0.1.0 to v0.2.2), and full history. GitHub auto-redirects the old name until the lean repo reclaims it.

- Contents unchanged - `mcp/` source, `docs/`, `spiffy-openapi.json`, tests, build tooling, and the `plugin/` subtree.

- This is where all development happens. It is not a marketplace and is never added via `/plugin marketplace add`.

**`juliandickie/spiffy-plugin`** (new, fresh, lean)

- Brand-new repo, fresh git init, single seed commit. No monorepo history dragged in, which guarantees lean clones regardless of how Claude Code clones a bare-URL source.

- Contents - the current `plugin/` subtree promoted to root - `.claude-plugin/plugin.json`, `skills/`, `commands/`, `mcp/dist/index.js`, icons, `.mcp.json`.

- Plus a root `.claude-plugin/marketplace.json` (the standalone self-marketplace - name `spiffy`, owner Julian Dickie / github.com/juliandickie, plugin source = repo root) and a README.

- This is the public browse face and the install source.

## Section 2 - Migration and cutover sequence

Ordered to avoid any window where a consumer breaks. The outfit catalog is local-only and unpushed, so it imposes no live timing pressure. The spiffy-dev content mutations are bundled into a single migration PR because the repo enforces a PR-based workflow on `main` via the pre-push hook - this respects the repo's own convention rather than fighting it.

1. **Migration PR against the existing repo's `main`.** One feature branch carrying two changes - (a) the updated dev-context CLAUDE.md, and (b) deletion of the vestigial root `.claude-plugin/marketplace.json`. Open and merge it via `gh pr create --base main` per the repo's workflow.

   - CLAUDE.md - rewrite `/Users/juliandickie/code/spiffy/CLAUDE.md` to post-restructure reality - this is `spiffy-dev`, the monorepo; the lean plugin lives at `juliandickie/spiffy-plugin`; document the build and publish Action flow; retain the still-valid don't-flatten guardrail (still true - the repo remains the `mcp/` + `plugin/` monorepo and flattening would still break the esbuild path), the positioning note, and the formatting rules.

   - marketplace.json - delete the root `.claude-plugin/marketplace.json`. The dev repo is not a marketplace. This also retires the `idd-plugins` collision permanently.

2. **Delete the in-flight branch.** Remove `chore/rename-self-marketplace` local and remote. It was never PR'd. Its rename and attribution intent is recreated fresh in the lean repo (step 5), so nothing is lost.

3. **Rename the existing repo** `juliandickie/spiffy-plugin` to `juliandickie/spiffy-dev` on GitHub. History, releases, branches preserved. GitHub now redirects the old name.

4. **Repoint the local clone remote** at `/Users/juliandickie/code/spiffy` to `https://github.com/juliandickie/spiffy-dev.git`. This must happen before step 5, otherwise a later pull there would silently fetch the new lean repo. Safety-critical ordering.

5. **Create the fresh `juliandickie/spiffy-plugin`** lean repo. Seed it with one commit containing the current `plugin/` subtree contents promoted to root, plus a fresh root `marketplace.json` (name `spiffy`, owner Julian Dickie, plugin source = repo root) and a README. This reclaims the `spiffy-plugin` name from the redirect.

6. **Repoint the outfit catalog** spiffy entry (Section 4).

## Section 3 - Build and publish flow

**Build (unchanged).** In `spiffy-dev`, `npm run build` compiles `mcp/src` to `plugin/mcp/dist/index.js` exactly as today. No path rework. The esbuild relative path is fine because `spiffy-dev` is the intact monorepo.

**Publish (new).** A GitHub Action in `spiffy-dev`, triggered when a version tag is pushed. The Action -

- Runs `npm ci && npm run build` from `mcp/` so the published bundle always matches the tagged source. It never trusts the committed `plugin/mcp/dist/index.js`.

- Copies the built `plugin/` subtree contents to the root of `juliandickie/spiffy-plugin`.

- Commits and pushes that to the lean repo as one commit, message `Release v<version>`.

- Keeps the lean repo's `marketplace.json` `metadata.version` matched to `plugin/.claude-plugin/plugin.json` version, which is the source of truth.

**History model.** The initial seed (Section 2 step 5) is one clean commit. Ongoing, each publish is one normal commit on the lean repo, so it accumulates a tidy one-commit-per-release history while `spiffy-dev` keeps the granular dev history. Standard release-repo pattern.

**Auth.** The Action needs push access to the lean repo. Use a fine-grained Personal Access Token scoped to only `juliandickie/spiffy-plugin`, `contents: write`, nothing else, stored as a `spiffy-dev` Actions secret. This token setup is a manual user step (token creation cannot and should not be automated).

**Hooks.** `spiffy-dev` keeps its PR-workflow pre-push hook. The release-tag trigger is unaffected (the hook gates branch pushes to `main`, not tag pushes). The lean `spiffy-plugin` repo gets no pre-push hook - it is a publish target.

## Section 4 - Outfit catalog change

The outfit catalog's spiffy entry (currently local-only commit in `/Users/juliandickie/code/plugins`, unpushed) changes from the git-subdir object form to a bare-URL string -

```json
{
  "name": "spiffy",
  "source": "https://github.com/juliandickie/spiffy-plugin",
  "description": "Talk to the Spiffy checkout platform from Claude Code. Customer lookup, MRR and affiliate and churn reports, customer notes, and one-off promo code generation. Works with any Spiffy account, just supply your own API key.",
  "author": { "name": "Julian Dickie", "url": "https://github.com/juliandickie" },
  "homepage": "https://github.com/juliandickie/spiffy-plugin",
  "repository": "https://github.com/juliandickie/spiffy-plugin",
  "license": "MIT",
  "category": "marketing-automation",
  "keywords": ["spiffy", "checkout", "commerce", "crm", "customer-lookup", "reports", "mrr", "affiliate", "promo-codes", "mcp"]
}
```

- No install regression - the lean repo is small (fresh single-commit history, just the plugin), so a bare-URL full clone is cheap. The regression risk only existed when bare-URL meant cloning the monorepo.

- Catalog uniformity - all five outfit entries become consistent bare-URL repo-root plugins. The git-subdir special case is gone.

- Both discovery paths work - the lean repo also carries its own `marketplace.json`, so `/plugin marketplace add juliandickie/spiffy-plugin` works standalone alongside the outfit catalog path.

- Unpinned, matching the other four entries. Pinning to release tags is more reproducible but would make spiffy inconsistent with the established catalog pattern - not worth it for a five-plugin personal catalog.

## Section 5 - Risks, edge cases, rollback

**Safety backbone.** Nothing here is destructive or irreversible. No history rewrite, no force-push, no deletion of the source-bearing repo. The existing repo survives intact as `spiffy-dev` (rename is reversible, full history and releases preserved). Before lean-repo creation the whole thing is trivially reversible (rename back, restore the marketplace.json). After creation, the lean repo can be deleted and `spiffy-dev` renamed back; the outfit catalog edit is local and unpushed so trivially revertible.

**Critical ordering - the rename window.** The local clone remote MUST be repointed to `spiffy-dev` (step 4) before the new lean `spiffy-plugin` is created (step 5). Otherwise a later `git pull` in `/Users/juliandickie/code/spiffy` would silently pull the lean repo instead of the dev monorepo.

**Releases.** The 4 existing releases stay on `spiffy-dev` after rename. The fresh lean repo starts with none. Marketplace install does not require releases (it clones the ref), but cut a single `v0.2.2` release on the lean repo for tidiness and parity.

**Action token - main ongoing security surface.** A leaked broad token means someone can push to the public plugin. Mitigation - fine-grained PAT, single-repo scope, `contents: write` only, stored as a `spiffy-dev` Actions secret. Rotate if exposed.

**Action always rebuilds.** `npm ci && npm run build` from source on every release. The published bundle always matches tagged source. Non-blocking follow-up - post-cutover the committed `plugin/mcp/dist/index.js` in `spiffy-dev` could be gitignored since the Action regenerates it; leaving it committed is harmless provenance.

**Forks and clones.** Low likelihood (public window was short). Any fork follows the rename to `spiffy-dev`. Anyone with the old git remote who pulls after the new lean repo exists gets the lean repo - acceptable, and the reason step 4 ordering exists for the one clone that matters.

## Out of scope

- Making the source private (explicitly reconfirmed public).

- Pinning catalog entries to release tags or SHAs.

- Pushing the outfit catalog or creating `juliandickie/outfit` (separate deferred user decision, unaffected by this work).

- Any change to the four other outfit plugins.

## Success criteria

- `github.com/juliandickie/spiffy-dev` exists with full history and releases, is the development home, carries no `marketplace.json`, and has an accurate committed CLAUDE.md.

- `github.com/juliandickie/spiffy-plugin` exists fresh and lean - plugin at root, one seed commit, a `spiffy` self-marketplace, a README, a `v0.2.2` release.

- `/plugin marketplace add juliandickie/spiffy-plugin` then `/plugin install spiffy` installs v0.2.2 standalone.

- A version tag pushed in `spiffy-dev` triggers the Action, which builds from source and publishes the lean plugin to `spiffy-plugin` as a single `Release v<version>` commit.

- The outfit catalog spiffy entry is a bare-URL string consistent with the other four, resolving to the lean repo.

- The `chore/rename-self-marketplace` branch no longer exists. The `idd-plugins` collision is permanently retired.
