---
description: Add a note to a Spiffy customer (MVP supports customer notes only) after showing a confirmation summary.
argument-hint: <customer-email-or-id> [note text]
---

You are executing the /spiffy-note slash command. Your job is to add a note to a Spiffy customer record on the user's behalf, with explicit confirmation before any write.

## Arguments

The user invoked: `/spiffy-note $ARGUMENTS`

Parse `$ARGUMENTS` as follows:
- First token: the target. Either a customer email (contains `@`), a numeric customer ID, or a prefixed ID like `ord_…`, `sub_…`, `plan_…`.
- Remaining tokens: the note text. If the remainder is empty, ask the user what text to add.

## Workflow (execute in order)

1. **Resolve the target.**
   - If the first token contains `@` or is non-numeric and not prefixed: treat as a customer search query. Call `customer_search` with `query` set to that token. If exactly one result, use it. If multiple, show the user the matches and ask which to use (by row number). If none, tell the user and stop.
   - If it's a plain integer: treat as a customer ID. Call `customer_get_full_profile` to confirm it exists and get the customer's name.
   - If prefixed (`ord_`, `sub_`, `plan_`): **MVP supports customer notes only.** Tell the user: "The MVP only supports notes on customer records. For notes on orders, subscriptions, or payment plans, please use the Spiffy dashboard." Stop.

2. **Obtain the note text.** If not provided in arguments, ask: "What note would you like to add?"

3. **Show the confirmation summary and WAIT for explicit user approval.** Do NOT proceed without a clear "yes", "y", "confirm", or "proceed" from the user. Format:

   > **About to add note to [Customer Name] &lt;[email]&gt; (ID: [id]):**
   >
   > _"[full note text]"_
   >
   > Proceed? (y/n)

4. **On confirmation, call `customer_add_note`** with:
   - `customer_id`: the resolved customer ID (integer)
   - `notes`: the note text
   - `confirmed_by_user`: `true`
   - `confirmation_summary`: a human-readable one-line summary matching what the user saw, e.g. `"Add note to Jane Smith <jane@idd.com> (cus 123): 'Called about refund'"`

5. **Report success.** Show:

   > ✅ Note added (ID: [note_id]).

6. **On confirmation = no:** Tell the user "Cancelled. No note added." and stop. Do not call the write tool.

## Safety rules (never break these)

- Do NOT call `customer_add_note` without displaying the confirmation summary first and receiving explicit yes/y/confirm.
- Do NOT call `customer_add_note` with `confirmed_by_user: false`. The tool will refuse.
- Do NOT fabricate a `confirmation_summary`. Always derive it from what you actually showed the user.
- If the user's reply is ambiguous ("maybe", "I guess"), ask for explicit confirmation again.
