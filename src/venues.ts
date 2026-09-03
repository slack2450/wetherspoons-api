import { z } from 'zod';
import type { RequestOptions } from './config.js';
import { apiToken } from './config.js';
import { request, requestGlobals } from './client.js';
import { requestContext, throwIfRequestStopped } from './http.js';
import { detailedVenueSchema, globalsSchema, highLevelVenueSchema } from './schemas.js';
import type { DetailedVenue, HighLevelVenue } from './schemas.js';

export async function venues(options?: RequestOptions): Promise<HighLevelVenue[]> {
  const context = requestContext(options);
  // Resolve the optional runtime override before starting either request.
  apiToken();
  const [globalsJson, response] = await Promise.all([requestGlobals(context), request('/venues', context)]);
  throwIfRequestStopped(context, 'Fetching venues');
  const globals = z.object({ venues: z.array(globalsSchema) }).parse(globalsJson);
  const apiVenues = z.object({ success: z.boolean().optional(), data: z.array(z.unknown()) }).parse(response);
  const openVenueIds = new Set(globals.venues.map(venue => venue.identifier));

  const result = apiVenues.data.flatMap((rawVenue) => {
    const reference = z.object({ venueRef: z.number() }).safeParse(rawVenue);
    if (!reference.success || !openVenueIds.has(reference.data.venueRef)) return [];
    // An open venue must satisfy the full contract; silently dropping it would
    // make a schema regression look like a legitimate closure.
    return [highLevelVenueSchema.parse(rawVenue)];
  });
  throwIfRequestStopped(context, 'Fetching venues');
  return result;
}

export async function getVenue(
  venue: Pick<HighLevelVenue, 'venueRef'>,
  options?: RequestOptions,
): Promise<DetailedVenue> {
  const context = requestContext(options);
  const response = await request(`/venues/${venue.venueRef}`, context);
  throwIfRequestStopped(context, `Fetching venue ${venue.venueRef}`);
  const result = z.object({ data: detailedVenueSchema }).parse(response).data;
  throwIfRequestStopped(context, `Fetching venue ${venue.venueRef}`);
  return result;
}
