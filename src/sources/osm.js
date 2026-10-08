import { config } from '../config.js';

const KINDS = {
  restaurants: '["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]',
  cafes: '["amenity"="cafe"]',
  clinics: '["amenity"~"^(clinic|dentist|doctors)$"]',
  salons: '["shop"~"^(hairdresser|beauty)$"]',
  shops: '["shop"]',
};

/**
 * Free, no key: OpenStreetMap via Overpass.
 * Coverage of phone numbers varies, so we also crawl websites later.
 */
export async function findOsm({ city, kind = 'restaurants', limit = 300 }) {
  const filter = KINDS[kind] ?? KINDS.restaurants;
  const q = `[out:json][timeout:60];
area["name"="${city.replace(/"/g, '')}"]["boundary"="administrative"]->.a;
(node${filter}(area.a);way${filter}(area.a););
out center tags ${limit};`;
  const res = await fetch(config.overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.elements ?? [])
    .filter(e => e.tags?.name)
    .map(e => {
      const t = e.tags;
      return {
        source: 'osm',
        source_id: `${e.type}/${e.id}`,
        name: t.name,
        category: t.cuisine ? `${t.amenity ?? t.shop} (${t.cuisine})` : (t.amenity ?? t.shop ?? kind),
        phone: t['contact:phone'] ?? t.phone ?? t['contact:mobile'] ?? t['contact:whatsapp'] ?? null,
        website: t['contact:website'] ?? t.website ?? null,
        email: t['contact:email'] ?? t.email ?? null,
        instagram: t['contact:instagram'] ?? null,
        facebook: t['contact:facebook'] ?? null,
        address: [t['addr:street'], t['addr:suburb'] ?? t['addr:neighbourhood'], t['addr:city'] ?? city].filter(Boolean).join(', '),
        area: t['addr:suburb'] ?? t['addr:neighbourhood'] ?? null,
        rating: null,
        reviews: null,
      };
    });
}
