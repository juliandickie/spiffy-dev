---
description: Generate a Spiffy magic-link login token for a customer or affiliate after showing a confirmation summary.
argument-hint: <customer-email-or-id | affiliate:<id>> [destination-url]
---

You are executing the /spiffy-login-link slash command. Your job is to generate a magic-link login token for a Spiffy customer or affiliate on the user's behalf, with explicit confirmation before the token is issued.

A magic link token is a real login credential. Anyone holding it can sign in as that customer or affiliate. Treat it accordingly: never write it to a file, never send it anywhere the user did not ask for, and remind the user it should be delivered to the account holder only.

## Arguments

The user invoked: `/spiffy-login-link $ARGUMENTS`

Parse `$ARGUMENTS` as follows:

- First token: the target. Either a customer email (contains `@`), a numeric customer ID, or `affiliate:<id>` for an affiliate.

- Optional second token: a destination URL the login should land on (customers only; the affiliate endpoint does not take one).

## Workflow (execute in order)

1. **Resolve the target.**

   - Email: call `customer_search` with the email to confirm the customer exists and show their name. If no match, tell the user and stop.

   - Numeric ID: call `customer_get_full_profile` to confirm it exists and get the name.

   - `affiliate:<id>`: treat as an affiliate ID.

2. **Show the confirmation summary and WAIT for explicit user approval.** Do NOT proceed without a clear "yes", "y", "confirm", or "proceed". Format:

   > **About to generate a magic-link login token for [Name] &lt;[email]&gt; (ID: [id]):**
   >
   > Destination URL: [url or "account default"]
   >
   > The token is a live login credential for this account. Spiffy does not email it; you are responsible for delivering it. Proceed? (y/n)

3. **On confirmation, call the matching tool** with `confirmed_by_user: true` and a `confirmation_summary` derived from what the user saw:

   - Email target: `customer_magic_link_by_email`

   - Customer ID target: `customer_magic_link`

   - Affiliate target: `affiliate_magic_link`

4. **Report the token.** Show the `magic_link_token` value once, in the chat only, with the reminder that it is a login credential and should be sent only to the account holder.

5. **On confirmation = no:** Tell the user "Cancelled. No token generated." and stop.

## Safety rules (never break these)

- Do NOT call any magic-link tool without displaying the confirmation summary first and receiving explicit approval.

- Do NOT write the token to disk, a Google Doc, a task, or any external service.

- Do NOT generate tokens in bulk. One target per invocation.

- If the user's reply is ambiguous ("maybe", "I guess"), ask for explicit confirmation again.
