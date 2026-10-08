// Find → enrich → draft, in one go.
// npm run find -- --city Lahore --kind restaurants --area "Johar Town"
import { find, enrich, draft } from '../src/pipeline.js';
import { counts } from '../src/db.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const city = arg('city', 'Lahore');
const kind = arg('kind', 'restaurants');
const area = arg('area');

await find({ city, kind, area, google: process.argv.includes('--google') ? true : undefined });
await enrich();
await draft();
const c = counts();
console.log(`\nTotal leads ${c.total} · WhatsApp ${c.withWhatsapp} · Email ${c.withEmail}`);
console.log('Dashboard kholo aur WhatsApp buttons se messages bhejo.');
