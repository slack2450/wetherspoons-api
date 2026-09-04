export const globalVenue = {
  identifier: 1234,
  name: 'Test Pub',
};

export const apiVenue = {
  franchise: 'jdw',
  id: 1,
  isClosed: false,
  name: 'Test Pub',
  venueRef: 1234,
  address: {
    line1: '1 Test Street',
    location: {
      latitude: 51.5,
      longitude: -0.1,
      distanceTolerance: null,
    },
  },
};

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
