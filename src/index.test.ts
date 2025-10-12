import { describe, it, expect } from 'vitest';
import { venues, getDrinks } from './index.js';

describe('Wetherspoons API', async () => {
  describe('venues', () => {
    it('should fetch and parse venues successfully', async () => {
      const result = await venues();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // Dynamically create test suites for each venue
  const allVenues = await venues();

  for (const venue of allVenues) {
    describe(`Venue: ${venue.name}`, { timeout: 30000 }, () => {
      it.concurrent('should fetch drinks menu', async () => {
        const drinks = await getDrinks(venue);
        expect(drinks).lengthOf.greaterThan(1);
      });
    });
  }
});
