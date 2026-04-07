# Uttero Plugins

Voice channel for coding agents. Two distribution paths:

- **Claude Code** — install as a plugin, no npm required
- **Cursor / Windsurf** — install via npm (`npx uttero`)

## Claude Code

```bash
# Inside Claude Code
/plugin marketplace add utterodev/uttero-plugins
/plugin install uttero@uttero-plugins
/uttero:configure

# Start with voice channel
claude --channels plugin:uttero@uttero-plugins
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
