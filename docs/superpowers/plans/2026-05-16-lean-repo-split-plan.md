# Lean Public Repo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `juliandickie/spiffy-plugin` monorepo into a renamed dev repo (`juliandickie/spiffy-dev`, full history) and a fresh lean public install repo (`juliandickie/spiffy-plugin`), wired together by a release-tag GitHub Action, with the outfit catalog repointed and zero install-size regression.

**Architecture:** The existing repo is renamed to `spiffy-dev` (preserves history, non-destructive). A new lean `spiffy-plugin` repo is seeded from the `plugin/` subtree with one clean commit. A GitHub Action in `spiffy-dev` rebuilds from source on every `v*` tag and publishes the payload to the lean repo. The outfit catalog's spiffy entry flips from a `git-subdir` object to a bare URL string.

**Tech Stack:** git, GitHub (gh CLI), GitHub Actions, Node 20 / esbuild build, jq, rsync, JSON marketplace manifests.

**Spec:** `/Users/juliandickie/code/spiffy/docs/superpowers/specs/2026-05-16-lean-repo-split-design.md`

## Operation classes

Every step is tagged so the executor knows the authorization boundary -

- **[LOCAL]** - local filesystem/git work, safe to do autonomously.

- **[USER GATE]** - a GitHub state change (repo rename, repo creation, visibility, PR creation, remote branch deletion). Per the owner's working rules these require explicit user authorization. The executor prepares everything, then STOPS and asks the user to authorize or perform the exact command shown.

- **[USER MANUAL]** - the user must do this in the GitHub web UI; it cannot be scripted (Personal Access Token creation, adding an Actions secret). The plan gives exact click-path instructions.

## File structure

| Path | Repo | Responsibility | Action |
|---|---|---|---|
| `CLAUDE.md` | spiffy-dev | Post-restructure dev context | Rewrite |
| `.claude-plugin/marketplace.json` | spiffy-dev | Vestigial self-marketplace | Delete |
| `.github/workflows/publish-plugin.yml` | spiffy-dev | Release-tag publish Action | Create |
| `.claude-plugin/marketplace.json` | lean spiffy-plugin | Standalone self-marketplace | Create (seed) |
| `README.md` | lean spiffy-plugin | User-facing readme | Create (seed) |
| `.gitignore` | lean spiffy-plugin | Minimal ignore | Create (seed) |
| (plugin payload) | lean spiffy-plugin | The 15 plugin files at root | Create (seed) |
| `.claude-plugin/marketplace.json` | `/Users/juliandickie/code/plugins` (outfit) | spiffy entry source | Modify |

---

## Phase 0 - Pre-flight

### Task 1: Verify starting state

**Files:** none (read-only checks)

- [ ] **Step 1 [LOCAL]: Confirm repo, branch, clean tree**

```bash
cd /Users/juliandickie/code/spiffy
git remote get-url origin
git branch --show-current
git status --porcelain
```

Expected: origin is `https://github.com/juliandickie/spiffy-plugin.git`, branch `main`, and the only untracked entry is `CLAUDE.md` (`?? CLAUDE.md`). The design spec is committed at `docs/superpowers/specs/2026-05-16-lean-repo-split-design.md`.

- [ ] **Step 2 [LOCAL]: Confirm gh auth and the branch slated for deletion exists**

```bash
gh auth status 2>&1 | grep "Logged in"
git branch -a | grep chore/rename-self-marketplace
```

Expected: logged in as `juliandickie`; the `chore/rename-self-marketplace` branch exists locally and on remote.

- [ ] **Step 3 [LOCAL]: Snapshot the plugin payload list (sanity anchor for the seed task)**

```bash
git ls-tree -r --name-only HEAD -- plugin/ | sed 's|^plugin/||'
```

Expected exactly these 15 paths: `.claude-plugin/icon-256.png`, `.claude-plugin/icon-64.png`, `.claude-plugin/icon.png`, `.claude-plugin/plugin.json`, `.mcp.json`, `commands/spiffy-note.md`, `commands/spiffy-promo.md`, `mcp/dist/index.js`, `skills/spiffy-active-commerce-surface/SKILL.md`, `skills/spiffy-affiliate-report/SKILL.md`, `skills/spiffy-checkout-snapshot/SKILL.md`, `skills/spiffy-churn-report/SKILL.md`, `skills/spiffy-mrr-snapshot/SKILL.md`, `skills/spiffy-recent-orders-check/SKILL.md`, `skills/spiffy-top-products-report/SKILL.md`.

