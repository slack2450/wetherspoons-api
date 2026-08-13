import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDrinks, venues } from './index.js';

const globalVenue = {
  identifier: 1234,
  name: 'Test Pub',
};

const apiVenue = {
  franchise: 'jdw',
  id: 1,
  isClosed: false,
  name: 'Test Pub',
  venueRef: 1234,
  address: {
    line1: '1 Test Street',
    location: {
      latitude: 51.5,
      longitude: -0.1,
      distanceTolerance: null,
    },
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('venues', () => {
  it('uses mobile-client headers accepted by Wetherspoons CloudFront', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Accept': 'application/json',
        'User-Agent': 'okhttp/4.12.0',
      });
      const url = input.toString();
      if (url.endsWith('/global.json')) {
        return jsonResponse({ venues: [globalVenue] });
      }

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

describe('getDrinks', () => {
  it('returns an explicit unavailable result when ordering is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: {
        ...apiVenue,
        canPlaceOrder: false,
        salesAreas: [{ id: 10 }],
        venueRef: apiVenue.venueRef.toString(),
      },
    })));

    await expect(getDrinks(apiVenue)).resolves.toEqual({
      status: 'unavailable',
      reason: 'ordering-unavailable',
      drinks: [],
    });
  });

  it('treats an orderable menu with no usable drinks as temporarily unavailable', async () => {
    const responses = [
      {
        data: {
          ...apiVenue,
          canPlaceOrder: true,
          salesAreas: [{ id: 10 }],
          venueRef: apiVenue.venueRef.toString(),
        },
      },
      {
        data: [{
          canOrder: true,
          franchise: 'jdw',
          id: 20,
          name: 'Drinks',
          salesAreaId: 10,
          venueRef: apiVenue.venueRef,
        }],
      },
      {
        data: {
          canOrder: true,
          categories: [],
          franchise: 'jdw',
          id: 20,
          salesAreaId: 10,
          venueRef: apiVenue.venueRef,
        },
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(responses.shift())));

    await expect(getDrinks(apiVenue)).resolves.toEqual({
      status: 'unavailable',
      reason: 'no-usable-drinks',
      drinks: [],
    });
  });

  it('finds drinks in non-standard menus across every sales area', async () => {
    const responses = [
      {
        data: {
          ...apiVenue,
          canPlaceOrder: true,
          salesAreas: [{ id: 10 }, { id: 11 }],
          venueRef: apiVenue.venueRef.toString(),
        },
      },
      { data: [] },
      {
        data: [{
          canOrder: true,
          franchise: 'jdw',
          id: 21,
          name: 'Disco Spoons',
          salesAreaId: 11,
          venueRef: apiVenue.venueRef,
        }],
      },
      {
        data: {
          canOrder: true,
          categories: [{
            itemGroups: [{
              items: [{
                id: 99,
                isOutOfStock: false,
                itemType: 'product',
                name: 'Test Lager',
                description: '5% ABV 500ml',
                options: {
                  portion: {
                    options: [{
                      label: '500ml',
                      value: {
                        price: {
                          currency: 'GBP',
                          discount: 0,
                          initialValue: 300,
                          value: 300,
                        },
                      },
                    }],
                  },
                },
              }],
              name: 'Lager',
            }],
            name: 'Drinks',
          }],
          franchise: 'jdw',
          id: 21,
          salesAreaId: 11,
          venueRef: apiVenue.venueRef,
        },
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(responses.shift())));

    await expect(getDrinks(apiVenue)).resolves.toEqual({
      status: 'available',
      drinks: [{
        name: 'Test Lager',
        units: 2.5,
        productId: 99,
        price: 300,
        ppu: 120,
      }],
    });
  });
});
