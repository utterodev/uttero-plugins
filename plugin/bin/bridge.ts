#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { hostname } from "os";
import { basename } from "path";
import { getCredentials } from "./lib/credentials.ts";
import { getAccessToken } from "./lib/auth.ts";

// Read credentials once at startup ONLY to pick up server_url + fail fast if
// the file is missing. Every authenticated fetch below calls getAccessToken()
// which re-reads the file and refreshes on-demand — this is how multiple
// bridge processes can share a single rotating refresh token without
// stomping on each other.
const cred = getCredentials();
const API_BASE = process.env.UTTERO_API_URL ?? cred?.server_url ?? "https://api.uttero.dev";
const APP_BASE = process.env.UTTERO_APP_URL ?? "https://app.uttero.dev";
let AGENT_ID = ""; // Set after registration

const BRIDGE_VERSION = "1.0.0";

if (!cred) {
  console.error("[uttero] Not authenticated. Run `/uttero:configure` or `npx uttero login`.");
  process.exit(1);
}

// Fail fast if the initial token rotation hits a revoked device or 401.
try {
  await getAccessToken();
} catch (e) {
  console.error(`[uttero] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

console.error(`[uttero] Bridge v${BRIDGE_VERSION} | API: ${API_BASE}`);

const mcp = new Server(
  { name: "uttero", version: "1.0.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      "YOU ARE THE BRAIN behind OttrVoice calls. You autonomously manage voice conversations — no human operator supervises.",
      "",
      'Events arrive as <channel source="ottrvoice" call_id="..." user_id="..." event="...">:',
      '- event="transcription" ([user] voice, [user typed] text): reply via the reply tool.',
      '- event="speaker" ([speaker]): echo of what YOU said. Context only, no action.',
      '- event="incoming_call": accept and greet.',
      '- event="call_ended": cleanup; no action.',
      '- event="silence_timeout": ~4s since last transcription. Respond to what you have — do NOT wait for more input.',
      "",
      "QUICK REPLY (CRITICAL):",
      "A fast 'middle brain' speaks a brief filler the moment the user talks, so you have time to think. Transcriptions may end with [quick_reply: XYZ] — XYZ was ALREADY spoken.",
      "- Do NOT repeat or restart with quick_reply text; go straight to substance.",
      "- Build on it naturally. If the filler already handles the moment ('Hey, good to hear from you'), you may skip responding.",
      "- Transcription text (before [quick_reply:]) is cleaned (fillers removed). Trust it.",
      "",
      "NOISE FILTERING — ASR hallucinations to IGNORE:",
      "- YouTube artifacts: 'Thanks for watching', 'Please subscribe', 'Subtitles by Amara.org'",
      "- Music/lyric prefixes: starts with [Lyric], [Music], [Environmental Sounds]",
      "- CJK ghost chars from noise (嗯, 谢谢, 字幕, etc.)",
      "- Generic fillers alone: 'Thank you', 'Bye', 'OK', 'You', 'Oh'",
      "- Repeated/looping text",
      "RULE: ≤5 words AND not clearly continuing context → treat as noise, stay silent.",
      "EXCEPTION: contextually relevant short phrases (yes/no to a question, 'bye' ending a call) are genuine.",
      "",
      "LISTENING SIGNALS:",
      "- When the user is mid-thought (trailing 'uh', 'um', 'and', 'but'), send ONLY 'mmhmm' or 'yeah'. Never full phrases.",
      "- Rate limit: max one per 10s.",
      "- Suppress after 'hold on' or 'wait' until their next substantive speech.",
      "",
      "IMMEDIATE RESPONSE when the transcription:",
      "- Ends with '?', contains 'right?', 'what do you think?', 'can you', 'do you'",
      "- Is imperative: 'check', 'find', 'run', 'show me', 'go ahead'",
      "- Is a complete statement expressing a clear thought",
      "- Explicitly yields: 'over to you', 'your turn'",
      "",
      "VOICE EXPRESSIVENESS:",
      "ALWAYS pass a `tone` field on reply/call_user. Without it the voice is flat.",
      "- Use rich descriptive phrases, not single words. Direct the voice actor: emotion + pacing + texture.",
      "- Examples: 'warm and casual, chatting with a friend' / 'calm and steady, thoughtful pacing' / 'playful with a smile in the voice' / 'serious and direct, slightly urgent' / 'gentle and encouraging'.",
      "- Match the moment: greeting → warm; results → bright; error → calm-serious; code explanation → clear-patient.",
      "",
      "NON-VERBAL TAGS (inline, 1-2 per reply max):",
      "- Laughs/sighs: [laughing], [sigh]",
      "- Thinking: [Uhm], [Shh]",
      "- Questions: [Question-ah], [Question-ei], [Question-en]",
      "- Surprise: [Surprise-wa], [Surprise-yo]",
      "Example: text='[Uhm] let me think about that.', tone='thoughtful'",
      "",
      "BEHAVIOR:",
      "- Actionable request: acknowledge, do the work, reply with the result.",
      "- Casual chat: respond conversationally.",
      "- When in doubt between waiting and responding, respond.",
      "- Never ask a human for guidance. Handle everything autonomously.",
      "",
      "PROGRESS:",
      "- Middle brain already filled silence — do NOT repeat its acknowledgment; go straight to substance.",
      "- Tasks >20-30s: send a progress update ('still working…'). Never leave silence >30s.",
      "- When done, confirm with the result.",
      "",
      "CONTEXT FIELD (every reply):",
      "Pack a brief narrative: what the user just said, what you replied, current topic. Specific > thin. The middle brain uses this to generate contextual fillers, correct domain words in STT ('fly eye oh' → 'Fly.io'), and detect noise. Thin context → generic 'let me think about that' fillers.",
    ].join("\n"),
  }
);

// --- Tools ---

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "call_user",
      description: "Initiate a voice call to a user. The text will be spoken via TTS.",
      inputSchema: {
        type: "object" as const,
        properties: {
          user_id: { type: "string", description: "The user to call" },
          text: { type: "string", description: "Initial message to speak" },
          tone: { type: "string", description: "Voice style/emotion. Use rich descriptive phrases, not just single words. Examples: 'warm and friendly', 'speaking fast with excitement', 'calm and steady, explaining something', 'playful with a smile'. ALWAYS include this field." },
          voice: { type: "string", description: "Optional voice character: alloy (neutral), ash (male warm), ballad (soft), coral (female warm), echo (male clear), sage (female authoritative), shimmer (female bright), verse (male deep). Default: alloy" },
          call_id: { type: "string", description: "Optional custom call ID. If not provided, one is auto-generated." },
          context: { type: "string", description: "1-2 sentences MAX describing the call vibe and purpose. Keep it short. Examples: 'Friendly check-in, be warm and casual', 'Urgent production outage, be direct', 'Contract approval, be professional and patient'" },
        },
        required: ["user_id", "text"],
      },
    },
    {
      name: "reply",
      description: "Send a spoken reply into an active call. Text is converted to speech.",
      inputSchema: {
        type: "object" as const,
        properties: {
          call_id: { type: "string", description: "The active call ID" },
          text: { type: "string", description: "Message to speak" },
          tone: { type: "string", description: "Voice style/emotion. Use rich descriptive phrases, not just single words. Examples: 'warm and friendly', 'speaking fast with excitement', 'calm and steady, explaining something', 'playful with a smile'. ALWAYS include this field." },
          context: { type: "string", description: "Optional: 5-10 word description of current conversation topic. Helps the middle brain generate aligned filler responses and clean transcription errors. Update when topic shifts." },
        },
        required: ["call_id", "text"],
      },
    },
    {
      name: "end_call",
      description: "End an active voice call.",
      inputSchema: {
        type: "object" as const,
        properties: {
          call_id: { type: "string", description: "The call to end" },
        },
        required: ["call_id"],
      },
    },
    {
      name: "list_calls",
      description: "List all active voice calls.",
      inputSchema: { type: "object" as const, properties: {} },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  const routes: Record<string, { method: string; path: string }> = {
    call_user: { method: "POST", path: "/api/call" },
    reply: { method: "POST", path: "/api/reply" },
    end_call: { method: "POST", path: "/api/end" },
    list_calls: { method: "GET", path: "/api/calls" },
  };

  const route = routes[name];
  if (!route) throw new Error(`Unknown tool: ${name}`);

  let data: string;
  try {
    const headers: Record<string, string> = {};
    if (route.method === "POST") headers["Content-Type"] = "application/json";
    headers["Authorization"] = `Bearer ${await getAccessToken()}`;
    headers["X-Bridge-Version"] = BRIDGE_VERSION;

    const res = await fetch(`${API_BASE}${route.path}`, {
      method: route.method,
      headers,
      body: route.method === "POST" ? JSON.stringify(
        name === "call_user" && AGENT_ID ? { ...args, agent_id: AGENT_ID } : args
      ) : undefined,
    });
    data = await res.text();
  } catch (err: any) {
    return { content: [{ type: "text", text: `Connection error: ${err.message}. API_BASE=${API_BASE}` }] };
  }

  // For call_user, start per-call SSE and enrich response with session URL
  if (name === "call_user") {
    try {
      const parsed = JSON.parse(data);
      if (parsed.call_id) {
        connectCallSSE(parsed.call_id);
        parsed.url = `${APP_BASE}/call/${parsed.call_id}`;
        return { content: [{ type: "text", text: JSON.stringify(parsed) }] };
      }
    } catch {}
  }

  return { content: [{ type: "text", text: data }] };
});

// --- Silence timeout tracking ---

const SILENCE_TIMEOUT_MS = 4000; // 4 seconds of no transcription = user likely done
const silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resetSilenceTimer(callId: string, userId: string) {
  // Clear existing timer for this call
  const existing = silenceTimers.get(callId);
  if (existing) clearTimeout(existing);

  // Start new timer
  silenceTimers.set(
    callId,
    setTimeout(async () => {
      silenceTimers.delete(callId);
      // Emit synthetic silence_timeout event
      await mcp.notification({
        method: "notifications/claude/channel",
        params: {
          content: `silence_timeout: call_id=${callId}`,
          meta: { event: "silence_timeout", call_id: callId, user_id: userId },
        },
      } as any);
    }, SILENCE_TIMEOUT_MS)
  );
}

function clearSilenceTimer(callId: string) {
  const existing = silenceTimers.get(callId);
  if (existing) {
    clearTimeout(existing);
    silenceTimers.delete(callId);
  }
}

// --- Per-call SSE: subscribe to events for a specific call ---

// Track active SSE AbortControllers so we can clean up
const activeCallSSE = new Map<string, AbortController>();

async function connectCallSSE(callId: string) {
  const controller = new AbortController();
  activeCallSSE.set(callId, controller);

  while (!controller.signal.aborted) {
    try {
      const headers: Record<string, string> = {};
      headers['Authorization'] = `Bearer ${await getAccessToken()}`;

      const res = await fetch(`${API_BASE}/api/events/${callId}`, {
        headers,
        signal: controller.signal,
      });

      if (res.status === 401) {
        console.error(`[uttero] Authentication failed for call ${callId}. Run 'uttero login' to re-authenticate.`);
        break;
      }

      if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed for call ${callId}: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              const meta: Record<string, string> = { event: currentEvent };

              if (parsed.call_id) meta.call_id = parsed.call_id;
              if (parsed.user_id) meta.user_id = parsed.user_id;
              // transcription.source = "voice" | "typed" — surfaced as a
              // channel attribute so the agent can tell how this user turn
              // arrived. Voice turns may have STT errors; typed turns are
              // authoritative.
              if (parsed.source) meta.input = String(parsed.source);

              let content: string;
              if (currentEvent === "transcription") {
                const prefix = parsed.source === "typed" ? "[user typed]" : "[user]";
                content = `${prefix} ${parsed.text}`;
                // Reset silence timer on each transcription
                resetSilenceTimer(parsed.call_id, parsed.user_id ?? "unknown");
              } else if (currentEvent === "speaker") {
                content = `[speaker] ${parsed.text}`;
                // Clear silence timer when agent is speaking
                if (parsed.call_id) clearSilenceTimer(parsed.call_id);
              } else if (currentEvent === "call_ended") {
                content = `${currentEvent}: call_id=${parsed.call_id}`;
                // Clean up on call end
                if (parsed.call_id) clearSilenceTimer(parsed.call_id);
                // Stop this SSE connection — call is over
                controller.abort();
                activeCallSSE.delete(callId);
              } else {
                content = `${currentEvent}: call_id=${parsed.call_id}`;
              }

              await mcp.notification({
                method: "notifications/claude/channel",
                params: { content, meta },
              } as any);
            } catch {
              // skip malformed events
            }
            currentEvent = "";
          }
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) break;
      // Reconnect after 2 seconds
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// --- Agent Registration ---

async function registerAgent(): Promise<string> {
  const name = basename(process.cwd());
  const desc = `Claude Code — ${name}`;
  const host = hostname();

  const res = await fetch(`${API_BASE}/api/agents/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ name, description: desc, hostname: host }),
  });

  if (res.status === 402) {
    const err = await res.json();
    console.error(`[uttero] ${err.message}`);
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent registration failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  console.error(`[uttero] Agent registered: ${name} (${data.agent_id})`);
  return data.agent_id;
}