---

## Phase 1 - Migration PR against spiffy main

This bundles the two `spiffy-dev` content mutations (updated CLAUDE.md, delete vestigial marketplace.json) into one PR, respecting the repo's enforced PR workflow.

### Task 2: Prepare the migration branch

**Files:**

- Create: `/Users/juliandickie/code/spiffy/CLAUDE.md` (tracked)

- Delete: `/Users/juliandickie/code/spiffy/.claude-plugin/marketplace.json`

- [ ] **Step 1 [LOCAL]: Create the migration branch off main**

```bash
cd /Users/juliandickie/code/spiffy
git checkout main
git checkout -b chore/lean-repo-split-migration
```

Expected: on `chore/lean-repo-split-migration`, based on `main` (`792739f`).

- [ ] **Step 2 [LOCAL]: Write the post-restructure CLAUDE.md**

Overwrite `/Users/juliandickie/code/spiffy/CLAUDE.md` with exactly:

```markdown
# Spiffy Dev - Dev Context

Context for AI agents and contributors. This is the DEVELOPMENT monorepo. The shipped plugin is published from here to a separate lean repo. Last refreshed 2026-05-16.

## What this repo is

`juliandickie/spiffy-dev` is the development monorepo for the Spiffy Claude Code plugin. It contains -

- `mcp/` - TypeScript source for the MCP server (the real source of truth)

- `plugin/` - the plugin payload that gets published (built bundle, skills, commands, manifest, icons)

- `docs/` - design specs, plans, API gotchas

- `spiffy-openapi.json` - the Spiffy API reference (140 endpoints)

- tests, build tooling, git hooks

This repo is NOT a marketplace and is never added via `/plugin marketplace add`. End users never install from here.

## Where the plugin actually ships from

The installable plugin lives at `juliandickie/spiffy-plugin` - a separate, lean, public repo containing only the plugin payload at its root. Users install via the `outfit` marketplace catalog or directly via `/plugin marketplace add juliandickie/spiffy-plugin`.

`spiffy-plugin` is generated, not hand-edited. A GitHub Action in THIS repo (`.github/workflows/publish-plugin.yml`) builds from `mcp/src` and publishes the `plugin/` payload to `spiffy-plugin` on every version tag push. Never hand-edit `spiffy-plugin` - changes there are overwritten on the next release.

## Critical - do NOT flatten this repo

The `mcp/` source and `plugin/` payload deliberately coexist. The build (`mcp/package.json`, `npm run build`) runs `esbuild src/index.ts --outfile=../plugin/mcp/dist/index.js` - a relative path that depends on this exact layout. Flattening `plugin/` into the root would collide `plugin/mcp/dist/` with the root `mcp/` source and break the build. This split is intentional (PR #8). Keep it.

## Release flow

1. Develop in `mcp/src` (and `plugin/skills`, `plugin/commands` as needed).

2. `cd mcp && npm run build` - compiles to `plugin/mcp/dist/index.js`.

3. Bump `plugin/.claude-plugin/plugin.json` version.

4. Commit via the PR workflow. The pre-push hook blocks direct main pushes - use a feature branch plus `gh pr create --base main`.

5. After merge, push a version tag `vX.Y.Z`. The publish Action builds from source and publishes the lean plugin to `spiffy-plugin` as a single `Release vX.Y.Z` commit, and cuts a matching release.

## Positioning

Spiffy is not iDD-specific tooling. It wraps the Spiffy checkout platform, which any merchant uses. The only account-specific thing is the API key supplied at runtime. Frame it as a general-purpose commerce plugin.

## Formatting rules

Apply to all docs, skill prose, commit messages, and user-facing strings -

- No em dashes or en dashes. Use ` - ` (space-hyphen-space), commas, parentheses, or split sentences.

- No colons in markdown headings. Use ` - `.

- Blank line between every list item.

- Straight quotes only. No curly quotes.

- No emojis unless explicitly requested.
```

