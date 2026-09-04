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
  it('accepts nullable ordering flags and keeps usable drinks when another menu fails', async () => {
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
        return new Response('missing', { status: 404, statusText: 'Not Found', headers: { 'content-type': 'text/plain' } });
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

    const result = await getDrinks(apiVenue);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.partial).toBe(true);
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
      drinks: [{ currency: 'GBP', productId: 99 }],
    });
  });
});
