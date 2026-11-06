import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDrinks, getMenu } from './index.js';
import { apiVenue, jsonResponse } from './api-test-fixtures.js';

const specialsSummary = {
  canOrder: true, franchise: 'jdw', id: 10287, name: 'Specials',
  salesAreaId: 10, venueRef: 1234, isSpecials: true,
};

function menuDetail(id: number | string, productId: number) {
  return { data: {
    canOrder: true, franchise: 'jdw', id, salesAreaId: 10, venueRef: 1234,
    categories: [{ name: 'Drinks', itemGroups: [{ name: null, items: [{
      id: productId, isOutOfStock: false, itemType: 'product',
      name: 'Special Lager', description: '5% ABV',
      options: { portion: { options: [{
        label: '500ml',
        value: { price: { currency: 'GBP', discount: 0, initialValue: 3, value: 3 } },
      }] } },
    }] }] }],
  } };
}

function mockPub(specialsResponse: () => Response, name = 'Specials') {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(input.toString()).pathname;
    if (path.endsWith('/venues/1234')) {
      return jsonResponse({ data: { ...apiVenue, canPlaceOrder: true, salesAreas: [{ id: 10 }] } });
    }
    if (path.endsWith('/sales-areas/10/menus')) {
      return jsonResponse({ data: [
        { ...specialsSummary, name },
        { ...specialsSummary, id: 21, name: 'Drinks', isSpecials: false },
      ] });
    }
    if (path.endsWith('/menus/specials')) return specialsResponse();
    if (path.endsWith('/menus/21')) return jsonResponse(menuDetail(21, 100));
    // The numeric legacy Specials route really returns Z556; do not let an
    // unexpected request accidentally receive a successful mock response.
    if (path.endsWith('/menus/10287')) return new Response('Z556', { status: 500 });
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => vi.stubEnv('WETHERSPOONS_API_TOKEN', 'test-token'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Specials menus', () => {
  it.each(['Specials', 'Renamed promotion'])('collects complete drinks using the Specials flag for "%s"', async (name) => {
    const fetchMock = mockPub(() => jsonResponse(menuDetail('specials', 99)), name);

    const result = await getDrinks(apiVenue, { retries: 0 });

    expect(result).toEqual({ status: 'available', drinks: [
      { name: 'Special Lager', units: 2.5, productId: 99, price: 3, ppu: 1.2, currency: 'GBP' },
      { name: 'Special Lager', units: 2.5, productId: 100, price: 3, ppu: 1.2, currency: 'GBP' },
    ] });
    expect(fetchMock.mock.calls.map(([url]) => new URL(url.toString()).pathname)).toEqual([
      '/api/v0.1/venues/1234',
      '/api/v0.1/jdw/venues/1234/sales-areas/10/menus',
      '/api/v0.1/jdw/venues/1234/sales-areas/10/menus/specials',
      '/api/v0.1/jdw/venues/1234/sales-areas/10/menus/21',
    ]);
  });

  it.each([{}, { isSpecials: false }])('keeps numeric routing for an ordinary menu named Specials (%j)', async (flags) => {
    const fetchMock = vi.fn(async () => jsonResponse(menuDetail(21, 100)));
    vi.stubGlobal('fetch', fetchMock);

    await getMenu({ canOrder: true, franchise: 'jdw', id: 21, name: 'Specials', salesAreaId: 10, venueRef: 1234, ...flags });

    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://ca.jdw-apps.net/api/v0.1/jdw/venues/1234/sales-areas/10/menus/21');
  });

  it.each([
    { failure: 'HTTP failure', response: () => new Response('Z556', { status: 500 }), cause: { name: 'UpstreamHttpError', status: 500 } },
    { failure: 'unknown string ID', response: () => jsonResponse(menuDetail('unexpected-menu', 99)), cause: { name: 'ZodError' } },
    { failure: 'malformed products', response: () => jsonResponse({ data: { ...menuDetail('specials', 99).data, categories: 'invalid' } }), cause: { name: 'ZodError' } },
  ])('preserves a real Specials $failure as a partial result', async ({ response, cause }) => {
    mockPub(response);

    await expect(getDrinks(apiVenue, { retries: 0 })).resolves.toMatchObject({
      status: 'available', partial: true, drinks: [{ productId: 100 }],
      failures: [{ context: { menuId: 10287, menuName: 'Specials' }, cause }],
    });
  });
});
