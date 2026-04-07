import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface StoredCredential {
  token: string;
  email: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  server_url: string;
}

const UTTERO_DIR = join(homedir(), '.uttero');
const CREDENTIALS_FILE = join(UTTERO_DIR, 'credentials.json');

export function getCredentials(): StoredCredential | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'));
    if (new Date(data.expires_at) < new Date()) {
      console.error('Token expired. Run `/uttero:configure` or `npx uttero login` to re-authenticate.');
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveCredentials(cred: StoredCredential): void {
  if (!existsSync(UTTERO_DIR)) {
    mkdirSync(UTTERO_DIR, { recursive: true });
  }
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(cred, null, 2));
  chmodSync(CREDENTIALS_FILE, 0o600);
}

export function deleteCredentials(): boolean {
  if (existsSync(CREDENTIALS_FILE)) {
    unlinkSync(CREDENTIALS_FILE);
    return true;
  }
  return false;
}

export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
