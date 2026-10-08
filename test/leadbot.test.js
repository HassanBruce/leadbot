import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATA_DIR = ':memory:';
process.env.ADMIN_PASSWORD = 'pw';
process.env.AI_API_KEY = 'k';
process.env.SMTP_USER = 'me@gmail.com';
process.env.SMTP_PASS = 'app-pass';
process.env.EMAIL_DAILY_LIMIT = '2';
process.env.SENDER_NAME = 'Hassan';

const { normalizePk, isMobile, findPkMobiles } = await import('../src/phone.js');
const { config } = await import('../src/config.js');
const pipeline = await import('../src/pipeline.js');
const db = await import('../src/db.js');
const { sendQueued, setTransport } = await import('../src/mailer.js');
const { templateDraft } = await import('../src/drafts.js');
const { createApp } = await import('../src/server.js');

// ---- mock internet ----
const realFetch = globalThis.fetch;
let aiMode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const html = b => new Response(b, { status: 200, headers: { 'content-type': 'text/html' } });
  const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
  if (u.includes('overpass')) {
    assert.match(decodeURIComponent(opts.body), /Lahore/);
    return json({ elements: [
      { type: 'node', id: 1, tags: { name: 'Butt Karahi', amenity: 'restaurant', cuisine: 'pakistani', phone: '0300-1234567', 'addr:suburb': 'Lakshmi Chowk', website: 'https://buttkarahi.pk' } },
      { type: 'node', id: 2, tags: { name: 'Cafe Aylanto', amenity: 'cafe', phone: '+92 42 35751234', 'addr:suburb': 'Gulberg', website: 'cafeaylanto.com' } },
      { type: 'node', id: 3, tags: { name: 'Butt Karahi Branch 2', amenity: 'restaurant', phone: '+923001234567' } }, // same mobile → dup
      { type: 'node', id: 4, tags: { amenity: 'restaurant' } }, // no name → ignored
      { type: 'way', id: 5, tags: { name: 'Insta Burgers', amenity: 'fast_food', website: 'https://instagram.com/instaburgers', 'addr:suburb': 'Johar Town' } },
    ] });
  }
  if (u.startsWith('https://buttkarahi.pk/contact')) return html('mail: orders&#64;buttkarahi.pk <img src="logo@2x.png">');
  if (u.startsWith('https://buttkarahi.pk')) return html('<a href="/contact">Contact</a>');
  if (u.startsWith('https://cafeaylanto.com')) return html('<a href="https://instagram.com/cafeaylanto">IG</a> <a href="https://wa.me/923214567890">WhatsApp</a> info@cafeaylanto.com');
  if (u.includes('places.googleapis.com')) {
    assert.equal(opts.headers['X-Goog-Api-Key'], 'gkey');
    return json({ places: [{ id: 'g1', displayName: { text: 'Bundu Khan' }, formattedAddress: 'Liberty, Lahore', internationalPhoneNumber: '+92 333 7654321', rating: 4.3, userRatingCount: 5120 }] });
  }
  if (u.includes('/chat/completions')) {
    if (aiMode === 'fail') return new Response('nope', { status: 429 });
    const p = JSON.parse(opts.body).messages[0].content;
    const name = p.match(/"name":"([^"]+)"/)[1];
    return json({ choices: [{ message: { content: JSON.stringify({
      wa_message: `Assalam o Alaikum ${name}! Demo bhej doon?`,
      email_subject: `WhatsApp assistant for ${name}`,
      email_body: `Assalam o Alaikum ${name} team, ... Hassan`,
    }) } }] });
  }
  throw new Error('unexpected fetch ' + u);
};

test('Pakistani phone normalization', () => {
  assert.equal(normalizePk('0300-1234567'), '923001234567');
  assert.equal(normalizePk('+92 300 1234567'), '923001234567');
  assert.equal(normalizePk('3001234567'), '923001234567');
  assert.equal(normalizePk('042-35751234'), '924235751234');
  assert.equal(normalizePk('0300 1234567; 042 111222333'), '923001234567');
  assert.equal(normalizePk('12345'), null);
  assert.ok(isMobile('923001234567'));
  assert.ok(!isMobile('924235751234'));
  assert.deepEqual(findPkMobiles('call 0321-4567890 or +92 300 1112223'), ['923214567890', '923001112223']);
});

