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

    process.env.OTTRVOICE_API_URL = cred.server_url;
    process.env.OTTRVOICE_AUTH_TOKEN = cred.token;

    console.error(`[uttero] Authenticated as ${cred.email}`);
    console.error(`[uttero] Server: ${cred.server_url}`);

    await import('../../../plugin/bin/bridge.ts');
  });
