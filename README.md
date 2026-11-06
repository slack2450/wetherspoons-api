# Wetherspoons API

A TypeScript package for accessing JD Wetherspoon's venue and menu data, including drink information with pricing and alcohol unit calculations.

[![npm version](https://img.shields.io/npm/v/wetherspoons-api.svg)](https://www.npmjs.com/package/wetherspoons-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://github.com/slack2450/wetherspoons-api/actions/workflows/test.yml/badge.svg)](https://github.com/slack2450/wetherspoons-api/actions/workflows/test.yml)

## Installation

```bash
npm install wetherspoons-api
```

## Features

- 🏪 Fetch all Wetherspoons venues
- 📍 Get detailed venue information
- 🍺 Access venue menus and drinks
- 💰 Calculate price per unit (PPU) for alcoholic beverages
- ✅ Type-safe with TypeScript and Zod validation
- 🔄 Automatic handling of different portion sizes

## Usage

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

## API Reference

### Functions

#### `venues(): Promise<HighLevelVenue[]>`
Fetches all Wetherspoons venues.

**Returns:** Array of venue objects with basic information.

#### `getVenue(venue: HighLevelVenue): Promise<DetailedVenue>`
Gets detailed information about a specific venue.

**Parameters:**
- `venue`: A venue object from [`venues()`](src/index.ts:28)

**Returns:** Detailed venue information including sales areas and ordering capabilities.

#### `getMenus({ venue, salesAreaId }): Promise<HighLevelMenu[]>`
Fetches all menus for a specific sales area in a venue.

**Parameters:**
- `venue`: A detailed venue object from [`getVenue()`](src/index.ts:49)
- `salesAreaId`: The ID of the sales area

**Returns:** Array of menu objects.

#### `getMenu(highLevelMenu: HighLevelMenu): Promise<DetailedMenu>`
Gets detailed menu information including all products and categories.

**Parameters:**
- `highLevelMenu`: A menu object from [`getMenus()`](src/index.ts:66)

**Returns:** Detailed menu with categories, item groups, and products.

Menus marked `isSpecials: true` use the virtual `/menus/specials` endpoint,
even when the menu summary advertises a numeric ID. Their detail response has
`data.id: "specials"`; ordinary menu detail IDs remain numeric. Pass the menu
object returned by `getMenus()` so the Specials flag is preserved.

#### `getDrinks(highLevelVenue: HighLevelVenue): Promise<DrinksResult>`
Fetches alcoholic products from every orderable menu in every sales area, calculates alcohol units and price per unit, then sorts by best value.

**Parameters:**
- `highLevelVenue`: A venue object from [`venues()`](src/index.ts:28)

**Returns:** An explicit `available` result containing drinks sorted by price per unit, or an `unavailable` result for normal venue/menu availability conditions. Upstream transport and response-validation failures reject the promise.

```typescript
type DrinksResult =
  | { status: 'available'; drinks: Drink[]; partial?: boolean }
  | {
      status: 'unavailable';
      reason: 'venue-closed' | 'ordering-unavailable' | 'no-sales-area' |
        'no-orderable-menus' | 'no-usable-drinks';
      drinks: [];
    };
```

`partial` is `true` when drinks were recovered but at least one sales-area menu
list or detailed menu could not be fetched. Treat partial results as unsuitable
for complete price snapshots.

All exported request functions also accept `RequestOptions`:

```typescript
type RequestOptions = {
  signal?: AbortSignal;       // caller cancellation; never retried
  timeoutMs?: number;         // one end-to-end operation deadline, default 15 seconds
  attemptTimeoutMs?: number;  // per-attempt timeout, default 5 seconds
  retries?: number;           // transient retry count, default 2
};
```

### Types

#### `HighLevelVenue`
```typescript
{
  franchise: string;
  id: number;
  isClosed: boolean;
  name: string;
  venueRef: number;
}
```

#### `DetailedVenue`
```typescript
{
  canPlaceOrder: boolean;
  franchise: string;
  id: number;
  isClosed?: boolean;
  name: string;
  salesAreas: Array<{ id: number }>;
  venueCanOrder: boolean;
  venueRef: string | number;
}
```

#### `Drink`
```typescript
{
  name: string;
  units: number;        // Alcohol units
  productId: number;
  price: number;        // Major currency units
  ppu: number;          // Price per unit
  currency: string;     // ISO 4217 code, such as GBP or EUR
}
```

## How It Works

The package:
1. Connects to the JD Wetherspoon API
2. Validates all responses using Zod schemas for type safety
3. Calculates alcohol units based on ABV and volume information
4. Determines the best value portion size for each drink
5. Sorts drinks by price per unit to help find the best deals

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Explicitly run the slow production integration suite
npm run test:live

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Investigating API compatibility with the official client

An HTTP 500 is not enough to classify a failure as an upstream outage. Compare
the request with the official client and inspect raw JSON before our Zod schemas
strip unknown fields. Keep release checks strict while investigating.

The public web client was found on 6 November 2026 through Wetherspoons' own
Order and Pay page: https://www.jdwetherspoon.com/order-and-pay-app/ . It describes
the table QR codes linking to https://jdw.online/ . Following that redirect leads
to https://order.jdwetherspoon.com/ . No login, order or payment is needed to
inspect the public HTML and JavaScript.

To repeat the investigation:

1. Follow the redirect and save the HTML. Note the final URL, since relative
   asset paths belong to that host, not `jdw.online` (which redirects asset
   requests to the homepage too).

   ```bash
   curl -fsSL --max-time 30 https://jdw.online/ \
     -o /tmp/jdw-order.html -w '%{url_effective}\n'
   rg '<script[^>]+src=' /tmp/jdw-order.html
   ```

2. Download the main module script from the resolved host. On the investigation
   date it was the following asset; obtain the current hashed filename from the
   HTML each time rather than assuming this URL will remain valid. Verify that
   the download is JavaScript, not a successful HTML fallback response.

   ```bash
   curl -fsSL --max-time 30 \
     https://order.jdwetherspoon.com/assets/index-CP2QwH5f.js \
     -o /tmp/jdw-order-client.js
   ```

3. Inspect the downloaded source as text; it does not need to be executed.
   Search for `sales-areas`, `fetchMenus`, `fetchMenuById`, `specials`,
   `App-Version` and `API_PROXY_VERSION`. For readable snippets from the minified
   bundle, use this instead of printing its entire single line:

   ```python
   from pathlib import Path

   source = Path('/tmp/jdw-order-client.js').read_text()
   for term in ['fetchMenus', 'fetchMenuById', 'specials', 'App-Version']:
       offset = 0
       for _ in range(5):
           found = source.find(term, offset)
           if found < 0:
               break
           print(term, source[max(0, found - 180):found + 500])
           offset = found + len(term)
   ```

4. Trace the request helper and configuration as well as the URL builder.
   In that client, menu listing uses `?type=available`, detail requests use
   `/venues/{venueRef}/sales-areas/{salesAreaId}/menus/{menuId}` with a franchise
   prefix, and the HTTP client sends `App-Version: 26.0.1`, `Cache-Control:
   no-cache` and `Accept-Language`. The menu route accepts digits or `specials`.
   Minified symbol names and the app version can change between builds.

5. Make a small number of read-only requests to the affected pubs and a working
   control. Change one thing at a time: query, header, then menu path. Record
   status, raw menu identity/flags, and schema errors, without logging request
   credentials. Compare original and corrected collection close together so a
   changing menu is not mistaken for a code fix.

#### Specials regression found on 6 November 2026

For Sigered, King of Essex (7578, sales area 1111) and The Dictum of Kenilworth
(7591, sales area 1107), the raw legacy menu list advertised `id: 10287` and
`isSpecials: true`. Our schema discarded the flag, so we requested the numeric
detail route. The comparison was:

| Request / model | Observed result at both pubs |
| --- | --- |
| `/menus/10287` | HTTP 500, error Z556 |
| `/menus/specials`, with existing headers | HTTP 200, valid menu, `data.id: "specials"` |
| Successful Specials response through the old detail schema | Rejected because the ID was required to be a number |
| Menu listing with only `App-Version: 26.0.1` added | Specials ID becomes `"specials"`; ordinary IDs become decimal strings |
| Menu listing with only cache/language headers added | Legacy numeric IDs remain |

Adding the app-version header globally is not a drop-in fix: it also made our
unprefixed `/venues/{venueRef}` requests return 404; the official client uses a
franchise prefix for venue detail. A full version migration needs separate
contract checks for venue discovery, details and menus.

The narrow correction preserves `isSpecials`, routes flagged menus to
`/menus/specials`, and accepts the literal `"specials"` in the detail schema.
It uses neither the menu name nor the hard-coded numeric ID to identify Specials.
The existing headers and ordinary menu routing are retained. Genuine HTTP or
schema failures still produce partial results, and the live release test still
rejects those results. Do not skip Specials: they can contain products relevant
to drink prices.

Paired live probes reproduced the original failures and obtained complete
results with the correction at both pubs. The corrected probe also obtained
complete results at Walham Green (7634), Hykeham Manor (7934), and Captain
Flinders (7618). These are point-in-time observations, not a guarantee about
future availability. `src/specials.unit.test.ts` covers the request and schema
regression independently of the live service.

## License

MIT © [Joss Bird](https://github.com/slack2450)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

Report bugs and feature requests at [https://github.com/slack2450/wetherspoons-api/issues](https://github.com/slack2450/wetherspoons-api/issues)
