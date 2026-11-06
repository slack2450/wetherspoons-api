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

describe('getDrinks partial responses', () => {
  it.each([
    {
      failure: 'HTTP error',
      response: () => new Response('menu unavailable (Z556)', {
        status: 500, statusText: 'Internal Server Error', headers: { 'content-type': 'text/plain' },
      }),
      cause: { name: 'UpstreamHttpError', status: 500 },
    },
    {
      failure: 'schema error',
      response: () => jsonResponse({ data: {
        canOrder: true, categories: 'invalid', franchise: 'jdw', id: 20, salesAreaId: 10, venueRef: 1234,
      } }),
      cause: { name: 'ZodError', issues: expect.arrayContaining([
        expect.objectContaining({ path: ['data', 'categories'], code: 'invalid_type' }),
      ]) },
    },
  ])('preserves the $failure while keeping usable drinks from other menus', async ({ response, cause }) => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/venues/1234')) {
        return jsonResponse({
          data: {
            ...apiVenue,
            canPlaceOrder: true,
            venueCanOrder: null,
            salesAreas: [{ id: 10 }],
            venueRef: apiVenue.venueRef.toString(),
          },
        });
      }
      if (url.endsWith('/sales-areas/10/menus')) {
        return jsonResponse({ data: [
          { canOrder: true, franchise: 'jdw', id: 20, name: 'Food', salesAreaId: 10, venueRef: 1234 },
          { canOrder: true, franchise: 'jdw', id: 21, name: 'Drinks', salesAreaId: 10, venueRef: 1234 },
        ] });
      }
      if (url.endsWith('/menus/20')) {
        return response();
      }
      return jsonResponse({
        data: {
          canOrder: true,
          categories: [{
            itemGroups: [{
              items: [{
                id: 99,
                isOutOfStock: false,
                itemType: 'product',
                name: 'Test Lager',
                description: '5% ABV',
                options: { portion: { options: [{
                  label: 'Pint',
                  value: { price: { currency: 'EUR', discount: 0, initialValue: 4, value: 4 } },
                }] } },
              }],
              name: 'Lager',
            }],
            name: 'Drinks',
          }],
          franchise: 'jdw',
          id: 21,
          salesAreaId: 10,
          venueRef: 1234,
        },
      });
    }));

    const result = await getDrinks(apiVenue, { retries: 0 });
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.partial).toBe(true);
      expect(result.failures).toHaveLength(1);
      expect(result.failures?.[0]).toMatchObject({
        name: 'MenuRequestError',
        context: { stage: 'menu-detail', venueRef: 1234, salesAreaId: 10, menuId: 20, menuName: 'Food' },
        cause,
      });
      expect(result.drinks).toHaveLength(1);
      expect(result.drinks[0]?.currency).toBe('EUR');
      expect(result.drinks[0]?.units).toBeCloseTo(2.84);
    }
  });

  it('marks drinks partial when another sales-area menu list fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.endsWith('/venues/1234')) {
        return jsonResponse({
          data: {
            ...apiVenue,
            canPlaceOrder: true,
            salesAreas: [{ id: 10 }, { id: 11 }],
            venueRef: apiVenue.venueRef.toString(),
          },
        });
      }
      if (url.endsWith('/sales-areas/10/menus')) {
        return new Response('busy', {
          status: 503,
          statusText: 'Unavailable',
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (url.endsWith('/sales-areas/11/menus')) {
        return jsonResponse({ data: [
          { canOrder: true, franchise: 'jdw', id: 21, name: 'Drinks', salesAreaId: 11, venueRef: 1234 },
        ] });
      }
      return jsonResponse({
        data: {
          canOrder: true,
          categories: [{
            itemGroups: [{
              items: [{
                id: 99,
                isOutOfStock: false,
                itemType: 'product',
                name: 'Test Lager',
                description: '5% ABV',
                options: { portion: { options: [{
                  label: 'Pint',
                  value: { price: { currency: 'GBP', discount: 0, initialValue: 4, value: 4 } },
                }] } },
              }],
              name: 'Lager',
            }],
            name: 'Drinks',
          }],
          franchise: 'jdw',
          id: 21,
          salesAreaId: 11,
          venueRef: 1234,
        },
      });
    }));

    await expect(getDrinks(apiVenue, { retries: 0 })).resolves.toMatchObject({
      status: 'available',
      partial: true,
      failures: [{
        context: { stage: 'menu-list', venueRef: 1234, salesAreaId: 10 },
        cause: { name: 'UpstreamHttpError', status: 503 },
      }],
      drinks: [{ currency: 'GBP', productId: 99 }],
    });
  });
});
