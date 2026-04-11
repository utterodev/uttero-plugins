import { Command } from 'commander';
import { createInterface } from 'readline/promises';
import { hostname } from 'os';
import { stdin as input, stdout as output } from 'process';

import { exchangePairCode, normalizeCode } from '../../../plugin/bin/login.ts';
import {
  saveCredentials,
  type StoredCredential,
} from '../../../plugin/bin/lib/credentials.ts';

const DEFAULT_SERVER = 'https://api.uttero.dev';

async function promptCode(): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (
      await rl.question(
        'Paste your Uttero pair code (from https://app.uttero.dev/settings/devices): ',
      )
    ).trim();
  } finally {
    rl.close();
  }
}

export const loginCommand = new Command('login')
  .description('Pair this device with your Uttero account')
  .option('--server <url>', 'Server URL', DEFAULT_SERVER)
  .option('--code <code>', 'Pair code (skips interactive prompt)')
  .option('--device-name <name>', 'Human-readable device name')
  .action(async (opts) => {
    const serverUrl: string = opts.server;
    const deviceName: string = opts.deviceName || `${hostname()}-uttero-cli`;

    const rawCode = opts.code ?? (await promptCode());
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
      console.log('\nCredentials stored at ~/.uttero/credentials.json (mode 600)');
      console.log('Revoke at: https://app.uttero.dev/settings/devices');
    } catch (e) {
      console.error(`[uttero] ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });
