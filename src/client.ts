import { API_ENDPOINT, authenticatedHeaders, clientHeaders, GLOBALS_ENDPOINT } from './config.js';
import type { RequestOptions } from './config.js';
import { fetchJson } from './http.js';

export function request(path: string, options?: RequestOptions): Promise<unknown> {
  return fetchJson(`${API_ENDPOINT}${path}`, authenticatedHeaders(), options);
}

export function requestGlobals(options?: RequestOptions): Promise<unknown> {
  return fetchJson(GLOBALS_ENDPOINT, clientHeaders(), options);
}
