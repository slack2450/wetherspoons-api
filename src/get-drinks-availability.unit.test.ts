import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDrinks } from './index.js';
import { apiVenue, jsonResponse } from './api-test-fixtures.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('WETHERSPOONS_API_TOKEN', 'test-token');
});

describe('getDrinks availability', () => {
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
});
