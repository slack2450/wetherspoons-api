import type { RequestOptions } from './config.js';
import { requestContext, throwIfRequestStopped } from './http.js';
import { getMenu, getMenus } from './menus.js';
import type { DetailedMenu, DetailedMenuProduct, HighLevelVenue } from './schemas.js';
import { getVenue } from './venues.js';

export interface Drink {
  name: string
  units: number
  productId: number
  price: number
  ppu: number
  currency: string
}

export type DrinksUnavailableReason
  = | 'venue-closed'
    | 'ordering-unavailable'
    | 'no-sales-area'
    | 'no-orderable-menus'
    | 'no-usable-drinks';

export type DrinksResult
  = | { status: 'available', drinks: Drink[], partial?: boolean }
    | { status: 'unavailable', reason: DrinksUnavailableReason, drinks: [] };

function unitsFromProduct(product: DetailedMenuProduct, label: string): number | undefined {
  const strength = Number.parseFloat(product.description.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*ABV/i)?.[1] ?? '');
  const labelledUnits = Number.parseFloat(label.match(/(\d+(?:\.\d+)?)\s*units?/i)?.[1] ?? '');
  if (Number.isFinite(labelledUnits)) return labelledUnits;
  if (!Number.isFinite(strength)) return undefined;

  const explicitVolume = Number.parseFloat(label.match(/(\d{2,4}(?:\.\d+)?)\s*ml/i)?.[1] ?? '');
  const describedVolume = Number.parseFloat(product.description.match(/(\d{2,4}(?:\.\d+)?)\s*ml/i)?.[1] ?? '');
  const normalizedLabel = label.trim().toLowerCase();
  const volume = Number.isFinite(explicitVolume)
    ? explicitVolume
    : normalizedLabel === 'pint'
      ? 568
      : ['half pint', 'half'].includes(normalizedLabel)
          ? 284
          : normalizedLabel === 'single'
            ? 25
            : normalizedLabel === 'double'
              ? 50
              : describedVolume;
  return Number.isFinite(volume) ? strength * volume / 1000 : undefined;
}

function drinkFromProduct(product: DetailedMenuProduct): Drink | undefined {
  let best: Drink | undefined;
  for (const portion of product.options.portion.options) {
    const units = unitsFromProduct(product, portion.label);
    const price = portion.value.price.value;
    if (units === undefined || units <= 0 || !Number.isFinite(price) || price < 0) continue;
    const candidate: Drink = {
      name: product.name,
      units,
      productId: product.id,
      price,
      ppu: price / units,
      currency: portion.value.price.currency,
    };
    if (!best || candidate.ppu < best.ppu) best = candidate;
  }
  return best;
}

function drinksFromMenus(menus: DetailedMenu[]): Drink[] {
  const drinks = new Map<number, Drink>();
  for (const menu of menus) {
    for (const category of menu.data.categories) {
      for (const group of category.itemGroups) {
        for (const item of group.items) {
          if (item.itemType !== 'product' || item.isOutOfStock) continue;
          const candidate = drinkFromProduct(item);
          const current = drinks.get(item.id);
          if (candidate && (!current || candidate.ppu < current.ppu)) drinks.set(item.id, candidate);
        }
      }
    }
  }
  return [...drinks.values()].sort((left, right) => left.ppu - right.ppu);
}

function successful<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}

function failures<T>(results: PromiseSettledResult<T>[]): unknown[] {
  return results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
}

export async function getDrinks(
  highLevelVenue: Pick<HighLevelVenue, 'venueRef'>,
  options?: RequestOptions,
): Promise<DrinksResult> {
  const context = requestContext(options);
  const operation = `Fetching drinks for venue ${highLevelVenue.venueRef}`;
  const venue = await getVenue(highLevelVenue, context);
  throwIfRequestStopped(context, operation);
  if (venue.isClosed === true) return { status: 'unavailable', reason: 'venue-closed', drinks: [] };
  if (venue.canPlaceOrder === false || venue.venueCanOrder === false) {
    return { status: 'unavailable', reason: 'ordering-unavailable', drinks: [] };
  }
  if (venue.salesAreas.length === 0) return { status: 'unavailable', reason: 'no-sales-area', drinks: [] };

  const menuListResults = await Promise.allSettled(
    venue.salesAreas.map(salesArea => getMenus({ venue, salesAreaId: salesArea.id }, context)),
  );
  // Promise.allSettled must not turn an AbortSignal into a partial result.
  throwIfRequestStopped(context, operation);
  const menuListErrors = failures(menuListResults);
  const menus = successful(menuListResults).flat().filter(menu => menu.canOrder);
  if (menus.length === 0) {
    if (menuListErrors.length > 0) {
      throw new AggregateError(menuListErrors, 'No complete sales-area menu request produced an orderable menu');
    }
    return { status: 'unavailable', reason: 'no-orderable-menus', drinks: [] };
  }

  const detailedResults = await Promise.allSettled(menus.map(menu => getMenu(menu, context)));
  throwIfRequestStopped(context, operation);
  const detailedErrors = failures(detailedResults);
  // Availability can change between the menu-list and detail requests. The
  // detailed response is authoritative, so never expose products from a menu
  // that has since stopped accepting orders.
  const orderableDetailedMenus = successful(detailedResults).filter(menu => menu.data.canOrder);
  const errors = [...menuListErrors, ...detailedErrors];
  if (orderableDetailedMenus.length === 0) {
    if (errors.length > 0) {
      throw new AggregateError(errors, 'No complete detailed request produced an orderable menu');
    }
    return { status: 'unavailable', reason: 'no-orderable-menus', drinks: [] };
  }
  const drinks = drinksFromMenus(orderableDetailedMenus);
  throwIfRequestStopped(context, operation);
  if (drinks.length > 0) {
    return errors.length > 0 ? { status: 'available', drinks, partial: true } : { status: 'available', drinks };
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Menu requests failed before any usable drinks were found');
  return { status: 'unavailable', reason: 'no-usable-drinks', drinks: [] };
}
