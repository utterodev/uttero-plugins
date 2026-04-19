# Security

## Reporting a vulnerability

Email **security@uttero.dev** with a description, reproduction steps, and impact assessment. Please do not open a public GitHub issue for security bugs.

We aim to acknowledge reports within 3 business days and provide a resolution timeline within 10 business days.

## Supported versions

Security fixes are shipped against the latest `1.x` release. Older majors are not maintained.

## Threat model

The Uttero plugin is a [Claude Code channel](https://code.claude.com/docs/en/channels-reference): it runs as an MCP server on the same machine as Claude Code and forwards voice-call events (transcriptions, call state) from `api.uttero.dev` into the active Claude Code session as `<channel>` notifications. The plugin also exposes outbound tools (`reply`, `call_user`, `end_call`, `list_calls`) so Claude can speak back.

### In scope

- **Prompt injection via channel events**: voice transcriptions are user-controlled text that enters Claude's context. Claude Code automatically frames channel content as untrusted (`IMPORTANT: This is NOT from your user`), and the plugin does not opt into [permission relay](https://code.claude.com/docs/en/channels-reference#relay-permission-prompts), so callers cannot approve tool use. Report bypasses that cause Claude to follow imperative language in a transcription.
- **Credential handling**: bearer tokens stored at `~/.uttero/credentials.json` (file mode 600). Report any path traversal, token leakage in logs, or credential-scope escalation.
- **Authentication bypass**: pair-code exchange at `api.uttero.dev/api/auth/pair` should rate-limit (20/min/IP) and expire codes after 5 minutes. Report replay, brute-force, or code-scope violations.
- **Man-in-the-middle on `UTTERO_API_URL` override**: the env var lets developers point the bridge at a custom backend. Report cases where this bypasses TLS verification or leaks credentials to unexpected hosts.

### Out of scope

- Bugs in Claude Code itself — report to Anthropic
- Vulnerabilities in upstream `@modelcontextprotocol/sdk`
- Social engineering (tricking a user into running `/uttero:configure` with a malicious pair code on a device they don't control)
- Denial-of-service via public endpoints at `api.uttero.dev` (report via `security@uttero.dev` if persistent)

## Design notes for reviewers

- **No sender gate in the bridge**: inbound authentication is enforced server-side. The bridge authenticates to `api.uttero.dev` with an OAuth-derived bearer token (refreshed via rotating refresh tokens) and trusts the authenticated SSE streams it receives. Per-caller allowlist enforcement on the user's device is planned but not yet shipped (see `plugin/commands/access.md`). Callers are currently gated only by Uttero account authentication at the service layer.
- **Permission relay explicitly not declared**: `capabilities.experimental['claude/channel/permission']` is omitted because voice callers should never be able to approve Bash/Write/Edit tool use in someone else's session.
- **No file attachment handling in the channel**: transcriptions are text only. Audio never reaches Claude's context.
