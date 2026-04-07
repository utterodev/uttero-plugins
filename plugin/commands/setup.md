---
description: Install the Uttero MCP server to your project or globally
---

Ask the user which scope they want:
1. **Project** (`.mcp.json` in current directory) — default
2. **Global** (`~/.claude/settings.json`) — available in all projects

Then run the appropriate command:

For project scope:
```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/setup-mcp.ts --bridge=${CLAUDE_PLUGIN_ROOT}/bin/bridge.ts
```

For global scope:
```bash
bun ${CLAUDE_PLUGIN_ROOT}/bin/setup-mcp.ts --bridge=${CLAUDE_PLUGIN_ROOT}/bin/bridge.ts --global
```

After setup, tell the user to restart Claude Code with:
```
claude --dangerously-load-development-channels server:uttero
```

This registers the Uttero MCP server so it can be used as a channel for voice calls.