- [ ] **Step 3 [LOCAL]: Delete the vestigial root self-marketplace**

```bash
cd /Users/juliandickie/code/spiffy
git rm .claude-plugin/marketplace.json
```

Expected: `.claude-plugin/marketplace.json` staged for deletion. (Note: `.claude-plugin/` may now be empty in the dev repo - that is fine; the dev repo is not a marketplace.)

- [ ] **Step 4 [LOCAL]: Stage CLAUDE.md and verify the diff**

```bash
cd /Users/juliandickie/code/spiffy
git add CLAUDE.md
git status --short
```

Expected: `A  CLAUDE.md` and `D  .claude-plugin/marketplace.json`. Nothing else.

- [ ] **Step 5 [LOCAL]: Commit the migration branch**

```bash
git commit -m "$(cat <<'EOF'
Migrate to dev-repo role - update CLAUDE.md, drop self-marketplace

This repo becomes juliandickie/spiffy-dev (development monorepo).
CLAUDE.md rewritten to post-restructure reality (build/publish Action
flow, do-not-flatten guardrail retained). The root self-marketplace
.claude-plugin/marketplace.json is removed - the dev repo is not a
marketplace; the standalone marketplace lives in the lean
juliandickie/spiffy-plugin repo. Retires the idd-plugins collision.
EOF
)"
```

Expected: one commit on `chore/lean-repo-split-migration`.

- [ ] **Step 6 [LOCAL]: Push the migration branch (allowed - not main)**

```bash
git push -u origin chore/lean-repo-split-migration
```

Expected: branch pushed. The pre-push hook only blocks `main`/`master`, not feature branches.

### Task 3: Open and merge the migration PR

**Files:** none (GitHub operation)

- [ ] **Step 1 [USER GATE]: Open the PR**

PR creation requires explicit user authorization. Present this command and wait for the user to authorize or run it themselves:

```bash
cd /Users/juliandickie/code/spiffy
gh pr create --base main --head chore/lean-repo-split-migration \
  --title "Migrate to dev-repo role (CLAUDE.md + drop self-marketplace)" \
  --body "Part of the lean repo split. Updates CLAUDE.md to post-restructure dev-repo context and removes the vestigial root self-marketplace. See docs/superpowers/specs/2026-05-16-lean-repo-split-design.md."
```

- [ ] **Step 2 [USER GATE]: Merge the PR** (after user review/approval on GitHub)

```bash
gh pr merge --squash --delete-branch chore/lean-repo-split-migration
```

Expected: PR merged to `main`, migration branch auto-deleted. `--delete-branch` removes both local and remote.

- [ ] **Step 3 [LOCAL]: Sync local main**

```bash
cd /Users/juliandickie/code/spiffy
git checkout main
git pull --ff-only
git log --oneline -1
```

Expected: local `main` includes the migration commit; `.claude-plugin/marketplace.json` gone; `CLAUDE.md` tracked.

---

## Phase 2 - Delete the in-flight branch

### Task 4: Remove chore/rename-self-marketplace

**Files:** none (git branch deletion)

- [ ] **Step 1 [LOCAL]: Confirm its commits are not needed**

```bash
cd /Users/juliandickie/code/spiffy
git log --oneline main..chore/rename-self-marketplace
```

Expected: shows `Add design spec...` (already cherry-picked to main), `Switch self-marketplace attribution...`, `Rename self-marketplace idd-plugins...`. The rename/attribution intent is recreated fresh in the lean repo (Phase 4), the spec is already on main - so this branch is safe to delete.

- [ ] **Step 2 [USER GATE]: Delete the remote branch**

Remote branch deletion is a GitHub state change. Present and wait for authorization:

```bash
git push origin --delete chore/rename-self-marketplace
```

- [ ] **Step 3 [LOCAL]: Delete the local branch**

```bash
git branch -D chore/rename-self-marketplace
git branch -a | grep chore/rename-self-marketplace || echo "gone (good)"
```

Expected: branch absent locally and remotely.

