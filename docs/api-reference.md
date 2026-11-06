# API reference

[Documentation](README.md) · [Package overview](../README.md)

### Functions

#### `venues(): Promise<HighLevelVenue[]>`
Fetches all Wetherspoons venues.

**Returns:** Array of venue objects with basic information.

#### `getVenue(venue: HighLevelVenue): Promise<DetailedVenue>`
Gets detailed information about a specific venue.

**Parameters:**
- `venue`: A venue object from [`venues()`](../src/venues.ts)

**Returns:** Detailed venue information including sales areas and ordering capabilities.

#### `getMenus({ venue, salesAreaId }): Promise<HighLevelMenu[]>`
Fetches all menus for a specific sales area in a venue.

**Parameters:**
- `venue`: A detailed venue object from [`getVenue()`](../src/venues.ts)
- `salesAreaId`: The ID of the sales area

**Returns:** Array of menu objects.

#### `getMenu(highLevelMenu: HighLevelMenu): Promise<DetailedMenu>`
Gets detailed menu information including all products and categories.

**Parameters:**
- `highLevelMenu`: A menu object from [`getMenus()`](../src/menus.ts)

**Returns:** Detailed menu with categories, item groups, and products.

Menus marked `isSpecials: true` use the virtual `/menus/specials` endpoint,
even when the menu summary advertises a numeric ID. Their detail response has
`data.id: "specials"`; ordinary menu detail IDs remain numeric. Pass the menu
object returned by `getMenus()` so the Specials flag is preserved.

#### `getDrinks(highLevelVenue: HighLevelVenue): Promise<DrinksResult>`
Fetches alcoholic products from every orderable menu in every sales area, calculates alcohol units and price per unit, then sorts by best value.

**Parameters:**
- `highLevelVenue`: A venue object from [`venues()`](../src/venues.ts)

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
