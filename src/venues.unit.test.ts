import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { venues } from './index.js';
import { apiVenue, globalVenue, jsonResponse } from './api-test-fixtures.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('WETHERSPOONS_API_TOKEN', 'test-token');
});

describe('venues', () => {
  it('uses the built-in public client token when no override is configured', async () => {
    vi.stubEnv('WETHERSPOONS_API_TOKEN', '');
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/global.json')) return jsonResponse({ venues: [globalVenue] });
      expect(init?.headers).toMatchObject({
        Authorization: expect.stringMatching(/^Bearer 1\|[A-Za-z0-9]+$/),
      });
      return jsonResponse({ success: true, data: [apiVenue] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(venues()).resolves.toEqual([apiVenue]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses mobile-client headers accepted by Wetherspoons CloudFront', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      expect(init?.headers).toMatchObject({
        'Accept': 'application/json',
        'User-Agent': 'okhttp/4.12.0',
      });
      if (url.endsWith('/global.json')) {
        return jsonResponse({ venues: [globalVenue] });
      }

      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
      return jsonResponse({ success: true, data: [apiVenue] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await venues();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns global venues and accepts a null distance tolerance', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/global.json')) {
        return jsonResponse({ venues: [globalVenue] });
      }

      return jsonResponse({ success: true, data: [
        apiVenue,
        { ...apiVenue, id: 2, venueRef: 9999, name: 'Out-of-scope venue' },
      ] });
    }));

    await expect(venues()).resolves.toEqual([apiVenue]);
  });

  it('rejects a malformed open venue instead of silently dropping it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/global.json')) return jsonResponse({ venues: [globalVenue] });
      return jsonResponse({ data: [{ ...apiVenue, name: undefined }] });
    }));

    await expect(venues()).rejects.toThrow();
  });

  it('reports an HTML upstream error instead of throwing a JSON parse error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/global.json')) {
        return jsonResponse({ venues: [globalVenue] });
      }

      return new Response('<html>Forbidden</html>', {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'content-type': 'text/html' },
      });
    }));

    await expect(venues()).rejects.toThrow(
      /HTTP 403 Forbidden; content-type=text\/html; body="<html>Forbidden<\/html>"/,
    );
  });

  it('reports a non-JSON success response clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/global.json')) {
        return jsonResponse({ venues: [globalVenue] });
      }

      return new Response('<html>Unexpected response</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }));

    await expect(venues()).rejects.toThrow(/returned non-JSON content-type=text\/html/);
  });
});
