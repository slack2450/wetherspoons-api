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
//     price: 249,  // in pence
//     ppu: 109.69  // price per unit in pence
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

#### `getDrinks(highLevelVenue: HighLevelVenue): Promise<DrinksResult>`
Fetches alcoholic products from every orderable menu in every sales area, calculates alcohol units and price per unit, then sorts by best value.

**Parameters:**
- `highLevelVenue`: A venue object from [`venues()`](src/index.ts:28)

**Returns:** An explicit `available` result containing drinks sorted by price per unit, or an `unavailable` result for normal venue/menu availability conditions. Upstream transport and response-validation failures reject the promise.

```typescript
type DrinksResult =
  | { status: 'available'; drinks: Drink[] }
  | {
      status: 'unavailable';
      reason: 'venue-closed' | 'ordering-unavailable' | 'no-sales-area' |
        'no-orderable-menus' | 'no-usable-drinks';
      drinks: [];
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
  price: number;        // Price in pence
  ppu: number;          // Price per unit in pence
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

## License

MIT © [Joss Bird](https://github.com/slack2450)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

Report bugs and feature requests at [https://github.com/slack2450/wetherspoons-api/issues](https://github.com/slack2450/wetherspoons-api/issues)
