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

describe('getDrinks menu discovery', () => {
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
        currency: 'GBP',
      }],
    });
  });

  it('rejects malformed upstream currency codes', async () => {
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
                  value: { price: { currency: 'not-a-currency', discount: 0, initialValue: 4, value: 4 } },
                }] } },
              }],
              name: 'Lager',
            }],
            name: 'Drinks',
          }],
          franchise: 'jdw',
          id: 20,
          salesAreaId: 10,
          venueRef: 1234,
        },
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(responses.shift())));

    await expect(getDrinks(apiVenue)).rejects.toThrow('No complete detailed request produced an orderable menu');
  });
});
