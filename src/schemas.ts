import { z } from 'zod';

export const addressSchema = z.object({
  line1: z.string().nullable().optional(),
  line2: z.string().nullable().optional(),
  line3: z.string().nullable().optional(),
  town: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  country: z.object({ name: z.string(), code: z.string() }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    distanceTolerance: z.number().nullable().optional(),
  }).optional(),
}).passthrough();

export const highLevelVenueSchema = z.object({
  franchise: z.string(), id: z.number(), isClosed: z.boolean(), name: z.string(),
  venueRef: z.number(), address: addressSchema,
}).passthrough();

export const globalsSchema = z.object({ identifier: z.number(), name: z.string() });

export const detailedVenueSchema = z.object({
  canPlaceOrder: z.boolean().nullable().optional(),
  franchise: z.string(),
  id: z.number(),
  isClosed: z.boolean().nullable().optional(),
  name: z.string(),
  salesAreas: z.array(z.object({ id: z.number() }).passthrough()),
  venueCanOrder: z.boolean().nullable().optional(),
  venueRef: z.union([z.string(), z.number()]),
  address: addressSchema,
}).passthrough();

export const highLevelMenuSchema = z.object({
  canOrder: z.boolean(), franchise: z.string(), id: z.number(), name: z.string(),
  salesAreaId: z.number(), venueRef: z.number(),
});

export const detailedMenuProductSchema = z.object({
  id: z.number(),
  isOutOfStock: z.boolean(),
  itemType: z.literal('product'),
  name: z.string(),
  description: z.string().nullable().transform(value => value ?? ''),
  options: z.object({
    portion: z.object({
      options: z.array(z.object({
        label: z.string(),
        value: z.object({
          price: z.object({
            currency: z.string().regex(/^[A-Z]{3}$/, 'Expected an uppercase three-letter currency code'),
            discount: z.number(), initialValue: z.number(), value: z.number(),
          }),
        }),
      })),
    }),
  }),
});

export const detailedMenuSchema = z.object({
  data: z.object({
    canOrder: z.boolean(),
    categories: z.array(z.object({
      itemGroups: z.array(z.object({
        items: z.array(z.union([
          z.object({ itemType: z.literal('text'), text: z.string() }),
          z.object({ itemType: z.literal('divider') }),
          z.object({ itemType: z.literal('ale') }).passthrough(),
          detailedMenuProductSchema,
        ])),
        name: z.string().nullable(),
      })),
      name: z.string(),
    })),
    franchise: z.string(), id: z.number(), salesAreaId: z.number(), venueRef: z.number(),
  }),
});

export type HighLevelVenue = z.infer<typeof highLevelVenueSchema>;
export type DetailedVenue = z.infer<typeof detailedVenueSchema>;
export type HighLevelMenu = z.infer<typeof highLevelMenuSchema>;
export type DetailedMenuProduct = z.infer<typeof detailedMenuProductSchema>;
export type DetailedMenu = z.infer<typeof detailedMenuSchema>;
