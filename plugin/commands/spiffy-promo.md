---
description: Create a one-off promo code for a specific customer with confirmation, audit, and dashboard-handoff instructions.
argument-hint: <customer> [--percent N | --amount N] [--expires 7d|YYYY-MM-DD] [--uses N] [--code CODE] [--checkout-url URL] [--applies-to one-time|subscription|both] [--dry-run]
---

You are executing the /spiffy-promo slash command. Your job is to (1) create a bare promo code via the Spiffy API, (2) give the user clear dashboard-finish instructions, and (3) draft a ready-to-send customer message — all with explicit confirmation before any write.

## Arguments

The user invoked: `/spiffy-promo $ARGUMENTS`

Parse flags from `$ARGUMENTS`:
- First non-flag token: customer reference (email, numeric ID, or name).
- `--percent N` or `--amount N` (mutually exclusive; exactly one required).
- `--expires <duration-or-date>`: e.g. `7d`, `2026-05-15`, `end-of-month`. Default `7d`.
- `--uses N`: max total orders. Default `1` (single-use).
- `--per-customer N`: per-customer cap. Default `0` (no cap).
- `--code CODE`: override auto-generated code. Otherwise generate `{FIRST-NAME}-{MMM-YY}-{4-random-alphanumerics}`.
- `--checkout-url URL`: optional base checkout URL (e.g. `https://checkout.spiffy.co/advanced-endo`). If provided, the draft customer message uses it.
- `--applies-to one-time|subscription|both`: default `one-time`.
- `--dry-run`: if present, show what would be created but don't call the API.

If any required field is missing (customer or discount), ask the user for it before continuing.

## Workflow

1. **Resolve the customer.** Call `customer_search` with the reference. If multiple matches, ask which. If none, stop with an explanation.

2. **Build the code.**
   - If `--code` provided, use it as-is (uppercased).
   - Otherwise, take the customer's first name (or first word of their name), uppercase it, append `-{MMM-YY}` (e.g. `-MAY26` for May 2026), and add a 4-character random alphanumeric suffix. Example: `JANE-MAY26-A7KQ`.
   - Before using the code, call `promo_list` and search for it. If the code already exists, regenerate (up to 5 attempts). If still colliding, ask the user for a custom code.

3. **Compute `expire_at`.** Convert `--expires` to an ISO-8601 date:
   - `Nd` → today + N days.
   - `end-of-month` → last day of current month.
   - `YYYY-MM-DD` → as given.

4. **Build the promo request body** per `POST /v2/promos`:
   - `code`: the computed code.
   - If `--applies-to one-time` or `both`: set `onetime_discount_type` to `percent` or `amount` per flag, and `onetime_discount_offset` to the value.
   - If `--applies-to subscription` or `both`: set `subscription_discount_type` and `subscription_discount_offset` similarly.
   - `order_limit`: from `--uses` (default 1).
   - `per_customer_limit`: from `--per-customer` (default 0).
   - `expire_at`: computed.

5. **Show the confirmation summary and wait for explicit approval.** Format:

   > **About to create promo `[CODE]`:**
   > - [20% | $50] off [one-time purchases | subscriptions | both]
   > - Max [N] total orders[, per-customer limit [M]]
   > - Expires [YYYY-MM-DD] ([N days])
   > - For customer **[Name]** &lt;[email]&gt; (ID: [id])
   >
   > **After creation, you'll need to open the Spiffy dashboard (~1 min) to:**
   > 1. Open the promo at https://app.spiffy.co/promos/[ID-after-creation]
   > 2. Add the promo to the checkout containing the customer's course
   > 3. Select which product(s) or option(s) the promo applies to
   > 4. Save
   >
   > Proceed with creation? (y/n)

6. **On confirmation:**
   - If `--dry-run`: print the full request body JSON and the intended dashboard URL; stop. Do not call the API.
   - Otherwise: call `promo_create` with:
     - All the request-body fields above
     - `confirmed_by_user: true`
     - `confirmation_summary`: a one-line recap e.g. `"Create JANE-MAY26-A7KQ 20% off one-time, single-use, expires 2026-05-01, for Jane Smith <jane@idd.com> (cus 123)"`

7. **On success, output two parts:**

   **Part A — Dashboard finish steps:**

   > ✅ Created promo `[CODE]` (ID: [id]).
   >
   > **Finish setup in the dashboard (~1 min):**
   > 1. Open https://app.spiffy.co/promos/[id]
   > 2. Add this promo to the checkout containing the customer's desired course
   > 3. Select which product(s) or option(s) the promo applies to
   > 4. Save

   **Part B — Draft customer message (send AFTER the dashboard steps):**

   If `--checkout-url` was provided:
   > Hi [First name] — here's your [N]% off discount: [checkout-url]?c=[CODE]
   > [Single-use | Unlimited uses], expires [Month Day].

   If not:
   > Hi [First name] — here's your [N]% off discount: [YOUR-CHECKOUT-URL]?c=[CODE]
   > (Replace [YOUR-CHECKOUT-URL] with the checkout URL from step 1 of the dashboard steps.)
   > [Single-use | Unlimited uses], expires [Month Day].

8. **On confirmation = no:** Tell the user "Cancelled — no promo created." and stop.

## Safety rules (never break these)

- Never call `promo_create` without showing the full confirmation summary first.
- Never call `promo_create` with `confirmed_by_user: false`.
- Never fabricate a confirmation_summary — derive it from what the user saw.
- If the user asks for a variation mid-flow ("make it 30% instead"), re-run the confirmation step from scratch with the new values.
- Never tell the user the promo is "ready to send" — always frame it as "code created, finish in dashboard, then send message."