---

## Phase 3 - GitHub rename

### Task 5: Rename spiffy-plugin to spiffy-dev

**Files:** none (GitHub operation)

- [ ] **Step 1 [USER GATE]: Rename the repo on GitHub**

Repo rename is a GitHub state change requiring authorization. Present and wait:

```bash
gh repo rename spiffy-dev --repo juliandickie/spiffy-plugin --yes
```

Expected: repo is now `juliandickie/spiffy-dev`. GitHub auto-redirects the old `spiffy-plugin` name until a new repo reclaims it (Phase 4).

- [ ] **Step 2 [LOCAL]: Verify the rename took**

```bash
gh repo view juliandickie/spiffy-dev --json name,visibility --jq '.name + " " + .visibility'
```

Expected: `spiffy-dev PUBLIC`.

---

## Phase 4 - Repoint local remote (safety-critical ordering)

### Task 6: Update the local clone remote BEFORE creating the lean repo

**Files:** none (git remote config)

This MUST happen before Phase 5. Otherwise a later `git pull` here silently fetches the new lean repo instead of the dev monorepo.

- [ ] **Step 1 [LOCAL]: Repoint origin to spiffy-dev**

```bash
cd /Users/juliandickie/code/spiffy
git remote set-url origin https://github.com/juliandickie/spiffy-dev.git
git remote get-url origin
```

Expected: `https://github.com/juliandickie/spiffy-dev.git`.

- [ ] **Step 2 [LOCAL]: Confirm fetch works against the renamed repo**

```bash
git fetch origin
git status -sb | head -1
```

Expected: fetch succeeds; tracking `origin/main` on the renamed repo, up to date.

---

## Phase 5 - Create the fresh lean repo

### Task 7: Build and assemble the lean tree locally

**Files:**

- Create (staging): `/tmp/spiffy-lean/` working tree

- [ ] **Step 1 [LOCAL]: Rebuild the bundle from source so the seed matches source**

```bash
cd /Users/juliandickie/code/spiffy/mcp
npm ci
npm run build
git -C /Users/juliandickie/code/spiffy status --porcelain plugin/mcp/dist/index.js
```

Expected: build succeeds; `plugin/mcp/dist/index.js` present (modified or unchanged - either is fine, it is now guaranteed current).

- [ ] **Step 2 [LOCAL]: Assemble the lean working tree from the plugin payload**

```bash
rm -rf /tmp/spiffy-lean
mkdir -p /tmp/spiffy-lean
rsync -a --exclude='.git/' /Users/juliandickie/code/spiffy/plugin/ /tmp/spiffy-lean/
find /tmp/spiffy-lean -type f | sed "s|/tmp/spiffy-lean/||" | sort
```

Expected: the 15 payload files from Task 1 Step 3, now at the root of `/tmp/spiffy-lean/`.

- [ ] **Step 3 [LOCAL]: Add the lean self-marketplace manifest**

Create `/tmp/spiffy-lean/.claude-plugin/marketplace.json` with exactly:

```json
{
  "name": "spiffy",
  "owner": {
    "name": "Julian Dickie",
    "url": "https://github.com/juliandickie"
  },
  "metadata": {
    "description": "Talk to the Spiffy checkout platform from Claude Code. Works with any Spiffy account, just supply your own API key.",
    "version": "0.2.2"
  },
  "plugins": [
    {
      "name": "spiffy",
      "source": ".",
      "description": "Talk to the Spiffy checkout platform from Claude Code. Customer lookup, MRR and affiliate and churn reports, customer notes, and one-off promo code generation. Works with any Spiffy account, just supply your own API key.",
      "author": {
        "name": "Julian Dickie",
        "url": "https://github.com/juliandickie"
      },
      "homepage": "https://github.com/juliandickie/spiffy-plugin",
      "repository": "https://github.com/juliandickie/spiffy-plugin",
      "license": "MIT",
      "category": "marketing-automation",
      "keywords": ["spiffy", "checkout", "commerce", "crm", "customer-lookup", "reports", "mrr", "affiliate", "promo-codes", "mcp"]
    }
  ]
}
```

