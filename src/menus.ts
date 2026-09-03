import { z } from 'zod';
import type { RequestOptions } from './config.js';
import { request } from './client.js';
import { requestContext, throwIfRequestStopped } from './http.js';
import { detailedMenuSchema, highLevelMenuSchema } from './schemas.js';
import type { DetailedMenu, DetailedVenue, HighLevelMenu } from './schemas.js';

export async function getMenus(
  { venue, salesAreaId }: { venue: DetailedVenue, salesAreaId: number },
  options?: RequestOptions,
): Promise<HighLevelMenu[]> {
  const context = requestContext(options);
  const response = await request(
    `/${venue.franchise}/venues/${venue.venueRef}/sales-areas/${salesAreaId}/menus`, context,
  );
  throwIfRequestStopped(context, `Fetching menus for venue ${venue.venueRef}`);
  const result = z.object({ data: z.array(highLevelMenuSchema) }).parse(response).data;
  throwIfRequestStopped(context, `Fetching menus for venue ${venue.venueRef}`);
  return result;
}

export async function getMenu(menu: HighLevelMenu, options?: RequestOptions): Promise<DetailedMenu> {
  const context = requestContext(options);
  const response = await request(
    `/${menu.franchise}/venues/${menu.venueRef}/sales-areas/${menu.salesAreaId}/menus/${menu.id}`, context,
  );
  throwIfRequestStopped(context, `Fetching menu ${menu.id} for venue ${menu.venueRef}`);
  const result = detailedMenuSchema.parse(response);
  throwIfRequestStopped(context, `Fetching menu ${menu.id} for venue ${menu.venueRef}`);
  return result;
}
