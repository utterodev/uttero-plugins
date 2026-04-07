import { Command } from 'commander';
import { browserOAuthFlow } from '../../../plugin/bin/login.ts';
import { saveCredentials } from '../../../plugin/bin/lib/credentials.ts';

const DEFAULT_SERVER = 'https://api.uttero.dev';

export const loginCommand = new Command('login')
  .description('Sign in to Uttero')
  .option('--server <url>', 'Server URL', DEFAULT_SERVER)
  .option('--manual', 'Paste token manually (for headless environments)')
  .action(async (opts) => {
    const serverUrl = opts.server;

    if (opts.manual) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const token = await new Promise<string>((resolve) => {
        rl.question('Paste your token: ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const expiresAt = new Date(payload.exp * 1000).toISOString();
        saveCredentials({
          token,
          email: payload.email,
          user_id: payload.sub,
          issued_at: new Date(payload.iat * 1000).toISOString(),
          expires_at: expiresAt,
          server_url: serverUrl,
        });
        console.log(`✓ Logged in as ${payload.email}`);
        console.log(`  Token expires: ${new Date(expiresAt).toLocaleDateString()}`);
      } catch {
        console.error('✗ Invalid token format');
        process.exit(1);
      }
      return;
    }

    try {
      const result = await browserOAuthFlow(serverUrl);
      saveCredentials({
        token: result.token,
        email: result.email,
        user_id: result.user_id,
        issued_at: new Date().toISOString(),
        expires_at: result.expires_at,
        server_url: serverUrl,
      });
      console.log(`✓ Logged in as ${result.email}`);
      console.log(`  Token expires: ${new Date(result.expires_at).toLocaleDateString()}`);
      process.exit(0);
    } catch (err: any) {
      console.error(`✗ Login failed: ${err.message}`);
      process.exit(1);
    }
  });