- [ ] **Step 4 [LOCAL]: Add the lean README**

Create `/tmp/spiffy-lean/README.md` with exactly:

```markdown
# Spiffy for Claude Code

Talk to the Spiffy checkout platform from Claude Code. Customer lookup, MRR / affiliate / churn reports, customer notes, and one-off promo code generation. Works with any Spiffy account - supply your own API key.

## Install

```
/plugin marketplace add juliandickie/spiffy-plugin
/plugin install spiffy
```

Or via the outfit catalog -

```
/plugin marketplace add juliandickie/outfit
/plugin install spiffy
```

## Configure

Set your Spiffy API key. Three options -

1. `SPIFFY_API_KEY` env var (a literal 64-char hex key, or a 1Password `op://` reference)

2. `~/.config/spiffy-plugin/config.toml` with `api_key = "..."`

3. A repo-root `.env` with `SPIFFY_API_KEY=...`

Get your key from the Spiffy dashboard under Settings - API.

## Source and development

This is the lean published plugin - generated, not hand-edited. Development happens at [juliandickie/spiffy-dev](https://github.com/juliandickie/spiffy-dev) (full source, build tooling, history). File issues there.

## License

MIT.
```

- [ ] **Step 5 [LOCAL]: Add a minimal .gitignore**

Create `/tmp/spiffy-lean/.gitignore` with exactly:

```
.DS_Store
.env
.env.local
audit.log
```

- [ ] **Step 6 [LOCAL]: Validate manifests parse and the runtime bundle is present**

```bash
python3 -m json.tool /tmp/spiffy-lean/.claude-plugin/marketplace.json > /dev/null && echo "marketplace.json OK"
python3 -m json.tool /tmp/spiffy-lean/.claude-plugin/plugin.json > /dev/null && echo "plugin.json OK"
test -s /tmp/spiffy-lean/mcp/dist/index.js && echo "bundle present ($(wc -c < /tmp/spiffy-lean/mcp/dist/index.js) bytes)"
jq -r '.version' /tmp/spiffy-lean/.claude-plugin/plugin.json
```

Expected: both JSON OK, bundle present and non-empty, version `0.2.2`.

### Task 8: Create the lean repo on GitHub and push the seed

**Files:** none (GitHub operation + git init)

- [ ] **Step 1 [LOCAL]: Initialize the lean git repo with one seed commit**

```bash
cd /tmp/spiffy-lean
git init -b main
git add -A
git -c commit.gpgsign=false commit -m "Initial public release v0.2.2

Lean published Spiffy plugin. Generated from juliandickie/spiffy-dev
(full source, build tooling, history). Do not hand-edit - releases
are published automatically from spiffy-dev on version tags."
git log --oneline
```

Expected: exactly one commit on `main`.

- [ ] **Step 2 [USER GATE]: Create the public lean repo on GitHub**

Repo creation + visibility require explicit authorization. Present and wait:

```bash
gh repo create juliandickie/spiffy-plugin --public \
  --description "Spiffy for Claude Code - talk to the Spiffy checkout platform. Lean published plugin; dev at juliandickie/spiffy-dev." \
  --source /tmp/spiffy-lean --remote origin --push
```

Expected: `juliandickie/spiffy-plugin` created public, seed commit pushed to `main`. This reclaims the `spiffy-plugin` name from the rename redirect.

- [ ] **Step 3 [LOCAL]: Verify the lean repo anonymously resolves**

```bash
gh repo view juliandickie/spiffy-plugin --json name,visibility,defaultBranchRef --jq '.name + " " + .visibility'
curl -s -o /dev/null -w "raw plugin.json -> HTTP %{http_code}\n" https://raw.githubusercontent.com/juliandickie/spiffy-plugin/main/.claude-plugin/plugin.json
```

Expected: `spiffy-plugin PUBLIC`; raw plugin.json HTTP 200.

- [ ] **Step 4 [USER GATE]: Cut the v0.2.2 release on the lean repo**

```bash
gh release create v0.2.2 --repo juliandickie/spiffy-plugin \
  --title "Spiffy v0.2.2" \
  --notes "Initial release of the lean published Spiffy plugin. Built from juliandickie/spiffy-dev."
```

Expected: release `v0.2.2` visible on the lean repo.

---

## Phase 6 - Publish Action

### Task 9: Add the publish workflow to spiffy-dev

**Files:**

- Create: `/Users/juliandickie/code/spiffy/.github/workflows/publish-plugin.yml`

- [ ] **Step 1 [LOCAL]: Create a workflow branch off main**

```bash
cd /Users/juliandickie/code/spiffy
git checkout main && git pull --ff-only
git checkout -b chore/publish-action
mkdir -p .github/workflows
```

- [ ] **Step 2 [LOCAL]: Write the workflow file**

Create `/Users/juliandickie/code/spiffy/.github/workflows/publish-plugin.yml` with exactly:

```yaml
name: Publish plugin to spiffy-plugin

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout spiffy-dev
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build MCP bundle from source
        run: |
          cd mcp
          npm ci
          npm run build

      - name: Read plugin version
        id: ver
        run: echo "version=$(jq -r .version plugin/.claude-plugin/plugin.json)" >> "$GITHUB_OUTPUT"

      - name: Clone lean spiffy-plugin repo
        env:
          GH_TOKEN: ${{ secrets.SPIFFY_PLUGIN_PUBLISH_TOKEN }}
        run: git clone "https://x-access-token:${GH_TOKEN}@github.com/juliandickie/spiffy-plugin.git" lean

      - name: Sync plugin payload into lean repo
        run: |
          rsync -a --delete \
            --exclude='.git/' \
            --exclude='README.md' \
            --exclude='.gitignore' \
            --exclude='.claude-plugin/marketplace.json' \
            plugin/ lean/
          tmp=$(mktemp)
          jq --arg v "${{ steps.ver.outputs.version }}" '.metadata.version = $v' \
            lean/.claude-plugin/marketplace.json > "$tmp"
          mv "$tmp" lean/.claude-plugin/marketplace.json

      - name: Commit and push to lean repo
        run: |
          cd lean
          git config user.name "spiffy-dev publisher"
          git config user.email "noreply@github.com"
          git add -A
          if git diff --cached --quiet; then
            echo "No changes to publish"
            exit 0
          fi
          git commit -m "Release v${{ steps.ver.outputs.version }}"
          git push origin main

      - name: Create release on lean repo
        env:
          GH_TOKEN: ${{ secrets.SPIFFY_PLUGIN_PUBLISH_TOKEN }}
        run: |
          gh release create "v${{ steps.ver.outputs.version }}" \
            --repo juliandickie/spiffy-plugin \
            --title "Spiffy v${{ steps.ver.outputs.version }}" \
            --notes "Automated release from spiffy-dev tag v${{ steps.ver.outputs.version }}." \
            || echo "Release v${{ steps.ver.outputs.version }} already exists - skipping"
```

- [ ] **Step 3 [LOCAL]: Lint the YAML parses**

```bash
cd /Users/juliandickie/code/spiffy
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/publish-plugin.yml')); print('YAML OK')"
```

Expected: `YAML OK`. (If `yaml` module missing, run `python3 -m pip install --user pyyaml` first, or skip - GitHub will validate on push.)

- [ ] **Step 4 [LOCAL]: Commit and push the workflow branch**

```bash
git add .github/workflows/publish-plugin.yml
git commit -m "Add release-tag publish Action (builds from source, pushes lean plugin)"
git push -u origin chore/publish-action
```

- [ ] **Step 5 [USER GATE]: Open and merge the workflow PR**

```bash
gh pr create --base main --head chore/publish-action \
  --title "Add publish-plugin GitHub Action" \
  --body "Release-tag triggered. Rebuilds from mcp/src and publishes the plugin payload to juliandickie/spiffy-plugin. Requires the SPIFFY_PLUGIN_PUBLISH_TOKEN secret (Task 10)."
# After user review:
gh pr merge --squash --delete-branch chore/publish-action
```

### Task 10: Provision the publish token

**Files:** none ([USER MANUAL] - GitHub web UI only)

- [ ] **Step 1 [USER MANUAL]: Create a fine-grained PAT**

The user performs this in the browser (token creation cannot be scripted):

1. Go to https://github.com/settings/tokens?type=beta -> "Generate new token".

2. Token name - `spiffy-dev publish to spiffy-plugin`.

3. Resource owner - `juliandickie`.

4. Expiration - choose (recommend 1 year, set a calendar reminder to rotate).

5. Repository access - "Only select repositories" -> select ONLY `juliandickie/spiffy-plugin`.

6. Permissions -> Repository permissions -> Contents -> Read and write. Leave everything else at no access.

7. Generate, copy the token value once.

- [ ] **Step 2 [USER MANUAL]: Add it as an Actions secret on spiffy-dev**

1. Go to https://github.com/juliandickie/spiffy-dev/settings/secrets/actions -> "New repository secret".

2. Name - `SPIFFY_PLUGIN_PUBLISH_TOKEN` (must match the workflow exactly).

3. Value - paste the PAT. Add secret.

- [ ] **Step 3 [USER GATE]: Smoke-test the Action with a no-op republish tag**

After the secret exists, validate the pipeline end to end. Push a throwaway re-tag of the current version is unsafe (v0.2.2 already released). Instead bump to a test patch:

```bash
cd /Users/juliandickie/code/spiffy
git checkout main && git pull --ff-only
# bump patch for the smoke test
tmp=$(mktemp); jq '.version="0.2.3"' plugin/.claude-plugin/plugin.json > "$tmp" && mv "$tmp" plugin/.claude-plugin/plugin.json
git checkout -b chore/smoke-v0.2.3
git add plugin/.claude-plugin/plugin.json
git commit -m "Bump to v0.2.3 (publish Action smoke test)"
git push -u origin chore/smoke-v0.2.3
gh pr create --base main --head chore/smoke-v0.2.3 --title "Bump v0.2.3 (Action smoke test)" --body "Validates the publish pipeline."
# user reviews + merges:
gh pr merge --squash --delete-branch chore/smoke-v0.2.3
git checkout main && git pull --ff-only
git tag v0.2.3
git push origin v0.2.3
```

- [ ] **Step 4 [LOCAL]: Verify the Action published v0.2.3**

```bash
gh run list --repo juliandickie/spiffy-dev --workflow "Publish plugin to spiffy-plugin" --limit 1
sleep 30
curl -s https://raw.githubusercontent.com/juliandickie/spiffy-plugin/main/.claude-plugin/plugin.json | jq -r '.version'
gh release list --repo juliandickie/spiffy-plugin --limit 2
```

Expected: workflow run succeeded; lean repo plugin.json now `0.2.3`; release `v0.2.3` present. The publish pipeline is proven.

---

## Phase 7 - Outfit catalog source change

### Task 11: Flip the spiffy entry to a bare URL

**Files:**

- Modify: `/Users/juliandickie/code/plugins/.claude-plugin/marketplace.json`

The outfit catalog is local-only and unpushed, so this is a local edit with no live impact.

- [ ] **Step 1 [LOCAL]: Replace the git-subdir object with a bare-URL string**

In `/Users/juliandickie/code/plugins/.claude-plugin/marketplace.json`, find the spiffy plugin entry and replace its `source` block:

Old:

```json
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/juliandickie/spiffy-plugin.git",
        "path": "plugin",
        "ref": "main"
      },
