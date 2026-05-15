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
