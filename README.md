# Uttero Plugins

Voice channel for coding agents. Two distribution paths:

- **Claude Code** — install as a plugin, no npm required
- **Cursor / Windsurf** — install via npm (`npx uttero`)

## Claude Code

```bash
# Inside Claude Code — one-time setup
/plugin marketplace add utterodev/uttero-plugins
/plugin install uttero@uttero-plugins
/uttero:configure    # sign in via Google OAuth
/uttero:setup        # install MCP server (project or global)

# Start with voice channel (every session)
claude --dangerously-load-development-channels server:uttero
```

## Cursor / Windsurf

```bash
npx uttero login
npx uttero setup
# Open your agent — bridge starts automatically
```

## Repository Structure

- `plugin/` — Claude Code plugin (source of truth for bridge + auth)
- `cli/` — npm package for Cursor/Windsurf
