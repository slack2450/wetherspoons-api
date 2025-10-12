import { z } from 'zod';

const API_ENDPOINT = 'https://ca.jdw-apps.net/api/v0.1';
const API_HEADERS = {
  Authorization: 'Bearer 1|SFS9MMnn5deflq0BMcUTSijwSMBB4mc7NSG2rOhqb2765466',
};

const addressSchema = z.object({
  line1: z.string().nullable().optional(),
  line2: z.string().nullable().optional(),
  town: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  // allow extra keys like location etc if present
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      distanceTolerance: z.number().optional(),
    })
    .optional(),
});

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${API_ENDPOINT}${path}`,
    {
      headers: API_HEADERS,
    },
  );
  const json = await response.json();
  return json;
}

export const highLevelVenueSchema = z.object({
  franchise: z.string(),
  id: z.number(),
  isClosed: z.boolean(),
  name: z.string(),
  venueRef: z.number(),
  address: addressSchema,
});

export type HighLevelVenue = z.infer<typeof highLevelVenueSchema>;

export async function venues(): Promise<HighLevelVenue[]> {
  const response = await request('/venues');
  const venues = z.object({ data: z.array(highLevelVenueSchema) }).parse(response);
  return venues.data;
}

const detailedVenueSchema = z.object({
  canPlaceOrder: z.boolean(),
  franchise: z.string(),
  id: z.number(),
  isClosed: z.boolean().optional(),
  name: z.string(),
  salesAreas: z.array(z.object({
    id: z.number(),
  })),
  venueCanOrder: z.boolean(),
  venueRef: z.union([z.string(), z.number()]),
  address: addressSchema,
});

export type DetailedVenue = z.infer<typeof detailedVenueSchema>;

export async function getVenue(venue: HighLevelVenue): Promise<DetailedVenue> {
  const response = await request(`/venues/${venue.venueRef}`);
  const venueDetails = z.object({ data: detailedVenueSchema }).parse(response);
  return venueDetails.data;
}

export const highLevelMenuSchema = z.object({
  canOrder: z.boolean(),
  franchise: z.string(),
  id: z.number(),
  name: z.string(),
  salesAreaId: z.number(),
  venueRef: z.number(),
});

export type HighLevelMenu = z.infer<typeof highLevelMenuSchema>;

export async function getMenus({ venue, salesAreaId }: { venue: DetailedVenue, salesAreaId: number }): Promise<HighLevelMenu[]> {
  const response = await request(`/${venue.franchise}/venues/${venue.venueRef}/sales-areas/${salesAreaId}/menus`);
  const menus = z.object({ data: z.array(highLevelMenuSchema) }).parse(response);
  return menus.data;
}

const detailedMenuProductSchema = z.object({
  id: z.number(),
  isOutOfStock: z.boolean(),
  itemType: z.literal('product'),
  name: z.string(),
  description: z.string(),
  options: z.object({
    portion: z.object({
      options: z.array(z.object({
        label: z.string(),
        value: z.object({
          price: z.object({
            currency: z.string(),
            discount: z.number(),
            initialValue: z.number(),
            value: z.number(),
          }),
        }),
      })),
    }),
  }),
});

export type DetailedMenuProduct = z.infer<typeof detailedMenuProductSchema>;

const detailedMenuSchema = z.object({
  data: z.object({
    canOrder: z.boolean(),
    categories: z.array(z.object({
      itemGroups: z.array(z.object({
        items: z.array(z.union([
          z.object({
            itemType: z.literal('text'),
            text: z.string(),
          }),
          z.object({
            itemType: z.literal('divider'),
          }),
          z.object({
            itemType: z.literal('ale'),
          }),
          detailedMenuProductSchema,
        ])),
        name: z.string().nullable(),
      })),
      name: z.string(),
    })),
    franchise: z.string(),
    id: z.number(),
    salesAreaId: z.number(),
    venueRef: z.number(),
  }),
});

export type DetailedMenu = z.infer<typeof detailedMenuSchema>;

export async function getMenu(highLevelMenu: HighLevelMenu): Promise<DetailedMenu> {
  const response = await request(`/${highLevelMenu.franchise}/venues/${highLevelMenu.venueRef}/sales-areas/${highLevelMenu.salesAreaId}/menus/${highLevelMenu.id}`);
  const detailedMenu = detailedMenuSchema.parse(response);
  return detailedMenu;
}

function strengthAndVolumeToUnits(strength: number, volume: number) {
  return (strength * volume) / 1000;
}

export interface Drink {
  name: string
  units: number
  productId: number
  price: number
  ppu: number
}

export async function getDrinks(highLevelVenue: HighLevelVenue): Promise<Drink[]> {
  const detailedVenue = await getVenue(highLevelVenue);

  const salesArea = detailedVenue.salesAreas[0];

  if (!salesArea) return [];

  const menus = await getMenus({ venue: detailedVenue, salesAreaId: salesArea.id });

  let drinksMenu;
  for (const menu of menus) {
    if (menu.name === 'Drinks') {
      drinksMenu = menu;
      break;
    }
  }

  if (!drinksMenu) return [];
  const res = await getMenu(drinksMenu);

  // Convert menu to flat array of drinks
  const hash_map = new Map<number, DetailedMenuProduct>();

  for (const categories of res.data.categories) {
    for (const itemGroup of categories.itemGroups) {
      for (const item of itemGroup.items) {
        if (item.itemType == 'product') {
          // Skip out of stock
          if (item.isOutOfStock) {
            continue;
          }
          hash_map.set(item.id, item);
        }
      }
    }
  }

  const drinks: Drink[] = [];

  for (const product of hash_map.values()) {
    const strengthMatches = product.description.match(/(\d?\d?\.?\d?\d%)\s?ABV/);
    const volumeDescriptionMatches = product.description.match(/(\d?\d\d)ml/);

    let strength;
    if (strengthMatches) {
      strength = parseFloat(strengthMatches[0]);
    }

    let volumeDescription;
    if (volumeDescriptionMatches) {
      volumeDescription = parseFloat(volumeDescriptionMatches[0]);
    }

    let bestPortion;
    let bestPPU = Infinity;
    let bestUnits = 0;

    for (const portion of product.options.portion.options) {
      let units;

      const volumeMatches = portion.label.match(/(\d?\d\d)ml/);

      let volume;
      if (volumeMatches && volumeMatches[1])
        volume = parseFloat(volumeMatches[1]);

      const unitsMatches = portion.label.match(/(\d?\.?\d?\d) unit/);
      if (unitsMatches && unitsMatches[1])
        units = parseFloat(unitsMatches[1]);

      if (portion.label === 'Pint' && strength) {
        units = strengthAndVolumeToUnits(strength, 568);
      } else if (['Half pint', 'Half Pint', 'Half'].includes(portion.label) && typeof strength !== 'undefined') {
        units = strengthAndVolumeToUnits(strength, 284);
      } else if (typeof strength !== 'undefined' && volume) {
        units = strengthAndVolumeToUnits(strength, volume);
      } else if (typeof strength !== 'undefined' && volumeDescription) {
        units = strengthAndVolumeToUnits(strength, volumeDescription);
      } else if (typeof strength !== 'undefined' && portion.label === 'Single') {
        units = strengthAndVolumeToUnits(strength, 25);
      } else if (typeof strength !== 'undefined' && portion.label === 'Double') {
        units = strengthAndVolumeToUnits(strength, 50);
      }

      if (typeof units !== 'undefined') {
        const ppu = portion.value.price.value / units;

        if (ppu < bestPPU) {
          bestPPU = ppu;
          bestPortion = portion;
          bestUnits = units;
        }
      }
    }

    if (typeof bestPortion !== 'undefined') {
      drinks.push({
        name: product.name,
        units: bestUnits,
        ppu: bestPPU,
        productId: product.id,
        price: bestPortion?.value.price.value,
      });
    }
  }

  drinks.sort((a, b) => {
    return a.ppu - b.ppu;
  });

  return drinks;
}
