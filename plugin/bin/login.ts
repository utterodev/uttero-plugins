#!/usr/bin/env bun
/**
 * Pair-code login for Uttero.
 *
 * Two modes:
 *
 *   1. Non-interactive: `login.ts --code=XXXX-XXXX [--server=...] [--device-name=...]`
 *      Used by the /uttero:configure skill — Claude Code collects the
 *      code from the user and passes it down here.
 *
 *   2. Interactive: `login.ts` with no `--code` flag
 *      Readline prompts the user for the code. Used for `npx uttero login`
 *      on a terminal.
 *
 * The flow posts the code to `/api/pair/exchange`, stores the returned
 * access_token + refresh_token + device_id in ~/.uttero/credentials.json
 * (mode 600), and prints a short success message.
 */

import { createInterface } from 'readline/promises';
import { hostname } from 'os';
import { stdin as input, stdout as output } from 'process';
import { saveCredentials, type StoredCredential } from './lib/credentials.ts';

const DEFAULT_SERVER = 'https://api.uttero.dev';

interface ExchangeResponse {
  access_token: string;
  refresh_token: string;
  device_id: string;
  access_expires_in: number;
  user: { id: string; email: string; name: string };
}

function parseArgs(argv: string[]): { code?: string; server?: string; deviceName?: string } {
  const args: { code?: string; server?: string; deviceName?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith('--code=')) args.code = arg.slice('--code='.length);
    else if (arg.startsWith('--server=')) args.server = arg.slice('--server='.length);
    else if (arg.startsWith('--device-name=')) args.deviceName = arg.slice('--device-name='.length);
  }
  return args;
}

export function normalizeCode(raw: string): string | null {
  const stripped = raw.replace(/[-\s]/g, '').toUpperCase();
  if (stripped.length !== 8) return null;
  return stripped;
}

async function promptCode(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      'Paste your Uttero pair code (from https://app.uttero.dev/settings/devices): ',
    );
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function exchangePairCode(
  serverUrl: string,
  code: string,
  deviceName: string,
): Promise<ExchangeResponse> {
  const res = await fetch(`${serverUrl}/api/pair/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device_name: deviceName }),
  });
  if (res.status === 404) {
    throw new Error('Pair code not found or expired. Generate a new one on app.uttero.dev.');
  }
  if (res.status === 429) {
    throw new Error('Too many pair attempts. Wait a minute and try again.');
  }
  if (!res.ok) {
    throw new Error(`Exchange failed: HTTP ${res.status}`);
  }
  return (await res.json()) as ExchangeResponse;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serverUrl = args.server || process.env.UTTERO_SERVER_URL || DEFAULT_SERVER;
  const deviceName = args.deviceName || `${hostname()}-claude-code`;

  const rawCode = args.code ?? (await promptCode());
  const normalized = normalizeCode(rawCode);
  if (!normalized) {
    console.error('[uttero] Pair code must be 8 characters (hyphens optional).');
    process.exit(2);
  }

  try {
    const result = await exchangePairCode(serverUrl, normalized, deviceName);
    const expiresAt = new Date(Date.now() + result.access_expires_in * 1000).toISOString();
    const cred: StoredCredential = {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      access_expires_at: expiresAt,
      device_id: result.device_id,
      email: result.user.email,
      user_id: result.user.id,
      server_url: serverUrl,
    };
    saveCredentials(cred);

    console.log(`\n✓ Paired as ${result.user.email}`);
    console.log(`  Device: ${deviceName}`);
    console.log(`  ID:     ${result.device_id}`);
    console.log(`\nCredentials stored at ~/.uttero/credentials.json (mode 600)`);
    console.log('You can revoke this device any time at https://app.uttero.dev/settings/devices');
  } catch (e) {
    console.error(`[uttero] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// Only run main() when invoked directly, not when imported by the cli/
// wrapper (which reuses `exchangePairCode` / `normalizeCode`).
if (import.meta.main) {
  await main();
}
