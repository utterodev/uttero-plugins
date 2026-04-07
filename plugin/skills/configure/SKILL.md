---
name: configure
description: Authenticate with Uttero via Google OAuth. Use when the user needs to sign in, re-authenticate, or set up Uttero for the first time.
---

# Uttero Authentication

Run the login script to authenticate via Google OAuth:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/login.ts
```

This opens your browser for Google sign-in. After consent, credentials are saved to `~/.uttero/credentials.json`.

**If the browser doesn't open** (headless/SSH environment), use manual mode:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/login.ts --manual
```

This prompts you to paste a token directly.

**After login**, restart Claude Code with the voice channel enabled:

```bash
claude --channels plugin:uttero@uttero-plugins
```
