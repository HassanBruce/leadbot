import { config } from '../config.js';

/**
 * Optional: Google Places API (New) Text Search. Much better phone coverage than OSM.
 * Needs GOOGLE_PLACES_API_KEY (Google Cloud project with billing enabled; Google
 * gives a monthly free usage allowance — check current limits in the console).
 */
export async function findPlaces({ query, maxPages = 3 }) {
  if (!config.placesApiKey) throw new Error('GOOGLE_PLACES_API_KEY not set');
  const out = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.placesApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,nextPageToken',
      },
      body: JSON.stringify({ textQuery: query, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    for (const p of data.places ?? []) {
      out.push({
        source: 'google',
        source_id: p.id,
        name: p.displayName?.text ?? '',
        category: p.primaryTypeDisplayName?.text ?? null,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        email: null, instagram: null, facebook: null,
        address: p.formattedAddress ?? '',
        area: null,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise(r => setTimeout(r, 1500)); // token needs a moment to become valid
  }
  return out;
}
