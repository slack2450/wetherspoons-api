import { describe, it, expect } from 'vitest';
import { venues, getDrinks } from './index.js';

// Helper to add delay between requests to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Wetherspoons API', async () => {
  describe('venues', () => {
    it('should fetch and parse venues successfully', async () => {
      const result = await venues();
      // Reasonable assumption there are at least 500 pubs
      expect(result).length.greaterThanOrEqual(500);
    });
  });

  // Dynamically create test suites for each venue
  const allVenues = await venues();

  for (const venue of allVenues) {
    describe(`Venue: ${venue.name} (${venue.venueRef})`, { timeout: 60000 }, () => {
      it('should fetch drinks menu', async () => {
        // Add 5 second delay between requests to avoid rate limiting
        await delay(5000);
        const drinks = await getDrinks(venue);
        // Reasonable assumption each pub has at least 20 drinks
        expect(drinks).lengthOf.greaterThanOrEqual(20);
      });
    });
  }
});
