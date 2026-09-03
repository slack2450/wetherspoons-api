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

// Public client token shipped by Wetherspoons' own application. Keep the
// environment variable as an override in case the upstream client changes it.
const DEFAULT_API_TOKEN = '1|SFS9MMnn5deflq0BMcUTSijwSMBB4mc7NSG2rOhqb2765466';

export function apiToken(): string {
  return (globalThis as RuntimeGlobal).process?.env?.WETHERSPOONS_API_TOKEN || DEFAULT_API_TOKEN;
}

export function clientHeaders(): Record<string, string> {
  return { 'Accept': 'application/json', 'User-Agent': 'okhttp/4.12.0' };
}

export function authenticatedHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiToken()}`, ...clientHeaders() };
}
