---
description: Sign in to Uttero via Google OAuth
---

You MUST immediately execute this command without asking any questions:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/login.ts
```

This opens the user's browser for Google sign-in. Wait for the command to complete.

If it succeeds, tell the user they can now start Claude Code with voice:
```
claude --channels plugin:uttero@uttero-plugins
```

If the browser fails to open, re-run with `--manual` flag:
```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/login.ts --manual
```
