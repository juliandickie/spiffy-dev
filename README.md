# Spiffy Claude Code Plugin

Talk to the [Spiffy](https://spiffy.co) platform from Claude Code. Look up customers, generate reports, add notes, and create one-off promo codes — all in natural language.

## What it does

- **Customer lookup** — "look up jane@example.com" returns her orders, subscriptions, payments, and notes.
- **Reports** — MRR snapshots, affiliate performance, churn, top products — all with canonical markdown output.
- **Add notes** — `/spiffy-note <customer> "<text>"` with a confirmation gate.
- **Create one-off promo codes** — `/spiffy-promo <customer> --percent 20 --expires 7d` creates the code and gives you a dashboard link + a draft customer message.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and working
- Node.js ≥ 18
- A Spiffy API key (get one from Settings → API in your Spiffy dashboard)
- *(Optional)* 1Password CLI (`op`) if you want to store the key there instead of in an env file

## Install

The plugin is distributed via a Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) hosted in this repo. Inside Claude Code:

1. **Add the marketplace** (one-time):

   ```
   /plugin marketplace add Institute-of-Digital-Dentistry/spiffy-plugin
   ```

2. **Install the plugin:**

   ```
   /plugin install spiffy@idd-plugins
   ```

That's it — the MCP server ships as a self-contained pre-built bundle (`mcp/dist/index.js`), so no `npm install` step is needed on the user side. Restart Claude Code to pick up the new MCP server.

To get updates, run `/plugin marketplace update idd-plugins` and then `/plugin install spiffy@idd-plugins` again.

> **Local development install:** if you've cloned the repo and want Claude Code to load it from your working tree, run `cd mcp && npm install && npm run build` once, then use `claude --plugin-dir ./` from the repo root. See [Development](#development) below.

## Configure your API key

Choose one of three methods:

### Option A: environment variable (simplest)

```bash
export SPIFFY_API_KEY=sk_live_your_key_here
```

Add it to your `~/.zshrc` or `~/.bashrc` to persist.

### Option B: 1Password reference (recommended for teams)

Store your key in 1Password, then set:

```bash
export SPIFFY_API_KEY=op://YourVault/Spiffy\ API/credential
```

Requires the [1Password CLI](https://developer.1password.com/docs/cli/) installed and signed in (`op signin`).

### Option C: config.toml fallback

Create `~/.config/spiffy-plugin/config.toml`:

```toml
api_key = "sk_live_your_key_here"
```

This is read if `SPIFFY_API_KEY` is not set.

## Verify it works

Launch Claude Code and ask:

> "Use the Spiffy plugin to look up my account."

Claude should call the `account_get` tool and return your account name, plan, and quota.

## Usage examples

**Customer inquiry:**
> "Find jane@example.com in Spiffy and show me her subscription status and recent payments."

**Add a note:**
> `/spiffy-note jane@example.com She called today about a refund, approved for $99.`

**Generate a promo:**
> `/spiffy-promo jane@example.com --percent 25 --expires 7d --checkout-url https://checkout.spiffy.co/advanced-endo`

**Run a report:**
> "Run the MRR snapshot for this month."
> "Show me the top 5 courses by revenue in Q1 2026."

## Configuration reference

| Env var | Default | Purpose |
|---|---|---|
| `SPIFFY_API_KEY` | — | **Required.** Your Spiffy API key (literal or `op://` reference). |
| `SPIFFY_BASE_URL` | `https://api.spiffy.co` | Override for testing. |
| `SPIFFY_DRY_RUN` | unset | Set to `1` to block all writes and return synthetic responses (for testing). |

## Troubleshooting

**"SPIFFY_API_KEY is not set"** — see Configure section. Check that the env var is visible to Claude Code (re-launch it after setting).

**"API key invalid (401 Unauthorized)"** — regenerate your key in the Spiffy dashboard at Settings → API, then update your env var or 1Password entry.

**"Failed to resolve 1Password reference"** — install `op` CLI and sign in with `op signin`. Verify the reference is valid: `op read "op://Vault/Item/field"`.

**Promo was created but doesn't apply at checkout** — the v2 Spiffy API currently only creates the bare promo code. You still need to open the Spiffy dashboard to (1) add the promo to the correct checkout and (2) choose which products/options it applies to. The `/spiffy-promo` command includes a direct link to do this.

## Audit log

Every write operation (notes, promo creation) is logged to:

```
~/.local/share/spiffy-plugin/audit.log
```

One line per operation: timestamp, operator, action, response ID, and the confirmation summary the user approved. Rotate or archive periodically.

## License

MIT (subject to IDD confirmation before open-sourcing).

## Development

```bash
cd mcp
npm install           # installs deps AND configures git hooks (once)
npm run test          # run unit tests
npm run test:watch    # watch mode
npm run typecheck     # TypeScript check (src + tests)
npm run build         # compile to dist/
npm run dev           # run via tsx (no build needed)
```

### Git hooks

This repo uses a lightweight `pre-push` hook at `.githooks/pre-push` that blocks accidental direct pushes to `main` (GitHub free-tier private repos don't get platform-side branch protection). The hook is activated automatically by `npm install` in `mcp/` — it sets `git config core.hooksPath .githooks` for your clone.

To push changes, always use a feature branch + PR:

```bash
git checkout -b feat/your-feature
git push -u origin feat/your-feature
gh pr create --base main
```

Emergency override (use sparingly): `git push --no-verify`.

## Contributing

Currently closed for external contributions while we validate internally at IDD. Once open-sourced, we'll accept issues and PRs via the GitHub repository.
