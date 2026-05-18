---
description: Diagnose Spiffy plugin configuration. Checks every API key source and reports exactly what is wrong and how to fix it.
---

You are executing the /spiffy-doctor slash command. Spiffy tools may be failing or entirely missing because the MCP server could not load a valid API key at startup. Your job is to find the exact cause and tell the user precisely how to fix it. Be concrete. Never guess.

## Background, how config loading actually works

The Spiffy MCP server resolves its API key at startup, in this order.

1. The `SPIFFY_API_KEY` environment variable. Either a literal 64-character hex key, or a 1Password `op://` reference.

2. If that is unset, the TOML file at `~/.config/spiffy-plugin/config.toml`, which must contain `api_key = "your_key"` in TOML syntax.

If neither yields a key, startup fails and zero Spiffy tools register. If `config.toml` exists but is dotenv syntax (`SPIFFY_API_KEY=...`), invalid TOML, or has no `api_key` field, the server now fails loudly with a specific error that names the file and the reason. There is no dotenv loader. A repo-root `.env` only feeds the dev-only `npm run smoke` script, never the installed plugin.

## Workflow, execute in order

1. **Try the live path first.** If a Spiffy `account_get` tool is available, call it.

   - If it succeeds, configuration is healthy. Report the account name and id returned, give a green status, and stop. Nothing else to do.

   - If it returns an authentication or authorization error, the key loaded but Spiffy rejected it. Tell the user the key was found but is invalid or revoked, and to verify it in the Spiffy dashboard under Settings - API. Stop.

2. **If no Spiffy tool is available at all,** the server failed to start, which means config loading threw. Continue diagnosing.

3. **Check the environment variable.** Run `printenv SPIFFY_API_KEY` via Bash.

   - If set and it starts with `op://`, it is a 1Password reference. Resolution needs the `op` CLI installed and signed in. Suggest the user test it with `op read "<the reference>"`.

   - If set and non-empty otherwise, the key is present in the environment, so the failure is likely an invalid key value rather than a missing one. Report this.

   - If unset, continue.

4. **Inspect the TOML fallback file.** Check whether `~/.config/spiffy-plugin/config.toml` exists via Bash (`ls -l` then read it).

   - If it does not exist and the env var is unset, that is the whole problem. The user has not configured a key at all. Give them the two correct options verbatim, the `SPIFFY_API_KEY` env var, or creating the TOML file with `api_key = "..."`.

   - If it exists, read it and classify the content.

     - Contains `SPIFFY_API_KEY=` or other `KEY=value` dotenv lines. This is the most common mistake. The file is dotenv but `config.toml` must be TOML. Tell the user to replace the entire file with exactly `api_key = "their_actual_key"` (TOML, quoted, the key literally named `api_key`).

     - Parses as TOML but has no `api_key` line (for example only `base_url`, or a differently named key). Tell them to add `api_key = "their_actual_key"`.

     - Looks correct already (`api_key = "..."`) but tools still fail. The key value itself is probably wrong or revoked. Point them to the Spiffy dashboard.

5. **Surface the real startup error if possible.** The server's specific error goes to stderr. Tell the user they can see it by reloading the plugin or restarting Claude Code and checking the MCP server logs, and describe the shape of the new error so they recognise it (it names the `config.toml` path and the specific reason).

6. **Report.** Give one concrete summary, what you checked, what you found, and the single exact fix to apply. No vague advice.

## Safety rules

- This command is read-only. Do NOT write, move, or delete `config.toml` or `.env` for the user. Show them the exact content to put there and let them apply it themselves.

- Do NOT print the full API key value into the transcript. If you read a key, state that it is present and show at most the first 4 and last 4 characters.

- Do NOT fabricate an account result. Only report what `account_get` actually returned.
