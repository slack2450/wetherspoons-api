import { describe, it, expect } from 'vitest';
import { venues, getDrinks, getMenus, getVenue } from './index.js';

// Add a delay between requests to avoid rate limiting.
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Wetherspoons API', async () => {
  describe('venues', () => {
    it('should fetch and parse venues successfully', async () => {
      const result = await venues();
      expect(result).length.greaterThanOrEqual(500);
    });
  });

  const allVenues = await venues();

  for (const venue of allVenues) {
    describe(`Venue: ${venue.name} (${venue.venueRef})`, { timeout: 60000 }, () => {
      it('should fetch drinks menu', async () => {
        await delay(5000);

        const detailedVenue = await getVenue(venue);
        const result = await getDrinks(venue);

        // Wetherspoons can disable ordering and mark every product out of stock
        // outside a venue's service hours. getDrinks() still exercises the live
        // endpoints and schemas, but an empty result is valid in that state.
        if (
          detailedVenue.canPlaceOrder === false
          || detailedVenue.venueCanOrder === false
          || detailedVenue.isClosed === true
        ) {
          expect(result.status).toBe('unavailable');
          return;
        }

        const salesArea = detailedVenue.salesAreas[0];
        if (!salesArea) {
          expect(result).toEqual({ status: 'unavailable', reason: 'no-sales-area', drinks: [] });
          return;
        }

        const menus = await getMenus({ venue: detailedVenue, salesAreaId: salesArea.id });
        const drinksMenu = menus.find(menu => menu.name === 'Drinks');
        if (!drinksMenu) {
          expect(result).toEqual({ status: 'unavailable', reason: 'no-drinks-menu', drinks: [] });
          return;
        }

        if (drinksMenu.canOrder) {
          expect(result.status).toBe('available');
          if (result.status === 'available') {
            expect(result.drinks).lengthOf.greaterThanOrEqual(20);
          }
        } else {
          expect(result).toEqual({
            status: 'unavailable',
            reason: 'drinks-menu-unavailable',
            drinks: [],
          });
        }
      });
    });
  }
});
