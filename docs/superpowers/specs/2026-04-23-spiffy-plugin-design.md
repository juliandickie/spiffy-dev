# Spiffy Claude Code Plugin — Design

**Date:** 2026-04-23
**Author:** Julian Dickie (Institute of Digital Dentistry)
**Status:** Draft for approval

---

## 1. Overview

A Claude Code plugin that lets non-engineering teams — support, marketing, and business operations — interact with the Spiffy platform (https://api.spiffy.co) in natural language. Initial use is at Institute of Digital Dentistry (IDD); the plugin is designed to be generic enough to share with other Spiffy merchants after internal validation.

### Goals

- Let the support team answer customer inquiries in seconds rather than clicking through the Spiffy dashboard.
- Give marketing and ops teams on-demand reports (affiliate performance, MRR, churn, top products) without pulling a developer in.
- Allow support to create one-off promo codes for specific customers with a single command, with a confirmation gate, a draft message for the customer, and clear instructions for the remaining short dashboard step (linking the promo to a checkout and selecting products — not yet reliably automatable via the public API; see §9 and §12).
- Build trust gradually: MVP is read-heavy with two low-risk writes (notes and promo creation). Refunds and subscription changes are explicitly deferred.

### Non-goals (MVP)

- Refunds, cancellations, pauses, or any money-moving write other than promo creation.
- OAuth 2.0 — single-tenant, API-key-only auth is sufficient.
- Slack bot or web frontend — the plugin is a local Claude Code installation per user.
- Wrapping every Spiffy endpoint. The MCP server exposes ~24 curated tools, not the full 140.

---

## 2. Users and use cases

### Personas

| Persona | Team size | Primary tasks |
|---|---|---|
| Support rep | 1–2 | Customer lookup, subscription status checks, add notes, generate promos |
| Marketing | 1–2 | Affiliate performance, top-product reports, promo usage analysis |
| Ops / Finance | 1 | MRR snapshots, churn, payment plan arrears |

Total IDD users: ≤3 initially. External sharing may scale this to dozens per installing merchant, but each merchant is independent (own API key). Spiffy's 100 req/min rate limit is not a concern at this scale.

### Representative scenarios

1. **"Jane emailed asking about her refund."** Support rep asks Claude: "look up jane@example.com — what's she purchased and is anything in dispute?" → Claude calls `customer_search` + `customer_get_full_profile`, returns a summary with orders, subscriptions, payment status, prior notes.
2. **"Run our monthly MRR snapshot."** Ops runs `/spiffy-mrr-snapshot` or the equivalent skill → canonical markdown report with current MRR, delta vs last month, and plan breakdown.
3. **"Send Jane a 25% off promo, expires in 7 days."** Support runs `/spiffy-promo jane@example.com --percent 25 --expires 7d` → confirmation shown (with heads-up about the short dashboard follow-up) → promo created → plugin returns (a) a direct link into the Spiffy dashboard for the 1-minute "add to checkout + pick products" step and (b) a pre-drafted customer-facing message. Total time: ~90 seconds vs ~5 minutes manually.

---

## 3. Architecture

Three-layer hybrid design, each layer solving a different problem:

```
┌──────────────────────────────────────────────────────────┐
│  Claude Code (user's local install)                      │
│                                                          │
│   User prompt → Claude → composes tools/skills/commands  │
└────────────────┬─────────────────────────────────────────┘
                 │
     ┌───────────┼──────────────┬──────────────────┐
     │           │              │                  │
     ▼           ▼              ▼                  ▼
┌─────────┐ ┌──────────┐ ┌──────────────┐  ┌────────────────┐
│  MCP    │ │  Skills  │ │  Slash cmds  │  │  Plugin meta   │
│  server │ │  (MD)    │ │  (MD)        │  │  (plugin.json) │
│  ~24    │ │  4 reps  │ │  /spiffy-    │  │  .mcp.json     │
│  tools  │ │          │ │  note,       │  │                │
│         │ │          │ │  /spiffy-    │  │                │
│         │ │          │ │  promo       │  │                │
└────┬────┘ └──────────┘ └──────┬───────┘  └────────────────┘
     │                          │
     │  HTTPS + Bearer token    │
     ▼                          ▼
┌──────────────────────────────────────┐
│   Spiffy API (https://api.spiffy.co) │
└──────────────────────────────────────┘
```

**Why hybrid, not one of the alternatives:**

- **Pure MCP** (all 24 tools, no skills/commands): Claude composes everything ad-hoc. Maximum flexibility but (a) reports lack canonical output structure — the same "affiliate report" looks different every time, (b) writes have no pre-execution confirmation gate.
- **Pure skills + commands** (no MCP, 14 hand-built workflows): deterministic but users can't ask anything outside the pre-built shapes; every new question requires a new skill.
- **Hybrid (chosen):** MCP handles breadth cheaply; skills enforce structure where it matters; commands wrap writes with explicit confirmation.

### Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| MCP server language | TypeScript | Mature `@modelcontextprotocol/sdk`, runs via `node`/`npx`, no venv friction for external users |
| Auth | API key (Bearer) | Single-tenant; OAuth is for multi-merchant SaaS, which this isn't |
| MCP tool count | ~24 | Curated around real tasks, not 1:1 with 140 endpoints |
| Writes in MVP | Notes + promo only | Low risk (notes) and high value (promos); money-moving writes (refunds, cancellations) deferred |
| Reports | Skills, not MCP tools | Canonical output structure; easier to tweak prompting than to re-ship code |
| Distribution | Private GitHub repo under IDD org | Internal-first, public later after validation |

---

## 4. Repository layout

```
spiffy-plugin/
├── plugin.json                   # Claude Code plugin manifest
├── .mcp.json                     # Registers the MCP server with Claude
├── .env.example                  # Template: SPIFFY_API_KEY=…
├── .gitignore                    # Excludes .env, node_modules, audit.log, etc.
├── README.md                     # Install + configure for IDD and external Spiffy users
├── LICENSE                       # MIT (to be confirmed by IDD)
├── mcp/                          # TypeScript MCP server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts              # Server entrypoint, tool registration
│   │   ├── client.ts             # Spiffy API wrapper (fetch, auth, retry, rate-limit)
│   │   ├── config.ts             # SPIFFY_API_KEY resolution (env → 1P → config.toml)
│   │   ├── types.ts              # Request/response types
│   │   ├── errors.ts             # Structured error mapping from Spiffy responses
│   │   └── tools/
│   │       ├── customers.ts      # customer_search, _get_full_profile, _list_orders, …
│   │       ├── orders.ts
│   │       ├── subscriptions.ts
│   │       ├── payments.ts
│   │       ├── products.ts
│   │       ├── promos.ts
│   │       ├── affiliates.ts
│   │       └── meta.ts           # account_get
│   └── tests/                    # vitest unit + contract tests
├── skills/
│   ├── spiffy-mrr-snapshot/SKILL.md
│   ├── spiffy-affiliate-report/SKILL.md
│   ├── spiffy-churn-report/SKILL.md
│   └── spiffy-top-products-report/SKILL.md
└── commands/
    ├── spiffy-note.md
    └── spiffy-promo.md
```

---

## 5. Configuration and auth

### API key resolution

The MCP server reads the API key at startup with this precedence:

1. **`SPIFFY_API_KEY` env var with a literal value** (e.g. `sk_live_abc123…`).
2. **`SPIFFY_API_KEY` env var with a 1Password reference** (e.g. `op://Team Vault/Spiffy API/credential`). If the value starts with `op://`, the server invokes `op read` to resolve it. Requires the user to have the 1Password CLI installed and signed in.
3. **`~/.config/spiffy-plugin/config.toml`** with `api_key = "…"` — fallback for users without env-var or 1Password habits.

If none are found, the server logs a clear error pointing to the README's setup section and exits.

### Startup validation

On server boot, call `GET /v2/account`. On failure:

- **401 Unauthorized** → error: "API key invalid. Regenerate at Settings → API in your Spiffy dashboard."
- **Network error** → error: "Could not reach api.spiffy.co. Check connectivity."
- **Success** → log "Connected to Spiffy account: {account.name}" and proceed.

### What's never committed or logged

- The API key itself
- Full customer PII in debug logs (emails may appear in user-facing output, but structured logs use ID-only)
- The contents of notes (treated as potentially-sensitive free text)

---

## 6. MCP server — tool list

24 tools (22 read + 2 write), grouped by resource. Each tool wraps 1–3 API calls and returns structured JSON the LLM can summarise.

### Customers (5)

| Tool | Wraps | Notes |
|---|---|---|
| `customer_search` | `GET /v2/customers?search=…&filter[…]` | Accepts email, name, or partial match; returns up to 25 matches |
| `customer_get_full_profile` | `GET /v2/customers/{id}?include=cards,stats,fields` + `/orders` + `/subscriptions` + `/payments` (last N each) | Single call from Claude's POV; server parallelises |
| `customer_list_orders` | `GET /v2/orders?filter[customer_id]=…` | Paginated |
| `customer_list_subscriptions` | `GET /v2/subscriptions?filter[customer_id]=…` | Paginated |
| `customer_list_payments` | `GET /v2/payments?filter[customer_id]=…` | Paginated |

### Orders (2)

| Tool | Wraps |
|---|---|
| `order_get` | `GET /v2/orders/{id}` |
| `orders_list` | `GET /v2/orders` with filter/search passthrough |

### Subscriptions (3)

| Tool | Wraps |
|---|---|
| `subscription_get` | `GET /v2/subscriptions/{id}` |
| `subscriptions_list` | `GET /v2/subscriptions` with filter/search passthrough |
| `subscription_billing_schedule` | `GET /v2/subscriptions/{id}` + compute next charge date |

### Payments (4)

| Tool | Wraps |
|---|---|
| `payment_get` | `GET /v2/payments/{id}` |
| `payments_list` | `GET /v2/payments` with status filter (`successful`, `failed`, `refunded`, etc.) |
| `payment_plan_get` | `GET /v2/paymentplans/{id}` |
| `payment_plans_list` | `GET /v2/paymentplans` with status filter (for arrears reports) |

### Products (2)

| Tool | Wraps |
|---|---|
| `product_get` | `GET /v2/products/{id}` |
| `products_list` | `GET /v2/products` |

### Promos (2)

| Tool | Wraps | Notes |
|---|---|---|
| `promo_list` | `GET /v2/promos` | Shows code, discount, uses, expiry |
| `promo_get` | `GET /v2/promos/{id}` | Includes `ordered_count`, `is_expired` |

(Plus `promo_create` as a write-only tool — see §6.writes below.)

### Affiliates (3)

| Tool | Wraps |
|---|---|
| `affiliate_get` | `GET /v2/affiliates/{id}` |
| `affiliates_list` | `GET /v2/affiliates` |
| `affiliate_program_get` | `GET /v2/affiliates/programs/{id}` |

### Meta (1)

| Tool | Wraps |
|---|---|
| `account_get` | `GET /v2/account` |

### Writes exposed as tools (must only be invoked via slash commands)

| Tool | Wraps | Required entry point |
|---|---|---|
| `customer_add_note` | `POST /v2/customers/{id}/notes` | `/spiffy-note` |
| `promo_create` | `POST /v2/promos` | `/spiffy-promo` |

**Bypass prevention.** Two layers of defense:

1. **Tool description warning.** Each write tool's MCP `description` field explicitly states:

   > ⚠️ DESTRUCTIVE: This tool writes to Spiffy. **Do not call it directly.**
   > Use the `/spiffy-{command}` slash command, which presents a confirmation
   > summary to the user before invoking this tool. Direct invocation without
   > human confirmation is a safety violation.

   Claude's safety training respects such warnings when they're explicit.

2. **Required confirmation arguments.** The write tools' signatures require two fields:

   - `confirmed_by_user: true` (boolean, must be literally `true`)
   - `confirmation_summary: string` (must be a non-empty human-readable summary of the operation — echoes back what the user saw and approved)

   The slash command's prompt instructs Claude to construct the summary, show it to the user, wait for explicit confirmation, and then call the tool with both fields populated. The MCP server validates that `confirmed_by_user === true` and that `confirmation_summary` is non-empty; it also logs the summary into the audit trail. This isn't a cryptographic guarantee (Claude could in theory forge both), but it turns a direct write into a multi-step deliberate action that's visible in transcripts and audit logs — which is sufficient for the threat model of a well-intentioned Claude occasionally misreading context.

### Tool descriptions

Each tool's MCP description includes:

- What it does (one sentence)
- Arguments with types and examples
- What it returns (shape)
- Any important constraints (e.g., "dates must be ISO-8601")
- Whether it mutates state (all writes explicitly say so)

---

## 7. Spiffy API client (`mcp/src/client.ts`)

Single thin wrapper around `fetch`, handling:

- **Bearer auth** on every request.
- **JSON encoding / decoding.**
- **Retry with exponential backoff** on 429 and 5xx (max 3 retries; respects `X-RateLimit-Reset` if present).
- **Rate-limit awareness:** expose `X-RateLimit-Remaining` to callers; refuse new requests for 5 seconds if remaining drops to zero (prevents hard 429s from runaway loops).
- **Error mapping:** Spiffy's structured error format (`{error: {code, message, details}}`) is converted to a typed `SpiffyError` with fields the MCP tools can surface usefully.
- **Dry-run mode:** an env-var `SPIFFY_DRY_RUN=1` makes all non-GET requests no-op and return a mock success response with the body that would have been sent. Used by tests and manual verification.

Tests:

- Unit tests mock `fetch` and assert request shape, header content, error mapping.
- Contract tests (optional, behind an env flag) call the real API against a dedicated test account. Not required for PR merge.

---

## 8. Skills (reports)

Each skill is a markdown file with YAML frontmatter (`name`, `description`, trigger hints) and a prompt that tells Claude how to call MCP tools and format output.

### `spiffy-mrr-snapshot`

**Trigger:** "MRR", "monthly recurring revenue", "revenue snapshot"
**Inputs:** optional period (default: "this month")
**Uses tools:** `subscriptions_list`, `account_get`
**Output:** markdown report with current MRR, delta vs prior month, active subscription count, breakdown by plan (if multiple plans).

### `spiffy-affiliate-report`

**Trigger:** "affiliate report", "affiliate performance", "top affiliates"
**Inputs:** period (default: last 30 days), optional `top N` (default: 10)
**Uses tools:** `affiliates_list`, `affiliate_program_get`, `orders_list` (filter by affiliate)
**Output:** ranked table — affiliate name, signups, gross revenue, commission owed, conversion rate.

### `spiffy-churn-report`

**Trigger:** "churn", "cancellations", "failed renewals"
**Inputs:** period (default: last 30 days)
**Uses tools:** `subscriptions_list` (filter status), `payments_list` (filter failed)
**Output:** cancellations count, failed-renewal count, retention rate, list of at-risk subscriptions (past-due).

### `spiffy-top-products-report`

**Trigger:** "top products", "bestsellers", "product revenue"
**Inputs:** period (default: this month), metric (units vs revenue; default: revenue)
**Uses tools:** `orders_list`, `products_list`
**Output:** ranked table — product name, units sold, gross revenue, average order value.

### Shared skill conventions

- All reports accept flexible date input (`this month`, `last 30d`, `2025-Q1`, `YYYY-MM-DD..YYYY-MM-DD`) and normalise internally.
- All reports produce markdown tables suitable for copy-paste into Slack, email, or docs.
- All reports footer with "Generated {timestamp} via Spiffy plugin — data from api.spiffy.co".

---

## 9. Slash commands (writes)

### `/spiffy-note`

**Purpose:** Add a note to a customer, order, subscription, or payment plan.

**Usage:**

```
/spiffy-note <target> [note text]
```

- `<target>` can be a customer email, customer ID, order ID (`ord_…`), subscription ID (`sub_…`), or payment plan ID (`plan_…`).
- If note text is omitted, the command prompts for it.

**Flow:**

1. Resolve target:
   - Email → `customer_search` → if 1 match, proceed; if multiple, ask user to disambiguate.
   - ID → inspect prefix to pick endpoint (`POST /v2/customers/{id}/notes`, `/orders/{id}/notes`, etc.).
2. Show confirmation: "Adding note to **Jane Smith &lt;jane@…&gt;**: _{note text}_. Proceed?"
3. On confirm, POST the note.
4. Success message: "Note added (ID: note_abc123)."

**Safety:**

- Confirmation required (always).
- Dry-run available via `/spiffy-note --dry-run …`.

### `/spiffy-promo`

**Purpose:** Create a one-off promo code for a specific customer, return the code plus a draft message for support, and give clear instructions for the short dashboard step required to finish linking the promo to the checkout's products.

**Understanding the 3-step manual workflow.** Based on how IDD creates promos today (confirmed with Julian), Spiffy's actual promo creation involves three steps in the dashboard:

1. **Create the promo code** — code, discount rules, limits, expiry.
2. **Add the promo to a checkout** — a checkout is a container of products; in v2 API, checkouts live under affiliate programs.
3. **Choose which products/options in the checkout the promo applies to** — per-item scoping.

The public v2 API cleanly supports **step 1** (`POST /v2/promos`). Steps 2 and 3 map to under-specified endpoints (`/v2/promos/{id}/actions`, checkouts-under-programs) whose exact contract isn't documented in the OpenAPI. Rather than guess and ship something fragile, MVP automates step 1 only and gives the user a one-minute dashboard recipe for steps 2–3.

**MVP scope:** Automates step 1. Outputs instructions for steps 2–3 with a direct link into the Spiffy dashboard.

**Usage:**

```
/spiffy-promo <customer> [flags]
```

**Flags:**

| Flag | Default | Description |
|---|---|---|
| `--percent <n>` | — | Discount as percentage (e.g. `--percent 20` = 20% off). Mutex with `--amount`. |
| `--amount <n>` | — | Discount as flat amount (e.g. `--amount 50`). Mutex with `--percent`. |
| `--applies-to <one-time\|subscription\|both>` | `one-time` | What the discount is configured for at the promo level. Per-product scoping happens at step 2 in the dashboard. |
| `--expires <duration-or-date>` | `7d` | Expiry. Accepts `7d`, `2026-05-15`, `end-of-month`. |
| `--uses <n>` | `1` | Maximum total orders. `0` = unlimited. |
| `--per-customer <n>` | `0` | Per-customer use limit (`0` = no cap). |
| `--code <CODE>` | auto-generated | Override the auto-generated code. |
| `--checkout-url <url>` | — | If provided, the output message uses this checkout URL with `?c=CODE` appended. If omitted, the output tells the user to paste their own checkout URL. |
| `--dry-run` | off | Print the request body without executing. |

**Flow:**

1. Resolve customer via `customer_search`. Ask for disambiguation if needed.
2. Generate code if not provided: `{UPPER-FIRST-NAME}-{MMM-YY}-{4-char-random}` (e.g. `JANE-MAY26-A7KQ`). Retry up to 5 times if `promo_list` shows a collision.
3. Build request body per `POST /v2/promos` schema:
   - `onetime_discount_type` / `subscription_discount_type` set to `percent` or `amount` per flags.
   - `onetime_discount_offset` / `subscription_discount_offset` set to numeric value.
   - Only the field matching `--applies-to` gets populated; the other is omitted (or set to both if `--applies-to both`).
   - `order_limit`, `per_customer_limit`, `expire_at` per flags.
4. **Show confirmation summary**:

   > About to create promo `JANE-MAY26-A7KQ`:
   > - 20% off one-time purchases
   > - Max 1 total order (single-use)
   > - Expires 2026-05-01 (7 days)
   > - For customer **Jane Smith &lt;jane@…&gt;**
   >
   > After creation, you'll need to open the Spiffy dashboard and:
   > 1. Open Settings → Promos → `JANE-MAY26-A7KQ`
   > 2. Add this promo to the checkout that contains the customer's desired course
   > 3. Select which products/options the promo applies to
   >
   > Proceed with creation? (y/n)

5. On confirmation, `POST /v2/promos`. On success, return a two-part output:

   **Part A — Dashboard finish steps:**

   > ✅ Created promo `JANE-MAY26-A7KQ` (ID: promo_12345).
   >
   > **Finish setup in the dashboard (~1 min):**
   > 1. Open https://app.spiffy.co/promos/12345
   > 2. Add this promo to the checkout containing the customer's course
   > 3. Select which product(s) or option(s) the promo applies to
   > 4. Save

   **Part B — Draft message to send the customer (after dashboard steps done):**

   > Hi Jane — here's your 20% off discount: [checkout URL]?c=JANE-MAY26-A7KQ
   > Single-use, expires May 1.

   If `--checkout-url` was provided, Part B's URL is filled in directly. If not, it's shown as `[your-checkout-url]?c=JANE-MAY26-A7KQ` with a note to paste the checkout URL from step 1.

6. Append an audit-log entry.

**Safety:**

- Confirmation always required; confirmation summary explicitly calls out that dashboard steps 2–3 are still manual so the operator isn't surprised.
- Dry-run via `--dry-run` prints the full request body and intended output without calling the API.
- The command never claims the promo is "ready to send" — it always frames the output as "code created, finish in dashboard, then send message." Prevents support reps from sending links before the promo is fully configured.

**Post-MVP extension:** Once we verify the contract for `/v2/promos/{id}/actions` and the checkouts-under-programs endpoints (see §12 Open Questions), the command can automate steps 2–3 and collapse to a single "done, here's the link" output.

---

## 10. Safety, audit, and PII

### Confirmation gates

Every write command requires an explicit "y" or "proceed" before executing. No quiet writes.

### Audit log

Every write appends one line to `~/.local/share/spiffy-plugin/audit.log`:

```
2026-04-23T14:32:01Z  julian  promo.create  code=JANE-MAY26-A7KQ  customer_id=cus_123  response_id=promo_456
```

Plain text, gitignored, rotated quarterly via a simple cron suggestion in the README.

### PII handling

- Emails and names appear in user-facing output (necessary for support work) but never in structured debug logs.
- Payment card data: the MCP server never requests `cvv` or full card numbers. `last4` and `brand` are the only card fields surfaced.
- The plugin does not persist any customer data between sessions beyond the audit log.

### Rate limiting

- Spiffy's 100 req/min limit is generous for our use. The client refuses further writes for 5s if `X-RateLimit-Remaining` drops to 0.
- Reports that paginate heavy endpoints (e.g., full year of orders) cap at 10 pages by default with a note to the user if more data exists.

---

## 11. Testing strategy

### MCP server

- **Unit tests** (vitest): mock `fetch`, verify request shape and header content per tool, verify error mapping.
- **Contract tests** (optional, env-gated): run the read tools against a dedicated test Spiffy account; writes run in dry-run mode. Not required for PR merge; used for manual sanity checks.
- **Dry-run CI check**: CI runs every write command in dry-run mode on each PR to catch schema drift (e.g., if Spiffy changes a required field).

### Skills and commands

- Manual test scripts documented in `docs/testing.md` for each skill and command, with expected outputs.
- Reports are snapshot-tested against known fixtures (fake Spiffy responses stubbed into the MCP client).

---

## 12. Open questions

1. **`/v2/promos/{id}/actions` contract.** The OpenAPI schema is just `{event_actions: <underspecified map>}`. Need to determine, via Spiffy support or sandbox experimentation:
   - Can this endpoint attach a promo to a checkout?
   - Can this endpoint scope a promo to specific products/options within a checkout?
   - What's the full shape of `event_actions`?
   Resolving this unlocks full automation of the 3-step workflow (see §9 `/spiffy-promo` post-MVP extension).
2. **Checkouts in v2 API.** Checkouts currently only appear under `/v2/affiliates/programs/{program_id}/checkouts`. Verify:
   - Do non-affiliate checkouts exist as API objects, or are they dashboard-only in v2?
   - If dashboard-only, is `/v1/checkouts` (GET-only) still the right place to read them?
   - Is there a roadmap for top-level `/v2/checkouts` endpoints?
3. **Checkout URL format.** Confirm `<course>` in `https://checkout.spiffy.co/<course>?c=CODE` refers to the checkout slug (not product slug). If it's a checkout slug, the plugin doesn't need to build the URL itself — the user pastes it in via `--checkout-url` or the output tells them to paste their own.
4. **Sandbox / test account availability.** Does IDD have a separate Spiffy test account we can point contract tests at? If not, create one or accept that contract tests run against production with dry-run writes only.
5. **Open-sourcing timeline.** When do we strip IDD-specific branding and publish externally? Not blocking for MVP, but affects README tone.
6. **License choice.** MIT is the default recommendation for wide adoption; confirm with IDD before publishing externally.

---

## 13. Deferred / out of scope

- **Full 3-step promo automation** — MVP creates the bare promo code and hands off to the dashboard for checkout-linking and per-product scoping. Post-MVP, once §12 Open Questions 1 and 2 are resolved, the command can automate all three steps.
- **Refunds** (`POST /v2/payments/{id}/refund`) — deferred despite being a clear support need; promos are a safer first write to build confidence with.
- **Subscription cancellations, pauses, reactivations** (`PUT /v2/subscriptions/{id}/cancel`, `/uncancel`, etc.)
- **Payment plan adjustments** (`PUT /v2/paymentplans/{id}/cancel`, `/terms`, etc.)
- **Affiliate management** (create/edit affiliates or programs)
- **Webhook endpoint management** — tools for `/v2/webhook-endpoints/` not included; can be added if support workflows need it
- **Customer creation / merging** — out of scope; customers enter via Spiffy checkout and IDD does merges manually
- **Slack/web frontends** — if needed, built as a layer on top of this plugin, not inside it
- **Multi-account support** — one API key per install; multi-account would require OAuth

---

## 14. Success criteria

MVP is successful when:

1. An IDD support rep can answer "what did Jane buy and when's her next renewal" in <30 seconds without opening the Spiffy dashboard.
2. `/spiffy-promo` creates a working promo code (step 1 of 3) in under 30 seconds including confirmation; the operator then completes the ~1-minute dashboard step and sends the drafted message — total workflow under 2 minutes vs ~5 minutes manual baseline.
3. The four report skills produce consistent, copy-pasteable markdown that ops/marketing actually use in their weekly reviews.
4. A second person (not the author) can clone the repo, configure their own API key, and be productive in under 10 minutes.
5. No production incidents attributable to the plugin in the first 30 days of internal use.
