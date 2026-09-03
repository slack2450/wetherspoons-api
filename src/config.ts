export const API_ENDPOINT = 'https://ca.jdw-apps.net/api/v0.1';
export const GLOBALS_ENDPOINT = 'https://oandp-appmgr-prod.s3.eu-west-2.amazonaws.com/global.json';

export type RequestOptions = {
  signal?: AbortSignal
  /** Maximum time for the complete exported operation, including all nested requests, retries, and backoff. */
  timeoutMs?: number
  /** Maximum time for one upstream attempt. */
  attemptTimeoutMs?: number
  retries?: number
};

type RuntimeGlobal = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
};

export function apiToken(): string {
  const token = (globalThis as RuntimeGlobal).process?.env?.WETHERSPOONS_API_TOKEN;
  if (!token) throw new Error('WETHERSPOONS_API_TOKEN is required');
  return token;
}

export function clientHeaders(): Record<string, string> {
  return { 'Accept': 'application/json', 'User-Agent': 'okhttp/4.12.0' };
}

export function authenticatedHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiToken()}`, ...clientHeaders() };
}
