import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJson, UpstreamHttpError, UpstreamTimeoutError } from './http.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson', () => {
  it('retries transient HTTP failures and returns the recovered response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', {
        status: 503,
        statusText: 'Unavailable',
        headers: { 'content-type': 'text/plain' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://example.test', {}, { retries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent client errors', async () => {
    const fetchMock = vi.fn(async () => new Response('missing', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'text/plain' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://example.test', {}, { retries: 2 })).rejects.toBeInstanceOf(UpstreamHttpError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts a stalled request at the configured deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    })));

    await expect(fetchJson('https://example.test', {}, { timeoutMs: 5, retries: 0 }))
      .rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it('retries an internally timed-out attempt within the total deadline', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recovered: true }), {
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://example.test', {}, {
      attemptTimeoutMs: 5,
      timeoutMs: 1_000,
      retries: 1,
    })).resolves.toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a caller abort', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Caller stopped', 'AbortError');
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = fetchJson('https://example.test', {}, {
      attemptTimeoutMs: 100,
      timeoutMs: 1_000,
      retries: 2,
      signal: controller.signal,
    });
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not begin a retry whose backoff would exceed the total deadline', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('https://example.test', {}, {
      attemptTimeoutMs: 5,
      timeoutMs: 20,
      retries: 10,
    })).rejects.toBeInstanceOf(UpstreamTimeoutError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
