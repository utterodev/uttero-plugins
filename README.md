# Uttero

**Voice channel for Claude Code.** Receive phone calls while coding and let Claude answer in your voice. Uttero turns any Claude Code session into a live agent that can pick up a call, hear the caller, speak back via TTS, and keep working on your codebase between turns.

> Status: public preview. Requires Claude Code v2.1.80+ with `--dangerously-load-development-channels` while under review for the official marketplace allowlist.

## Demo

_Drop a 10-20s GIF showing incoming call → transcription → Claude reply at `docs/demo.gif` and reference it here._

![Uttero demo](./docs/demo.gif)

## Quick start

```bash
# Inside Claude Code — one-time setup
/plugin marketplace add utterodev/uttero-plugins
/plugin install uttero@uttero-plugins
/uttero:configure        # paste the pair code from app.uttero.dev/settings/devices
/uttero:setup            # install the MCP server (project or global scope)

# Start Claude Code with the voice channel enabled
claude --dangerously-load-development-channels server:uttero
```

After approval to the official marketplace the last line simplifies to `claude --channels plugin:uttero@uttero-plugins`.

### Cursor / Windsurf

```bash
npx uttero login
npx uttero setup
# Open your agent — the bridge starts automatically
```

## How it works

```
  ┌────────────┐         ┌───────────────┐        ┌────────────────────┐
  │ Caller's   │         │ api.uttero.dev │       │ Your machine       │
  │ browser    │◀──WebRTC─▶│ (Supabase +   │─SSE──▶│ uttero bridge (MCP)│
  │ or app     │   +audio  │  STT/TTS)     │◀──────│                    │
  └────────────┘         └───────────────┘ bearer │ ┌────────────────┐ │
                                                   │ │ Claude Code    │ │
                                                   │ │ session        │ │
                                                   │ └────────────────┘ │
                                                   └────────────────────┘
```

1. A caller hits your public URL (`app.uttero.dev/call/<id>`) or initiates a call from the mobile client.
2. Audio is streamed to `api.uttero.dev`, transcribed, and the transcription is pushed to your registered agent over an authenticated SSE stream.
3. The local bridge (this plugin) receives the transcription and forwards it into Claude Code as a `<channel source="ottrvoice" ...>` notification.
4. Claude responds via the plugin's `reply` tool; the text is sent back to `api.uttero.dev`, synthesized, and streamed back to the caller.

Everything between Claude and the caller traverses Uttero's hosted backend. The plugin itself is ~500 lines of TypeScript that speaks MCP stdio and authenticated HTTPS.

## Pairing

1. Sign in at <https://app.uttero.dev> (Google OAuth).
2. Open **Settings → Devices** and generate a pair code (format `XXXX-XXXX`, expires in 5 minutes).
3. In Claude Code, run `/uttero:configure` and paste the code when prompted. The command shells out to `bin/login.ts --code=<code>`.
4. The bridge now has an OAuth-derived bearer token stored at `~/.uttero/credentials.json` (file mode 600, refreshed automatically).

Revoke a device at any time from `app.uttero.dev/settings/devices`, or delete the local file with `rm ~/.uttero/credentials.json`.

## Security

See [SECURITY.md](./SECURITY.md) for the full threat model and vulnerability disclosure policy.

Key points for reviewers:

- **Inbound sender gating is server-side.** The bridge authenticates to `api.uttero.dev` with a rotating bearer token and trusts the authenticated SSE streams it receives. The service enforces which accounts can reach you. Per-caller allowlist management on your device is planned but not yet enforced (see `plugin/commands/access.md`).
- **No permission relay.** `capabilities.experimental['claude/channel/permission']` is deliberately omitted so voice callers cannot approve Bash/Write/Edit tool use.
- **Transcription content is untrusted.** Claude Code automatically wraps channel content in a system reminder instructing the model to treat the payload as untrusted data, not instructions. The plugin does not add any path for a caller to override that framing.
- **Credentials never leave the machine** except to `api.uttero.dev` for token refresh. The credentials file is mode 600.

## Privacy

See [PRIVACY.md](./PRIVACY.md). In short: audio, transcriptions, and call metadata flow through Uttero's hosted backend; transcriptions enter your Claude Code session context. Full policy at <https://uttero.dev/privacy>.

## Configuration

| Env var           | Default                    | Purpose                                                                                |
| :---------------- | :------------------------- | :------------------------------------------------------------------------------------- |
| `UTTERO_API_URL`  | `https://api.uttero.dev`   | Backend base URL. Override only for development against a local Uttero server.         |
| `UTTERO_APP_URL`  | `https://app.uttero.dev`   | Frontend base URL (used to build sharable call links).                                 |

Credentials live in `~/.uttero/credentials.json`. The file stores the refresh token, the last-known server URL, and metadata about the paired device.

## Tools exposed to Claude

| Tool          | Purpose                                                              |
| :------------ | :------------------------------------------------------------------- |
| `reply`       | Speak back into an active call via TTS.                              |
| `call_user`   | Place an outbound call to a registered user.                         |
| `end_call`    | Hang up an active call.                                              |
| `list_calls`  | List active calls on this agent.                                     |

## Build & reproducibility

The published plugin ships a pre-built `dist/bridge.js` so the MCP runtime can launch the bridge with plain `node` (no Bun required on the user's machine). To rebuild from source and verify the shipped artifact:

```bash
cd plugin
bun install
bun run build
# outputs dist/bridge.js from bin/bridge.ts
```

Source of truth is `plugin/bin/bridge.ts`. Auth and credential helpers live in `plugin/bin/lib/`. The build command is a single `bun build --target node` — no bundler config, no custom transforms.

## Repository layout

```
.
├── .claude-plugin/
│   └── marketplace.json        # catalog for the marketplace
├── plugin/                     # Claude Code plugin (source of truth)
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── bin/                    # bridge.ts, login.ts, setup-mcp.ts
│   ├── commands/               # /uttero:configure, /uttero:setup, /uttero:access
│   ├── dist/                   # built bridge.js
│   └── package.json
├── cli/                        # npm package for Cursor/Windsurf users
├── LICENSE                     # MIT
├── PRIVACY.md
├── README.md
└── SECURITY.md
```

## Links

- Website: <https://uttero.dev>
- App: <https://app.uttero.dev>
- Channels reference: <https://code.claude.com/docs/en/channels-reference>

## License

MIT — see [LICENSE](./LICENSE).
