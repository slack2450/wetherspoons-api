import type { RequestOptions } from './config.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const REQUEST_DEADLINE: unique symbol = Symbol('requestDeadline');

type Deadline = {
  expiresAt: number
  timeoutMs: number
};

/** Internal options shared by every request belonging to one public operation. */
export type RequestContext = RequestOptions & { readonly [REQUEST_DEADLINE]: Deadline };

export class UpstreamHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'UpstreamHttpError';
  }
}

export class UpstreamTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamTimeoutError';
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Request aborted', 'AbortError');
}

function validateOptions(options: RequestOptions): void {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be greater than zero');
  if (!Number.isFinite(attemptTimeoutMs) || attemptTimeoutMs <= 0) {
    throw new RangeError('attemptTimeoutMs must be greater than zero');
  }
  if (!Number.isInteger(retries) || retries < 0) throw new RangeError('retries must be a non-negative integer');
}

/**
 * Creates one absolute deadline for a public operation. Passing an existing
 * context through nested helpers deliberately preserves that deadline.
 */
export function requestContext(options: RequestOptions = {}): RequestContext {
  if (REQUEST_DEADLINE in options) return options as RequestContext;
  validateOptions(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Object.assign({}, options, {
    [REQUEST_DEADLINE]: { expiresAt: performance.now() + timeoutMs, timeoutMs },
  });
}

function deadlineError(context: RequestContext, operation: string): UpstreamTimeoutError {
  return new UpstreamTimeoutError(`${operation} exceeded its ${context[REQUEST_DEADLINE].timeoutMs}ms deadline`);
}

/** Propagates caller cancellation first, then enforces the shared deadline. */
export function throwIfRequestStopped(context: RequestContext, operation: string): void {
  if (context.signal?.aborted) throw abortReason(context.signal);
  if (performance.now() >= context[REQUEST_DEADLINE].expiresAt) throw deadlineError(context, operation);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('Request aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchOnce(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers, signal });
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (!response.ok) {
    throw new UpstreamHttpError(
      `Upstream request to ${url} failed with HTTP ${response.status} ${response.statusText}; `
      + `content-type=${contentType || 'unknown'}; body=${JSON.stringify(body.slice(0, 300))}`,
      response.status,
    );
  }

  const mediaType = (contentType.split(';', 1)[0] ?? '').trim().toLowerCase();
  if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
    throw new Error(
      `Upstream request to ${url} returned non-JSON content-type=${contentType || 'unknown'}; `
      + `body=${JSON.stringify(body.slice(0, 300))}`,
    );
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Upstream request to ${url} returned invalid JSON (${reason}); `
      + `body=${JSON.stringify(body.slice(0, 300))}`,
    );
  }
}

export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  options: RequestOptions = {},
): Promise<unknown> {
  const context = requestContext(options);
  const retries = context.retries ?? DEFAULT_RETRIES;
  const timeoutMs = context[REQUEST_DEADLINE].timeoutMs;
  const attemptTimeoutMs = context.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
  const deadline = context[REQUEST_DEADLINE].expiresAt;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    throwIfRequestStopped(context, `Upstream request to ${url}`);
    const remainingMs = deadline - performance.now();
    const attemptTimeout = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(attemptTimeoutMs, remainingMs))));
    const signal = context.signal ? AbortSignal.any([context.signal, attemptTimeout]) : attemptTimeout;

    try {
      const response = await fetchOnce(url, headers, signal);
      throwIfRequestStopped(context, `Upstream request to ${url}`);
      return response;
    } catch (error) {
      if (context.signal?.aborted) {
        throw abortReason(context.signal);
      }
      lastError = attemptTimeout.aborted
        ? new UpstreamTimeoutError(`Upstream request to ${url} timed out after ${Math.min(attemptTimeoutMs, remainingMs)}ms`)
        : error;
      const retryable = lastError instanceof UpstreamHttpError
        ? RETRYABLE_STATUS.has(lastError.status)
        : lastError instanceof TypeError || lastError instanceof UpstreamTimeoutError;
      if (!retryable || attempt === retries) throw lastError;

      const backoffMs = 250 * 2 ** attempt;
      if (performance.now() + backoffMs >= deadline) {
        throw new UpstreamTimeoutError(`Upstream request to ${url} exceeded its ${timeoutMs}ms deadline`);
      }
      await delay(backoffMs, context.signal);
    }
  }

  throw lastError;
}