test('find (OSM) dedupes and keeps only named places', async () => {
  const r = await pipeline.find({ city: 'Lahore', kind: 'restaurants', google: false });
  assert.equal(r.found, 4);
  assert.equal(r.added, 3); // Branch 2 shares the mobile → skipped
  const again = await pipeline.find({ city: 'Lahore', google: false });
  assert.equal(again.added, 0);
});

test('area filter', async () => {
  const leads = db.listLeads({ status: 'all' });
  assert.equal(leads.length, 3);
  assert.ok(leads.some(l => l.area === 'Johar Town'));
});

test('enrich pulls email, Instagram and WhatsApp from websites', async () => {
  await pipeline.enrich();
  const leads = db.listLeads({ status: 'all' });
  const butt = leads.find(l => l.name === 'Butt Karahi');
  assert.equal(butt.email, 'orders@buttkarahi.pk');
  const cafe = leads.find(l => l.name === 'Cafe Aylanto');
  assert.equal(cafe.whatsapp, '923214567890');     // landline listing, mobile found on site
  assert.equal(cafe.email, 'info@cafeaylanto.com');
  assert.match(cafe.instagram, /cafeaylanto/);
  const insta = leads.find(l => l.name === 'Insta Burgers');
  assert.match(insta.instagram, /instaburgers/);
});

test('drafts: AI personalized, template fallback on failure', async () => {
  // speed: no rate-limit pause in tests
  const orig = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => orig(fn, 0);
  const n = await pipeline.draft();
  globalThis.setTimeout = orig;
  assert.equal(n, 2); // Insta Burgers has no phone/email → not drafted
  const butt = db.listLeads({ status: 'all' }).find(l => l.name === 'Butt Karahi');
  assert.match(butt.wa_message, /Butt Karahi/);
  assert.match(butt.email_body, /stop/); // opt-out line enforced

  aiMode = 'fail';
  const { aiDraft } = await import('../src/drafts.js');
  const d = await aiDraft({ name: 'Test Dhaba' });
  assert.match(d.wa_message, /Test Dhaba/);
  assert.match(d.wa_message, /demo/i);
  aiMode = 'ok';
  assert.ok(templateDraft({ name: 'X' }).email_body.includes('stop'));
});

test('email: dry run sends nothing; real send respects daily limit and opt-out', async () => {
  const sent = [];
  setTransport({ sendMail: async m => { sent.push(m); return {}; } });
  await sendQueued({ dryRun: true });
  assert.equal(sent.length, 0);

  // opt-out one of the two
  db.optOut('info@cafeaylanto.com');
  const r = await sendQueued({ dryRun: false, delaySeconds: 0 });
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, 'orders@buttkarahi.pk');
  assert.match(sent[0].from, /Hassan <me@gmail.com>/);
  // nothing left / never double-sends
  const r2 = await sendQueued({ dryRun: false, delaySeconds: 0 });
  assert.equal(r2.sent, 0);
  assert.equal(db.listLeads({ status: 'all' }).find(l => l.name === 'Butt Karahi').status, 'contacted');
});

test('Google Places source (optional key)', async () => {
  config.placesApiKey = 'gkey';
  const r = await pipeline.find({ city: 'Lahore', area: 'Liberty' });
  assert.equal(r.added, 1);
  const b = db.listLeads({ status: 'all', q: 'Bundu' })[0];
  assert.equal(b.whatsapp, '923337654321');
  assert.equal(b.reviews, 5120);
  config.placesApiKey = '';
});

test('dashboard: auth, list, WhatsApp click marks contacted', async () => {
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Basic ' + Buffer.from('a:pw').toString('base64') };
  assert.equal((await fetch(base)).status, 401);
  const html = await (await fetch(`${base}/?status=all`, { headers: auth })).text();
  assert.match(html, /Cafe Aylanto/);
  const cafe = db.listLeads({ status: 'all', q: 'Aylanto' })[0];
  const r = await fetch(`${base}/wa/${cafe.id}`, { headers: auth, redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^https:\/\/wa\.me\/923214567890\?text=Assalam/);
  assert.equal(db.getLead(cafe.id).status, 'contacted');
  server.close();
});
