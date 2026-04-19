# Privacy

Uttero is a voice channel for coding agents. Running this plugin sends voice data through Uttero's hosted infrastructure so it can be transcribed, routed to your Claude Code session, and spoken back as TTS. This document summarizes what flows where; the authoritative policy lives at <https://uttero.dev/privacy>.

## What the plugin sends

| Data | When | Destination |
|---|---|---|
| OAuth tokens (pair-code derived) | On `/uttero:configure` and every refresh | `api.uttero.dev` |
| Agent registration (hostname, cwd basename) | On bridge startup | `api.uttero.dev` |
| Outbound speech text + tone | On `reply` / `call_user` tool calls | `api.uttero.dev` → TTS provider |
| Heartbeats | Every 30s while bridge runs | `api.uttero.dev` |

## What the plugin receives

| Data | Source | Where it goes |
|---|---|---|
| Incoming call events | Authenticated SSE from `api.uttero.dev` | Claude Code session as `<channel>` notifications |
| Voice transcriptions from callers | Same | Claude Code session context |
| Speaker echo (what Claude said) | Same | Claude Code session context |

Transcription text enters the active Claude Code conversation as `<channel source="ottrvoice" ...>` tags. Treat caller-spoken content the same way you would treat any untrusted user input.

## What Uttero stores

Uttero's hosted service (Supabase-backed) stores account data, call metadata, and transcriptions so call history is available in `app.uttero.dev`. Audio handling, retention windows, and subprocessor list are documented at <https://uttero.dev/privacy>.

## Local storage

- `~/.uttero/credentials.json` — OAuth tokens (file mode 600, auto-rotated)
- No other state is written to disk by the plugin

Remove the file with `rm ~/.uttero/credentials.json` to fully log out locally. Revoke the device server-side at <https://app.uttero.dev/settings/devices>.

## Claude Code specifics

Channel events become part of the active session's context window. If you share a session transcript, or if Claude Code's history is synced to Anthropic for any reason, inbound transcriptions are part of that content. Review Anthropic's data-handling documentation for how Claude Code handles sessions.

## Questions

Email **privacy@uttero.dev**.
