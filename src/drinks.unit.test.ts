import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDrinks, UpstreamTimeoutError } from './index.js';

const venue = {
  franchise: 'jdw',
  id: 1,
  isClosed: false,
  name: 'Test Pub',
  venueRef: 1234,
  address: {},
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function detailedVenue(salesAreaIds = [10]) {
  return {
    data: {
      ...venue,
      canPlaceOrder: true,
      salesAreas: salesAreaIds.map(id => ({ id })),
      venueCanOrder: true,
      venueRef: String(venue.venueRef),
    },
  };
}

function menuReference(id: number) {
  return {
    canOrder: true,
    franchise: 'jdw',
    id,
    name: `Menu ${id}`,
    salesAreaId: 10,
    venueRef: venue.venueRef,
  };
}

function menuDetail(id: number, canOrder: boolean, productId: number) {
  return {
    data: {
      canOrder,
      categories: [{
        itemGroups: [{
          items: [{
            id: productId,
            isOutOfStock: false,
            itemType: 'product',
            name: `Drink ${productId}`,
            description: '5% ABV',
            options: { portion: { options: [{
              label: 'Pint',
              value: { price: { currency: 'GBP', discount: 0, initialValue: 300, value: 300 } },
            }] } },
          }],
          name: 'Drinks',
        }],
        name: 'Drinks',
      }],
      franchise: 'jdw',
      id,
      salesAreaId: 10,
      venueRef: venue.venueRef,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => vi.stubEnv('WETHERSPOONS_API_TOKEN', 'test-token'));

describe('getDrinks operation boundaries', () => {
  it('uses one deadline across its sequential venue and menu phases', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const responses = [detailedVenue(), { data: [menuReference(20)] }];
    const fetchMock = vi.fn(async () => {
      now += 6;
      return jsonResponse(responses.shift());
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDrinks(venue, { timeoutMs: 10, attemptTimeoutMs: 100, retries: 0 }))
      .rejects.toBeInstanceOf(UpstreamTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates caller cancellation even when another detailed menu succeeded', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Caller stopped', 'AbortError');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith('/venues/1234')) return jsonResponse(detailedVenue());
      if (url.endsWith('/sales-areas/10/menus')) {
        return jsonResponse({ data: [menuReference(20), menuReference(21)] });
      }
      if (url.endsWith('/menus/20')) return jsonResponse(menuDetail(20, true, 100));

      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        queueMicrotask(() => controller.abort(reason));
      });
    }));

    await expect(getDrinks(venue, { signal: controller.signal, retries: 0 })).rejects.toBe(reason);
  });

  it('excludes a menu that becomes non-orderable before its detail is fetched', async () => {
    const responses = [
      detailedVenue(),
      { data: [menuReference(20)] },
      menuDetail(20, false, 100),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(responses.shift())));

    await expect(getDrinks(venue)).resolves.toEqual({
      status: 'unavailable',
      reason: 'no-orderable-menus',
      drinks: [],
    });
  });

  it('keeps only currently orderable menu products without marking a normal availability change partial', async () => {
    const responses = [
      detailedVenue(),
      { data: [menuReference(20), menuReference(21)] },
      menuDetail(20, false, 100),
      menuDetail(21, true, 101),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(responses.shift())));

    const result = await getDrinks(venue);
    expect(result).toMatchObject({
      status: 'available',
      drinks: [{ productId: 101 }],
    });
    if (result.status === 'available') expect(result.partial).toBeUndefined();
  });
});
