import { describe, it, expect } from 'vitest';
import { venues, getDrinks } from './index.js';

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
        const drinks = await getDrinks(venue);
        expect(drinks).lengthOf.greaterThanOrEqual(20);
      });
    });
  }
});
