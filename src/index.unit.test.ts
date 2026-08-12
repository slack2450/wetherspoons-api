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

  it('rejects an orderable menu that contains no usable drinks', async () => {
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

    await expect(getDrinks(apiVenue)).rejects.toThrow(/contained no usable drinks/);
  });
});
