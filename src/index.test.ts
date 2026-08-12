import { afterAll, describe, it, expect } from 'vitest';
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
  const availableVenues = new Set<number>();
  const unavailableVenues = new Map<number, string>();

  afterAll(() => {
    const minimumCoverage = Math.floor(allVenues.length * 0.95);
    console.log(
      `LIVE_COVERAGE available=${availableVenues.size} unavailable=${unavailableVenues.size} total=${allVenues.length}`,
    );
    expect(availableVenues.size).toBeGreaterThanOrEqual(minimumCoverage);
  });

  for (const venue of allVenues) {
    describe(`Venue: ${venue.name} (${venue.venueRef})`, { timeout: 60000 }, () => {
      it('should fetch drinks menu', async () => {
        await delay(5000);

        const result = await getDrinks(venue);

        if (result.status === 'unavailable') {
          unavailableVenues.set(venue.venueRef, result.reason);
          return;
        }

        availableVenues.add(venue.venueRef);
        expect(result.drinks.length).toBeGreaterThan(0);
      });
    });
  }
});