```

New:

```json
      "source": "https://github.com/juliandickie/spiffy-plugin",
```

Leave the rest of the spiffy entry (name, description, author, homepage, repository, license, category, keywords) unchanged.

- [ ] **Step 2 [LOCAL]: Validate and confirm uniformity with the other four entries**

```bash
cd /Users/juliandickie/code/plugins
python3 -m json.tool .claude-plugin/marketplace.json > /dev/null && echo "JSON OK"
jq -r '.plugins[] | "\(.name): \(.source | type)"' .claude-plugin/marketplace.json
```

Expected: JSON OK; all five plugins report `source: string` (uniform - no `object` remaining).

- [ ] **Step 3 [LOCAL]: Commit locally (no push - catalog repo not created yet, deferred user decision)**

```bash
git add .claude-plugin/marketplace.json
git commit -m "spiffy source git-subdir -> bare URL (lean repo, post-split)"
git log --oneline -1
```

Expected: local commit; `git remote -v` still empty (catalog has no remote yet, by prior decision).

---

## Phase 8 - End-to-end verification

### Task 12: Prove a clean install of the lean plugin

**Files:** none (verification)

- [ ] **Step 1 [USER GATE]: Clean any stale marketplace cache, then add + install**

The user runs these in a Claude Code session (slash commands cannot be executed from this environment):

```
/plugin marketplace remove spiffy   (if a stale one exists)
/plugin marketplace add juliandickie/spiffy-plugin
/plugin install spiffy
```

- [ ] **Step 2 [LOCAL]: Confirm the installed version and lean-clone size**

After the user installs, verify from the filesystem:

```bash
find ~/.claude/plugins -path '*spiffy*plugin.json' -exec jq -r '.version' {} \; 2>/dev/null | head -1
du -sh ~/.claude/plugins/cache/*spiffy* 2>/dev/null | head -1
```

Expected: version is the latest published (`0.2.3` after the smoke test, else `0.2.2`); cache footprint is the lean payload only (sub-1 MB, no `mcp/` source, no `docs/`, no OpenAPI spec).

- [ ] **Step 3 [LOCAL]: Final success-criteria checklist**

```bash
echo "spiffy-dev exists, has history + releases:"
gh repo view juliandickie/spiffy-dev --json name,visibility --jq '"  " + .name + " " + .visibility'
gh release list --repo juliandickie/spiffy-dev --limit 1
echo "spiffy-dev has NO marketplace.json:"
gh api repos/juliandickie/spiffy-dev/contents/.claude-plugin/marketplace.json 2>&1 | grep -q "Not Found" && echo "  confirmed absent" || echo "  STILL PRESENT - investigate"
echo "lean spiffy-plugin is lean:"
gh api repos/juliandickie/spiffy-plugin/git/trees/main --jq '.tree[] | select(.type=="tree") | .path' | sort
echo "chore/rename-self-marketplace gone:"
git ls-remote --heads origin chore/rename-self-marketplace 2>/dev/null | grep -q . && echo "  STILL PRESENT" || echo "  confirmed deleted"
```

Expected: spiffy-dev public with releases; no marketplace.json in spiffy-dev; lean repo top-level trees are only plugin payload dirs (`.claude-plugin`, `commands`, `mcp`, `skills`) with no `docs`/`tests`; the old branch is gone.

---

## Self-review (executor runs after all tasks)

1. **Spec coverage** - every spec section maps to a task:

   - Section 1 topology - Tasks 5 (rename to spiffy-dev), 7-8 (fresh lean repo). Covered.

   - Section 2 migration sequence - Tasks 2-3 (migration PR), 4 (delete branch), 5 (rename), 6 (repoint remote), 7-8 (lean repo), 11 (catalog). Covered, ordering preserved.

   - Section 3 build/publish - Tasks 9-10 (Action + PAT). Build unchanged confirmed in Task 7 Step 1. Covered.

   - Section 4 catalog - Task 11. Covered.

   - Section 5 risks - safety-critical remote-repoint ordering enforced (Task 6 before Task 8); non-destructive (rename not delete); token scope specified (Task 10 Step 1); Action always rebuilds (Task 9 workflow). Covered.

2. **Placeholder scan** - no TBD/TODO/"fill in". All file contents (CLAUDE.md, marketplace.json, README, .gitignore, workflow YAML) are given in full. The only ellipses are inside literal config examples (`api_key = "..."`) which are intentional user-facing placeholders in the README, not plan gaps.

3. **Type/name consistency** - secret name `SPIFFY_PLUGIN_PUBLISH_TOKEN` identical in Task 9 workflow and Task 10. Repo names `juliandickie/spiffy-dev` and `juliandickie/spiffy-plugin` consistent throughout. Lean self-marketplace `name: "spiffy"`, `source: "."` consistent between seed (Task 7) and the Action's version-bump (Task 9, which never rewrites those fields - only `metadata.version`).

If the executor finds a gap mid-run, surface it before proceeding past the affected task.