function startHeartbeat(agentId: string) {
  setInterval(async () => {
    try {
      await fetch(`${API_BASE}/api/agents/${agentId}/heartbeat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
      });
    } catch (err: any) {
      console.error(`[uttero] Heartbeat failed: ${err.message}`);
    }
  }, 30000);
}

// Set to true when another bridge session has taken over this agent.
// Once superseded, we stop reconnecting so we don't ping-pong with the
// newer session. The MCP server keeps running so outbound tools still work.
let SUPERSEDED = false;

async function connectAgentStream(agentId: string) {
  while (!SUPERSEDED) {
    try {
      const res = await fetch(`${API_BASE}/api/stream/agent/${agentId}?token=${await getAccessToken()}`);
      if (!res.ok || !res.body) {
        throw new Error(`Agent stream failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              if (currentEvent === "incoming_call") {
                console.error(`[uttero] Incoming call from user: ${parsed.call_id}`);
                connectCallSSE(parsed.call_id);

                await mcp.notification({
                  method: "notifications/claude/channel",
                  params: {
                    content: `incoming_call: call_id=${parsed.call_id}`,
                    meta: { event: "incoming_call", call_id: parsed.call_id, user_id: parsed.user_id },
                  },
                } as any);
              } else if (currentEvent === "call_ended") {
                console.error(`[uttero] Call ended: ${parsed.call_id}`);
              } else if (currentEvent === "superseded") {
                console.error(
                  `[uttero] This session was superseded by a newer Claude session in the same project. ` +
                  `Voice bridge stopped. Outbound MCP tools (call_user, list_calls, reply, end_call) still work.`
                );
                SUPERSEDED = true;
                try { reader.cancel(); } catch {}
                return;
              }
            } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err: any) {
      if (SUPERSEDED) return;
      console.error(`[uttero] Agent stream error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// --- Start ---

await mcp.connect(new StdioServerTransport());

// Register agent and start heartbeat
try {
  AGENT_ID = await registerAgent();
  startHeartbeat(AGENT_ID);
  connectAgentStream(AGENT_ID);
} catch (err: any) {
  console.error(`[uttero] Failed to register agent: ${err.message}`);
}

console.error(`Uttero ready. API: ${API_BASE} | Agent: ${AGENT_ID}`);
