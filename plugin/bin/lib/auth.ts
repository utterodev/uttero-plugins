/**
 * getAccessToken + refresh rotation for the pair-code flow.
 *
 * Invariants:
 *  - Every call re-reads `~/.uttero/credentials.json` from disk. Multiple
 *    bridge processes (one per Claude Code instance) share a single
 *    rotating refresh token, so in-memory caching would desync them.
 *  - A refresh is triggered when the access token will expire within the
 *    next 5 minutes.
 *  - Only one in-flight refresh promise per process — concurrent callers
 *    within a single bridge wait on the same promise.
 *  - On a 401 from /api/auth/refresh, we surface a clear "device was
 *    revoked" error. The caller (usually the bridge) should exit.
 *  - On a network error, we bubble up the original exception so the
 *    bridge can retry with its own backoff policy.
 *
 * This module deliberately does NOT import the server's `rtk_` constants
 * or hash helpers. The CLI treats the refresh token as an opaque string.
 */

import { getCredentials, saveCredentials, type StoredCredential } from './credentials.ts';

/** How far before expiry to proactively rotate. */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

let inFlight: Promise<string> | null = null;

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  access_expires_in: number;
}

async function postRefresh(serverUrl: string, refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(`${serverUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 401) {
    throw new Error(
      '[uttero] Refresh token was rejected. This device may have been revoked. ' +
        'Run /uttero:configure to re-pair.',
    );
  }
  if (!res.ok) {
    throw new Error(`[uttero] /api/auth/refresh returned HTTP ${res.status}`);
  }
  return (await res.json()) as RefreshResponse;
}

async function doRefresh(current: StoredCredential): Promise<string> {
  const result = await postRefresh(current.server_url, current.refresh_token);
  const expiresAt = new Date(Date.now() + result.access_expires_in * 1000).toISOString();
  const next: StoredCredential = {
    ...current,
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    access_expires_at: expiresAt,
  };
  saveCredentials(next);
  return next.access_token;
}

/**
 * Return a fresh access token. Refreshes on-demand if the stored token is
 * within `REFRESH_AHEAD_MS` of expiring. Throws if credentials are missing
 * or if the server rejects the refresh.
 */
export async function getAccessToken(): Promise<string> {
  const cred = getCredentials();
  if (!cred) {
    throw new Error(
      '[uttero] No credentials found. Run /uttero:configure to pair this device.',
    );
  }

  const expiresAtMs = Date.parse(cred.access_expires_at);
  const needsRefresh =
    !Number.isFinite(expiresAtMs) || Date.now() + REFRESH_AHEAD_MS >= expiresAtMs;

  if (!needsRefresh) {
    return cred.access_token;
  }

  if (!inFlight) {
    inFlight = doRefresh(cred).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
