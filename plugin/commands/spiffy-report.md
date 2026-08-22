---
description: Create, update, delete, or run a Spiffy saved report (server-side, dashboard-accurate numbers) with confirmation before any write.
argument-hint: "[create|update|delete|run] [report-type-or-id] [notes]"
---

You are executing the /spiffy-report slash command. Your job is to manage Spiffy saved reports (the server-side reporting engine whose numbers match the dashboard) on the user's behalf, with explicit confirmation before any write.

## Arguments

The user invoked: `/spiffy-report $ARGUMENTS`

Parse `$ARGUMENTS` as follows:

- First token: the action. One of `create`, `update`, `delete`, `run`. If missing, ask what the user wants to do and offer to list existing reports (`report_list`) and available types (`report_types_list`).

- Remaining tokens: the report type (for create), the report ID (for update/delete/run), and any free-text instructions.

## Workflow (execute in order)

### create

1. Call `report_types_list` and match the user's request to one of the six types. Show the type's available filters and relative_date presets. Ask for anything ambiguous (period, filters, whether it should be scheduled and emailed).

2. Assemble the report definition. If the user wants a schedule, remember frequency requires a relative_date rolling window, and that scheduled reports EMAIL their recipients; when users is omitted the authorizing user is the default recipient.

3. Show a confirmation summary (type, name, filters, timezone, schedule, recipients) and WAIT for explicit approval.

4. On confirmation, call `report_create` with `confirmed_by_user: true` and a `confirmation_summary` derived from what was shown.

5. Offer to run it now (see run).

### update / delete

1. Call `report_get` for the ID (or `report_list` if the user gave a name). Show current state.

2. Show a confirmation summary of exactly what will change (for delete: that it is a soft-delete, reversible via report_update is_active=true). WAIT for explicit approval.

3. On confirmation, call `report_update` or `report_delete` with the confirmation fields.

### run

1. Call `report_run_create` for the report ID. No confirmation gate is needed for a run, but tell the user a run and each poll consume monthly API quota.

2. Poll `report_run_get` until status is `completed` or `failed`. Wait at least 30 seconds between polls; tell the user you are waiting rather than polling hot.

3. On completion, read the run's `flat_stats` first and present the headline numbers. Only call `report_run_results` if the user wants row-level detail (rows are positional arrays keyed by a columns list; join on ids, never on echoed text).

4. Offer `report_run_export` for a CSV download URL (signed, no auth needed, expires in 15 minutes; the download itself costs no quota).

## Safety rules (never break these)

- Do NOT call `report_create`, `report_update`, or `report_delete` without displaying the confirmation summary first and receiving explicit yes/y/confirm.

- Scheduling emails real people. Always show the recipient list in the confirmation summary when frequency is set.

- Do NOT fabricate a `confirmation_summary`. Derive it from what you actually showed the user.

- If the user's reply is ambiguous, ask for explicit confirmation again.
