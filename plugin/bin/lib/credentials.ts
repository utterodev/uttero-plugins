import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Credentials shape for the pair-code auth flow. The CLI stores:
 *
 *  - access_token: short-lived JWT (24 h) presented to the server
 *  - refresh_token: long-lived raw token used to rotate the access_token
 *  - access_expires_at: ISO 8601 — the CLI refreshes before this deadline
 *  - device_id: UUID of the paired cli_devices row (also in the `did` JWT claim)
 *  - email / user_id: display-only
 *  - server_url: so the CLI can hit the correct environment
 *
 * The file lives at `~/.uttero/credentials.json` with mode 600. Every
 * process re-reads the file for every request (see `lib/auth.ts`) so that
 * multiple Claude Code instances can share a single rotating credential.
 */
export interface StoredCredential {
  access_token: string;
  refresh_token: string;
  access_expires_at: string; // ISO 8601
  device_id: string;
  email: string;
  user_id: string;
  server_url: string;
}

const UTTERO_DIR = join(homedir(), '.uttero');
const CREDENTIALS_FILE = join(UTTERO_DIR, 'credentials.json');

/**
 * Read the credentials file. Returns `null` if the file is missing OR if
 * the stored shape is the pre-pair-flow `token` format — in that case we
 * also print a one-time warning so the user knows what to do.
 */
export function getCredentials(): StoredCredential | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'));
    if (!data.access_token || !data.refresh_token) {
      console.error(
        '[uttero] Credentials format has changed for the new pair flow. ' +
          'Please run /uttero:configure to re-pair this device.',
      );
      return null;
    }
    return data as StoredCredential;
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
