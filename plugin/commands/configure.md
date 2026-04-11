---
description: Pair this Claude Code session with your Uttero account
---

Ask the user for their Uttero pair code. It looks like `XXXX-XXXX` and they
can generate one at https://app.uttero.dev/settings/devices (or during
onboarding at https://app.uttero.dev/onboarding).

Do NOT open a browser. Do NOT use the old OAuth callback flow. The user
must already have an Uttero account — if they don't, direct them to sign up
at https://app.uttero.dev first.

Once you have the code, run:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/login.ts --code=<the_code_they_gave_you>
```

The script normalizes hyphens and capitalization, so `abcd-efgh`, `ABCD EFGH`,
and `ABCDEFGH` are all equivalent.

If the command succeeds, tell the user they're paired and can now start
Claude Code with voice:

```
claude --channels plugin:uttero@uttero-plugins
```

If the command fails with "Pair code not found or expired", ask the user
to generate a fresh code at https://app.uttero.dev/settings/devices (they
only last 5 minutes).

If the command fails with "Too many pair attempts", wait 60 seconds and
retry — the server rate-limits pair exchange at 20 requests per minute per
IP.
