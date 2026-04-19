# Recording the demo GIF

Quick guide to produce `docs/demo.gif` — the short asset embedded at the top of the README. Optimized for a marketplace reviewer watching it once, at 1x, without sound.

## Scenario: "Call while coding"

A 20-second clip that shows Claude mid-task, accepting a voice call, answering in voice with substance, and going back to work. Single clip, no cuts, no voiceover.

Why this scenario:

- Shows the **value prop** (voice doesn't interrupt your flow) in one frame
- Shows the channel **lifecycle** end-to-end (`incoming_call` → transcription → `reply` → `call_ended`)
- Shows **authenticated sender identity** (`user_id` attribute)
- Shows a **substantive reply** grounded in session context — not a canned "hello"

## Setup

- Run Claude Code in a 1000×600 terminal window against a scratch project. Command: `claude --channels plugin:uttero@uttero-plugins` once we're on the allowlist; during review, `claude --dangerously-load-development-channels server:uttero`.
- Scrollback must be clean — no secrets, no unrelated commands.
- Split layout, ⅔ terminal on the left, ⅓ iPhone screen mirror on the right (QuickTime → Movie Recording → iPhone as source).
- Make sure at least one `<channel ... user_id="...">` tag is visible in the terminal. Authenticated sender identity is a key trust signal.

## Shot list (~20 seconds)

| t        | Terminal                                                                              | Phone                       | Why it's in the cut                          |
| :------- | :------------------------------------------------------------------------------------ | :-------------------------- | :------------------------------------------- |
| 0-2 s    | Claude mid-task: a `Read` + `Edit` is underway on a real file                         | Idle lock screen            | Establishes real coding context              |
| 2-4 s    | `<channel event="incoming_call" user_id="alent@…">`                                   | Incoming call UI            | Shows authenticated sender + channel event   |
| 4-6 s    | `reply` tool call with `text: "Hey, I'm here — what's up?"` and a `tone` field        | In-call screen (live wave)  | Shows the reply tool and TTS in motion       |
| 6-12 s   | `[user] how's the deploy going?` → Claude's substantive reply ("tests are green…")    | Voice waveform animating    | Shows real conversation, not canned content  |
| 12-16 s  | `<channel event="call_ended">`                                                        | Call summary                | Shows clean lifecycle                        |
| 16-20 s  | Claude resumes the `Edit` it was doing before the call                                | Home screen                 | Proves the session wasn't clobbered          |

## Rules of thumb

**Do**

- Use the real app, real Claude Code, real voice. Reviewers spot fakes.
- Keep natural conversation timing. No audio speed-up.
- Show `user_id` in the channel tag at least once.
- End on a clean `call_ended` event and Claude resuming work.

**Don't**

- Show the pair-code exchange — that's onboarding, not product value.
- Include any Bash/Write/Edit tool approval during the call — consistent with SECURITY.md claim that permission relay is intentionally off.
- Add chrome, overlays, or annotations. The terminal and phone are self-explanatory.
- Leak secrets from the project scrollback or the phone's notification shade.

## Capture + encode

Record 60 s raw, then trim and encode:

```bash
# 1. Trim the raw clip to the 20 s window
ffmpeg -i raw.mov -ss 00:00:04 -t 20 -r 15 -vf "scale=960:-2" trimmed.mp4

# 2. Build a palette for crisp colors
ffmpeg -i trimmed.mp4 -vf "fps=15,scale=960:-2,palettegen" palette.png

# 3. Encode the final GIF with the palette
ffmpeg -i trimmed.mp4 -i palette.png \
  -lavfi "fps=15,scale=960:-2[x];[x][1:v]paletteuse" \
  docs/demo.gif
```

Target: under 5 MB so GitHub inlines it on the README.

Optional: also ship `docs/demo.mp4` (same clip, higher quality) for anyone who wants the original — GIFs lose color depth on gradients.

## Commit

```bash
git add docs/demo.gif docs/demo.mp4
git commit -m "docs: add demo gif"
git push
```

Then bump the submodule ref in the parent repo as usual.
