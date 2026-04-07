#!/usr/bin/env bun
import { createServer } from 'http';
import { saveCredentials } from './lib/credentials.ts';

const DEFAULT_SERVER = 'https://api.uttero.dev';

interface OAuthResult {
  token: string;
  email: string;
  user_id: string;
  expires_at: string;
}

async function browserOAuthFlow(serverUrl: string): Promise<OAuthResult> {
  const open = await import('open').then(m => m.default);
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      if (url.pathname === '/callback') {
        let token: string | null = null;
        let email: string | null = null;
        let user_id: string | null = null;
        let expires_at: string | null = null;

        if (req.method === 'POST') {
          const body = await new Promise<string>((r) => {
            let data = '';
            req.on('data', (chunk) => (data += chunk));
            req.on('end', () => r(data));
          });
          const params = new URLSearchParams(body);
          token = params.get('token');
          email = params.get('email');
          user_id = params.get('user_id');
          expires_at = params.get('expires_at');
        } else {
          token = url.searchParams.get('token');
          email = url.searchParams.get('email');
          user_id = url.searchParams.get('user_id');
          expires_at = url.searchParams.get('expires_at');
        }

        if (token && email && user_id && expires_at) {
          const appUrl = serverUrl.replace('api.', 'app.');
          const successParams = new URLSearchParams({ sid: user_id, email });
          res.writeHead(302, { 'Location': `${appUrl}/auth/success?${successParams}` });
          res.end();
          server.close();
          resolve({ token, email, user_id, expires_at });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Login failed</h1><p>Missing parameters.</p></body></html>');
          server.close();
          reject(new Error('Missing auth parameters'));
        }
      }
    });

    server.listen(0, () => {
      const port = (server.address() as any).port;
      const callbackUrl = `http://localhost:${port}/callback`;
      const appUrl = serverUrl.replace('api.', 'app.');
      const authUrl = `${appUrl}/auth/cli?redirect=${encodeURIComponent(callbackUrl)}&api=${encodeURIComponent(serverUrl)}`;
      console.log('Opening browser for sign-in...');
      open(authUrl).catch(() => {
        console.log(`Open this URL manually: ${authUrl}`);
      });
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Login timed out'));
    }, 120000);
  });
}

// --- Main ---

const args = process.argv.slice(2);
const serverUrl = args.find(a => a.startsWith('--server='))?.split('=')[1] ?? DEFAULT_SERVER;
const manual = args.includes('--manual');

if (manual) {
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
} else {
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
}
