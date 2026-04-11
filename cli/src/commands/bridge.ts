import { Command } from 'commander';
import { getCredentials } from '../../../plugin/bin/lib/credentials.ts';

export const bridgeCommand = new Command('bridge')
  .description('Start the MCP bridge (called by the agent, not directly)')
  .action(async () => {
    const cred = getCredentials();
    if (!cred) {
      console.error('Not logged in. Run `uttero login` first.');
      process.exit(1);
    }

    // The plugin bridge re-reads credentials.json on every request via
    // lib/auth.ts — we no longer hand a token through env vars.
    process.env.UTTERO_API_URL = cred.server_url;

    console.error(`[uttero] Authenticated as ${cred.email}`);
    console.error(`[uttero] Server: ${cred.server_url}`);

    await import('../../../plugin/bin/bridge.ts');
  });
