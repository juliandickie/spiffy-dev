---
description: Create a one-off promo code for a specific customer, scoped to the product behind their checkout where possible, with confirmation, audit, a code check, and a ready-to-send ?c= link.
argument-hint: <customer> [--percent N | --amount N] [--expires 7d|YYYY-MM-DD] [--uses N] [--code CODE] [--checkout-url URL | --checkout ID] [--applies-to one-time|subscription|both] [--dry-run]
---

You are executing the /spiffy-promo slash command. Your job is to (1) create a promo code for one customer through the Spiffy API, (2) prove with `promo_check` that the code works for that customer on that checkout, and (3) draft a ready-to-send customer message, all with explicit confirmation before any write.

Since Spiffy release r87 (November 2026) a promo has an `application`. A `products` promo is scoped to products and works on every checkout that sells them, with no dashboard step. A `checkouts` promo (the old kind) only works after someone attaches it to checkout items in the dashboard. This command uses `products` whenever the checkout's paid line has a Spiffy product behind it, and falls back to `checkouts` plus the dashboard steps when it does not.

## Arguments

The user invoked: `/spiffy-promo $ARGUMENTS`

Parse flags from `$ARGUMENTS`:

- First non-flag token: customer reference (email, numeric ID, or name).

- `--percent N` or `--amount N` (mutually exclusive; exactly one required). `--amount` is in dollars (or the account's main currency unit), for example `--amount 50` is $50.00.

- `--expires <duration-or-date>`: e.g. `7d`, `2026-05-15`, `end-of-month`. Default `7d`.

- `--uses N`: max total orders. Default `1` (single-use).

- `--per-customer N`: per-customer cap. Default `0` (no cap).

- `--code CODE`: override the auto-generated code. Letters and digits only.

- `--checkout-url URL` or `--checkout ID`: the checkout the customer will buy on. If neither is given, ask which course or checkout before continuing.

- `--applies-to one-time|subscription|both`: default `one-time`.

- `--dry-run`: show what would be created but do not call any write tool.

If any required field is missing (customer, discount, or checkout), ask the user for it before continuing.

## Workflow

1. **Resolve the customer.** Call `customer_search` with the reference. If multiple matches, ask which. If none, stop with an explanation. Keep the customer's ID and email for step 8.

2. **Resolve the checkout.**

   - `--checkout ID`: use it.

   - `--checkout-url URL`: take the last path segment as the `url_slug` and page through `checkout_list` until a checkout with that `url_slug` is found. If none matches, ask the user.

   Keep the checkout ID and the buyer URL.

3. **Find the product behind the checkout's paid line.** Call `checkout_get` with the checkout ID and `include: "items"`. The paid lines are the items with `amount` above 0.

   - **Every paid line has a `product_id`:** use the products path. The scope is one `{ "type": "product", "id": <product_id> }` per distinct product on the paid lines. If the checkout sells several products and the discount is meant for only one, ask which.

   - **A paid line has `product_id: null`:** use the checkouts path. That line has no Spiffy product behind it, so a product-scoped code cannot reach it (Spiffy answers `PROMO_FOREIGN_TARGET` or the check fails `applies_here`). Tell the user this in one line.

   - `checkout_get` also returns `hosted_url`. Use it as the buyer URL when `--checkout-url` was not given.

4. **Build the code.** Spiffy accepts letters and digits only, with no spaces, hyphens or punctuation.

   - If `--code` was given, uppercase it and strip anything that is not a letter or digit. If that changes it, tell the user.

   - Otherwise take the customer's first name (letters only), uppercase it, append the month and year as `MMMYY` (e.g. `NOV26`), and add 4 random uppercase letters or digits. Example: `JANENOV26A7KQ`.

   - Call `promo_list` with `search` set to the code. If it exists, regenerate (up to 5 attempts). If still colliding, ask the user for a custom code.

5. **Compute the dates and amounts.**

   - `expire_at`: `Nd` is today plus N days, `end-of-month` is the last day of this month, `YYYY-MM-DD` is as given.

   - `--percent N`: discount type `percent`, offset `N` (0 to 100).

   - `--amount N`: discount type `amount`, offset `N * 100`. Spiffy stores amounts in the smallest currency unit, so $50 is `5000`. Never send the dollar figure itself.

6. **Show the confirmation summary and wait for explicit approval.**

   Products path:

   > **About to create promo `[CODE]`:**
   >
   > - [20% | $50] off [one-time purchases | subscriptions | both]
   >
   > - Scoped to the product **[Product name]** (ID [product id]), so it works on [checkout name] with no dashboard step
   >
   > - Max [N] total orders[, per-customer limit [M]]
   >
   > - Expires [YYYY-MM-DD] ([N days])
   >
   > - For customer **[Name]** &lt;[email]&gt; (ID: [id])
   >
   > The code does not auto-apply. The customer needs the link with `?c=[CODE]` on the end, or must type the code.
   >
   > Proceed with creation? (y/n)

   Checkouts path: the same lines, but replace the scope line with "Checkout-driven. **[Checkout name] has no Spiffy product behind its paid line**, so after creation you must attach the promo in the Spiffy dashboard (about 1 minute)", and list the dashboard steps from step 9.

7. **On confirmation:**

   - If `--dry-run`: print the full request body JSON and stop. Do not call any write tool.

   - Otherwise call `promo_create` with:

     - `code`, the discount fields, `order_limit`, `per_customer_limit`, `expire_at`

     - Products path: `application: "products"` and `scope_targets` from step 3

     - Checkouts path: no `application` (it defaults to `checkouts`)

     - `confirmed_by_user: true`

     - `confirmation_summary`: a one-line recap, e.g. `"Create JANENOV26A7KQ 20% off one-time on product 55, single-use, expires 2026-11-26, for Jane Smith <jane@example.com> (cus 123)"`

   - If Spiffy answers `PROMO_FOREIGN_TARGET`, nothing was created. Tell the user the product scope was refused, and offer the checkouts path with a fresh confirmation summary. Do not create it without that second yes.

8. **Check the code before the customer gets it.** Call `promo_check` with the code, the customer's `email`, and `checkout_id` set to the checkout from step 2.

   - Products path: run it straight after creation.

   - Checkouts path: run it after the user says the dashboard steps are done. Until then the "applies here" check is expected to fail.

   - Read every entry in `checks[]`. If any check fails, show the failing checks with their `detail` and do not present the message as ready. Offer `promo_update` (a partial update, so send only the field to fix) where the fix is a field on the promo.

9. **On success, output:**

   **Part A - Status:**

   Products path:

   > Created promo `[CODE]` (ID: [id]), scoped to [Product name]. `promo_check` passed for [email] on [checkout name]. No dashboard step needed.

   Checkouts path:

   > Created promo `[CODE]` (ID: [id]).
   >
   > **Finish setup in the dashboard (about 1 minute):**
   >
   > 1. Open https://app.spiffy.co/promos/[id]
   >
   > 2. Add this promo to the checkout [checkout name]
   >
   > 3. Select which product(s) or option(s) the promo applies to
   >
   > 4. Save, then tell me so I can run the code check

   **Part B - Draft customer message** (checkouts path: only after the code check in step 8 passes):

   If the buyer URL is known:

   > Hi [First name], here's your [N% | $N] off: [checkout-url]?c=[CODE]
   >
   > [Single-use | Unlimited uses], expires [Month Day].

   If not:

   > Hi [First name], here's your [N% | $N] off: [YOUR-CHECKOUT-URL]?c=[CODE]
   >
   > (Replace [YOUR-CHECKOUT-URL] with the checkout's buyer URL.)
   >
   > [Single-use | Unlimited uses], expires [Month Day].

10. **On confirmation = no:** Tell the user "Cancelled. No promo created." and stop.

## Safety rules (never break these)

- Never call `promo_create` or `promo_update` without showing the full confirmation summary first.

- Never call either with `confirmed_by_user: false`.

- Never fabricate a confirmation_summary. Derive it from what the user saw.

- If the user asks for a variation mid-flow ("make it 30% instead"), re-run the confirmation step from scratch with the new values.

- Never call the message ready to send until `promo_check` has passed every check for this customer on this checkout.

- Never send a dollar figure as an amount offset. Amounts are in cents.
