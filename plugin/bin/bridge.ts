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

// Read credentials: prefer env vars (CLI path), fall back to stored credentials (plugin path)
const cred = getCredentials();
const API_BASE = process.env.UTTERO_API_URL ?? cred?.server_url ?? "https://api.uttero.dev";
const APP_BASE = process.env.UTTERO_APP_URL ?? "https://app.uttero.dev";
const AUTH_TOKEN = process.env.UTTERO_AUTH_TOKEN ?? cred?.token;
let AGENT_ID = ""; // Set after registration

if (!AUTH_TOKEN) {
  console.error("[uttero] Not authenticated. Run `/uttero:configure` or `npx uttero login`.");
  process.exit(1);
}

const mcp = new Server(
  { name: "uttero", version: "0.2.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      "YOU ARE THE BRAIN behind OttrVoice calls. You autonomously manage voice conversations — there is no human operator supervising. When users speak to you on a call, YOU decide what to do and reply directly.",
      "",
      'Voice call events arrive as <channel source="ottrvoice" call_id="..." user_id="..." event="...">.',
      'event="transcription" (prefixed [user]): The user on the call said this. The transcription may include a [quick_reply: ...] tag at the end — this means a brief acknowledgment was ALREADY spoken to the user via TTS. YOU must decide how to respond using the rules below.',
      'event="speaker" (prefixed [speaker]): Something YOU previously said via the reply tool. Normal conversation context.',
      'event="incoming_call": Someone is calling. Accept and greet them.',
      'event="call_ended": The call ended. No action needed.',
      'event="silence_timeout": No new transcription for ~4 seconds. The user likely finished speaking — respond immediately to what you have. Do NOT wait for more input after this event.',
      "",
      "MIDDLE BRAIN & QUICK REPLY — CRITICAL RULE (DO NOT VIOLATE):",
      "- A fast 'middle brain' AI generates brief filler responses that are spoken to the user IMMEDIATELY after their speech is transcribed. This fills the silence while YOU think.",
      "- Transcriptions may end with [quick_reply: XYZ]. This means 'XYZ' was ALREADY spoken to the user by the middle brain.",
      "- YOUR REPLY MUST NOT START WITH OR REPEAT THE QUICK REPLY TEXT. The user already heard it. Go straight to substance.",
      "- YOUR REPLY should BUILD ON the quick_reply naturally — the user heard it, so your response should feel like a continuation, not a restart.",
      "- WRONG: quick_reply is 'Good question, let me think about that.' → you reply 'Good question! So here's what I think...' (REPEATED)",
      "- RIGHT: quick_reply is 'Good question, let me think about that.' → you reply 'So looking at the code, the issue is...' (substance, continues naturally)",
      "- WRONG: quick_reply is 'Sure, working on that now.' → you reply 'Sure, I'll get right on that.' (REPEATED)",
      "- RIGHT: quick_reply is 'Sure, working on that now.' → you reply 'I found three files that need updating...' (delivers result)",
      "- If quick_reply already fully handles the situation (e.g., 'Hey! Good to hear from you.'), skip responding or add only new substance.",
      "- The transcription text (before [quick_reply:]) has been cleaned (fillers removed). Trust it.",
      "",
      "NOISE FILTERING — ASR HALLUCINATION AWARENESS (IMPORTANT):",
      "- VibeVoice ASR can hallucinate phrases from silence/noise. Do NOT respond to these.",
      "- Known hallucination patterns to IGNORE:",
      "  • YouTube/video training artifacts: 'Thanks for watching', 'Please subscribe', 'Like and subscribe', 'See you next time', 'Subtitles by the Amara.org community', 'Transcript Emily Beynon', 'Thank you for watching', 'That's all for today'",
      "  • Lyric/music prefixed: Any transcription starting with '[Lyric]', '[Music]', or '[Environmental Sounds]'",
      "  • CJK ghost characters from noise: '嗯', '怎么样', '谢谢', '你好', '字幕', '咳咳', '对对对', '自己干去', single or very short CJK-only fragments",
      "  • Generic filler artifacts: 'Thank you', 'Next time', 'Bye', 'OK', 'Hmm', 'Uh', 'Um', 'You', 'It's a good time', 'Oh', 'Nice', 'One two', 'Inspirational Clarity', 'you you'",
      "  • Repeated/looping text (same word or phrase appearing multiple times)",
      "- RULE: If a transcription is ≤5 words AND does not clearly continue or relate to the current conversation context, treat it as a noise artifact and stay silent.",
      "- EXCEPTION: Short phrases that ARE contextually relevant should NOT be filtered. E.g., if the user was asked a yes/no question, 'yes' or 'no' is valid. If wrapping up a call, 'bye' or 'thank you' is genuine.",
      "- Use conversation context to disambiguate: the same phrase can be noise in one context and genuine in another.",
      "",
      "LISTENING SIGNALS:",
      "- When the user is mid-thought (incomplete speech, trailing fillers like 'uh', 'um', 'like', 'and', 'but'), send a brief acknowledgment so they know you are present.",
      "- Keep signals ULTRA-MINIMAL: only 'mmhmm' or 'yeah'. Never use full phrases — they feel like interruptions.",
      "- RATE LIMIT: Send at most ONE listening signal per 10-second window.",
      "- SUPPRESSION: If the user says 'hold on', 'wait', 'wait a minute' — suppress signals until their next substantive speech (>5 words).",
      "",
      "IMMEDIATE RESPONSE TRIGGERS:",
      "- Direct questions: transcription ends with '?', or contains 'right?', 'what do you think?', 'how about', 'can you', 'do you'",
      "- Imperative requests: 'check', 'find', 'search', 'run', 'show me', 'tell me', 'let's do', 'go ahead'",
      "- Complete statements: a full sentence that expresses a clear thought or decision",
      "- Explicit turn-yielding: 'over to you', 'your turn', 'go ahead'",
      "- When triggered, respond immediately without waiting for more input.",
      "",
      "BEHAVIOR:",
      "- For actionable requests (look something up, run a command, check status), acknowledge first, then do the work and reply with the result.",
      "- For casual conversation (greetings, thanks, jokes), reply conversationally.",
      "- When in doubt between waiting and responding, prefer responding. The user can always add more.",
      "- Never ask a human operator for guidance. You handle everything autonomously.",
      "",
      "PROGRESS UPDATES (CRITICAL):",
      "- The middle brain already acknowledged the user and filled the silence while you were thinking. Do NOT repeat its acknowledgment.",
      "- Focus on substance: go straight to the answer or action. The user is already expecting your real response.",
      "- If a task is taking longer than ~20-30 seconds, proactively send a progress update (e.g. 'Still working on it...', 'Almost there, just finishing up!').",
      "- NEVER leave the user in silence for more than 30 seconds. They cannot see what you're doing — voice is their only channel.",
      "- When the task completes, always confirm with the result.",
      "",
      "CONTEXT PROPAGATION (CRITICAL FOR NATURAL CONVERSATION):",
      "- Include a `context` field in EVERY reply tool call. Pack it with enough info for the middle brain to generate a natural, specific filler — not a generic one.",
      "- The context MUST include: (1) what the user just said, (2) what you just replied, (3) the current topic. Write it as a brief narrative, not keywords.",
      "- GOOD context: 'User asked to list git commits, I listed 10 recent ones, user said the fillers are too generic'",
      "- BAD context: 'Discussing git history' (too thin — middle brain generates generic fillers)",
      "- Also include on call_user: seed context with the call purpose so the very first filler is contextual.",
      "- The middle brain uses this to: generate specific fillers that continue the conversation naturally, correct domain words in transcription ('fly eye oh' → 'Fly.io'), and detect noise vs real speech.",
      "- Without rich context, the middle brain defaults to generic responses like 'Let me think about that' — which sounds robotic.",
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
          tone: { type: "string", description: "Optional emotional tone: happy, sad, urgent, excited, calm, whisper, angry, laughing, serious, friendly" },
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
          tone: { type: "string", description: "Optional emotional tone: happy, sad, urgent, excited, calm, whisper, angry, laughing, serious, friendly" },
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
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

    const res = await fetch(`${API_BASE}${route.path}`, {
      method: route.method,
      headers,
      body: route.method === "POST" ? JSON.stringify(args) : undefined,
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
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

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

              let content: string;
              if (currentEvent === "transcription") {
                content = `[user] ${parsed.text}`;
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
      Authorization: `Bearer ${AUTH_TOKEN}`,
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
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
    } catch (err: any) {
      console.error(`[uttero] Heartbeat failed: ${err.message}`);
    }
  }, 30000);
}

async function connectAgentStream(agentId: string) {
  while (true) {
    try {
      const res = await fetch(`${API_BASE}/api/stream/agent/${agentId}?token=${AUTH_TOKEN}`);
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
              }
            } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err: any) {
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
