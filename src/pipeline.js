import { findOsm } from './sources/osm.js';
import { findPlaces } from './sources/places.js';
import { enrichFromWebsite } from './enrich.js';
import { aiDraft } from './drafts.js';
import { normalizePk } from './phone.js';
import { config } from './config.js';
import * as db from './db.js';

const say = (...a) => console.log(...a);

/** Step 1: find businesses and store them (deduped). */
export async function find({ city, kind = 'restaurants', area, google = !!config.placesApiKey }) {
  let found = [];
  if (google) {
    const q = `${kind} in ${area ? area + ', ' : ''}${city}`;
    say(`Google Places: "${q}"`);
    found = await findPlaces({ query: q });
  } else {
    say(`OpenStreetMap: ${kind} in ${city}`);
    found = await findOsm({ city, kind });
    if (area) found = found.filter(f => `${f.address} ${f.area ?? ''}`.toLowerCase().includes(area.toLowerCase()));
  }
  let added = 0;
  for (const l of found) if (db.upsertLead(l, city)) added++;
  say(`Found ${found.length}, new ${added}.`);
  return { found: found.length, added };
}

/** Step 2: visit websites for email / Instagram / WhatsApp. */
export async function enrich(limit = 200) {
  const rows = db.leadsToEnrich(limit);
  let n = 0;
  for (const l of rows) {
    const e = await enrichFromWebsite(l.website);
    db.updateLead(l.id, {
      enriched: 1,
      email: l.email ?? e.email ?? null,
      instagram: l.instagram ?? e.instagram ?? null,
      facebook: l.facebook ?? e.facebook ?? null,
      whatsapp: l.whatsapp ?? (e.whatsapp ? normalizePk(e.whatsapp) : null),
    });
    n++;
  }
  say(`Enriched ${n} websites.`);
  return n;
}

/** Step 3: write a personal WhatsApp + email draft for each contactable lead. */
export async function draft(limit = 200) {
  const rows = db.leadsToDraft(limit);
  for (const l of rows) {
    db.updateLead(l.id, await aiDraft(l));
    if (config.aiApiKey) await new Promise(r => setTimeout(r, 4500)); // stay under free-tier rate limits
  }
  say(`Drafted ${rows.length} messages.`);
  return rows.length;
}
