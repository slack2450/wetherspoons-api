# Usage

[Documentation](README.md) · [Package overview](../README.md)

This package is intended for server-side Node.js 20.19 or newer. It includes the
same public client token shipped by Wetherspoons' own application, so no secret
configuration is required. You can override that value if the upstream client
changes it:

```bash
export WETHERSPOONS_API_TOKEN="replacement-public-client-token"
```

Browser clients should still call a controlled server endpoint so upstream
timeouts, validation, caching, and request volume remain centrally managed.

### Version 3 migration

Version 3 keeps zero-configuration token behaviour and accepts
`WETHERSPOONS_API_TOKEN` as an optional override. Request `timeoutMs` now bounds
the entire operation, including retries and backoff. Use `attemptTimeoutMs` to
set the maximum duration of each individual upstream attempt.

### Get All Venues

```typescript
import { venues } from 'wetherspoons-api';

const allVenues = await venues();
console.log(allVenues);
// [
//   {
//     franchise: 'lloyds',
//     id: 123,
//     isClosed: false,
//     name: 'The Moon Under Water',
//     venueRef: 456
//   },
//   ...
// ]
```

### Get Venue Details

```typescript
import { venues, getVenue } from 'wetherspoons-api';

const allVenues = await venues();
const venue = allVenues[0];
const details = await getVenue(venue);

console.log(details);
// {
//   canPlaceOrder: true,
//   franchise: 'lloyds',
//   id: 123,
//   name: 'The Moon Under Water',
//   salesAreas: [{ id: 789 }],
//   venueCanOrder: true,
//   venueRef: 456
// }
```

### Get Drinks with Price Analysis

```typescript
import { venues, getDrinks } from 'wetherspoons-api';

const allVenues = await venues();
const venue = allVenues[0];
const result = await getDrinks(venue);

if (result.status === 'unavailable') {
  console.log(`Drinks unavailable: ${result.reason}`);
} else {
  console.log(result.drinks);
}
// [
//   {
//     name: 'Ruddles Best',
//     units: 2.27,
//     productId: 12345,
//     price: 2.49,
//     ppu: 1.0969,
//     currency: 'GBP'
//   },
//   ...
// ]
// Sorted by best value (lowest price per unit first)
```

### Get Menus

```typescript
import { venues, getVenue, getMenus, getMenu } from 'wetherspoons-api';

const allVenues = await venues();
const venue = allVenues[0];
const details = await getVenue(venue);

// Get all menus for a sales area
const menus = await getMenus({
  venue: details,
  salesAreaId: details.salesAreas[0].id
});

// Get detailed menu information
const drinksMenu = menus.find(m => m.name === 'Drinks');
if (drinksMenu) {
  const detailedMenu = await getMenu(drinksMenu);
  console.log(detailedMenu.data.categories);
}
```
