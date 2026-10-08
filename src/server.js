import express from 'express';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import * as db from './db.js';
import { waLink } from './drafts.js';
import { find, enrich, draft } from './pipeline.js';
import { sendQueued } from './mailer.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUSES = ['new', 'contacted', 'replied', 'interested', 'demo', 'won', 'lost', 'skip'];
let job = { running: false, text: '' };

async function runJob(name, fn) {
  if (job.running) return;
  job = { running: true, text: `${name}…` };
  const orig = console.log;
  console.log = (...a) => { job.text = a.join(' '); orig(...a); };
  try { await fn(); job.text = `${name}: done. ${job.text}`; }
  catch (e) { job.text = `${name} failed: ${e.message}`; }
  finally { console.log = orig; job.running = false; }
}

function page({ leads, c, status, q }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Leads</title>${job.running ? '<meta http-equiv="refresh" content="8">' : ''}
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1c1d1a;--mute:#6d6f68;--line:#e4e3dc;--wa:#1a7f4b;--accent:#2f5bd3}
@media (prefers-color-scheme:dark){:root{--bg:#121311;--card:#1b1c19;--ink:#ebebe6;--mute:#9b9d95;--line:#2c2d29;--wa:#3fbf7f;--accent:#7f9cf5}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:19px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:22px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.mute{color:var(--mute);font-size:13px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.stats a{background:var(--card);border:1px solid var(--line);border-radius:99px;padding:5px 12px;color:var(--ink);text-decoration:none;font-size:14px}
.stats a.on{border-color:var(--accent);color:var(--accent);font-weight:600}
form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input,select,textarea,button{font:inherit;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
button{cursor:pointer}.btn-wa{background:var(--wa);border-color:var(--wa);color:#fff;text-decoration:none;padding:7px 12px;border-radius:8px;display:inline-block;font-weight:600}
.lead{border-top:1px solid var(--line);padding:14px 0}.lead:first-child{border-top:0;padding-top:0}
.lead h3{margin:0;font-size:16px}.msg{white-space:pre-wrap;background:var(--bg);border-radius:8px;padding:10px;margin:8px 0;font-size:14px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px}
a{color:var(--accent)}details summary{cursor:pointer;color:var(--mute);font-size:13px}
</style></head><body><main>
<h1>Leads</h1><div class="mute">${c.total} total · ${c.withWhatsapp} WhatsApp · ${c.withEmail} email · ${c.emailedToday}/${config.emailDailyLimit} emails today</div>

<h2>Naye leads dhoondo</h2>
<div class="card"><form method="post" action="/run/find" class="inline">
<input name="city" value="Lahore" required style="width:110px">
<select name="kind"><option>restaurants</option><option>cafes</option><option>clinics</option><option>salons</option><option>shops</option></select>
<input name="area" placeholder="Area (optional) e.g. Johar Town">
<button ${job.running ? 'disabled' : ''}>Find + draft</button></form>
<form method="post" action="/run/email" class="inline" style="margin-top:10px">
<button ${job.running ? 'disabled' : ''} onclick="return confirm('Queued emails abhi bhej dein? (daily limit ${config.emailDailyLimit})')">Send queued emails</button>
<span class="mute">${esc(job.text)}</span></form></div>

<div class="stats">
<a href="/?status=all" class="${status === 'all' ? 'on' : ''}">All ${c.total}</a>
${STATUSES.map(s => `<a href="/?status=${s}" class="${status === s ? 'on' : ''}">${s} ${c.by[s] ?? 0}</a>`).join('')}
</div>
<form class="inline" method="get"><input type="hidden" name="status" value="${esc(status)}"><input name="q" value="${esc(q ?? '')}" placeholder="Search name / area"><button>Search</button></form>

<h2>${esc(status)} leads</h2>
<div class="card">
${leads.map(l => `<div class="lead">
<div class="row" style="justify-content:space-between"><h3>${esc(l.name)}</h3><span class="tag">${esc(l.status)}</span></div>
<div class="mute">${esc(l.category ?? '')}${l.rating ? ` · ★ ${l.rating} (${l.reviews ?? 0})` : ''} · ${esc(l.address ?? l.city ?? '')}</div>
<div class="row mute">${l.whatsapp ? `📱 +${esc(l.whatsapp)}` : l.phone ? `☎️ +${esc(l.phone)} (landline)` : ''}
${l.email ? `✉️ ${esc(l.email)}${l.email_sent_at ? ' (sent)' : ''}` : ''}
${l.instagram ? `<a href="${esc(l.instagram)}" target="_blank">Instagram</a>` : ''}
${l.facebook ? `<a href="${esc(l.facebook)}" target="_blank">Facebook</a>` : ''}
${l.website ? `<a href="${esc(l.website)}" target="_blank">Website</a>` : ''}</div>
${l.wa_message ? `<div class="msg">${esc(l.wa_message)}</div>` : ''}
<div class="row">
${l.whatsapp && l.wa_message ? `<a class="btn-wa" href="/wa/${l.id}" target="_blank">Open in WhatsApp</a>` : ''}
<form method="post" action="/lead/${l.id}" class="inline">
<select name="status" onchange="this.form.submit()">${STATUSES.map(s => `<option${s === l.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
<input name="notes" value="${esc(l.notes ?? '')}" placeholder="Notes" style="min-width:160px">
<button>Save</button></form>
${l.email ? `<form method="post" action="/optout/${l.id}"><button title="Never email again">Opt-out</button></form>` : ''}
</div>
${l.email_body ? `<details><summary>Email draft</summary><div class="msg"><b>${esc(l.email_subject)}</b>\n\n${esc(l.email_body)}</div></details>` : ''}
</div>`).join('') || '<div class="mute">Koi lead nahi. Upar se "Find + draft" chalao.</div>'}
</div></main></body></html>`;
}

export function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    if (!config.adminPassword) return res.status(503).send('Set ADMIN_PASSWORD in .env');
    const [, b64] = (req.get('authorization') ?? '').split(' ');
    const pass = Buffer.from(b64 ?? '', 'base64').toString().split(':').slice(1).join(':');
    if (pass === config.adminPassword) return next();
    res.set('WWW-Authenticate', 'Basic realm="leadbot"').sendStatus(401);
  });

  app.get('/', (req, res) => {
    const status = req.query.status ?? 'new';
    res.send(page({ leads: db.listLeads({ status, q: req.query.q }), c: db.counts(), status, q: req.query.q }));
  });

  // Marks as contacted, then opens WhatsApp with the message pre-filled (you press send).
  app.get('/wa/:id', (req, res) => {
    const l = db.getLead(Number(req.params.id));
    if (!l?.whatsapp) return res.sendStatus(404);
    db.updateLead(l.id, { wa_opened_at: new Date().toISOString(), status: l.status === 'new' ? 'contacted' : l.status });
    res.redirect(waLink(l));
  });

  app.post('/lead/:id', (req, res) => {
    const status = STATUSES.includes(req.body.status) ? req.body.status : 'new';
    db.updateLead(Number(req.params.id), { status, notes: String(req.body.notes ?? '').slice(0, 500) });
    res.redirect(req.get('referer') ?? '/');
  });

  app.post('/optout/:id', (req, res) => {
    const l = db.getLead(Number(req.params.id));
    if (l?.email) { db.optOut(l.email); db.updateLead(l.id, { status: 'skip' }); }
    res.redirect(req.get('referer') ?? '/');
  });

  app.post('/run/find', (req, res) => {
    const { city, kind, area } = req.body;
    runJob('Find', async () => { await find({ city, kind, area: area || undefined }); await enrich(); await draft(); });
    res.redirect('/');
  });

  app.post('/run/email', (_req, res) => {
    runJob('Email', () => sendQueued({ dryRun: false }));
    res.redirect('/');
  });

  return app;
}

export const _job = () => job;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  db.getDb();
  createApp().listen(config.port, () => console.log(`leadbot dashboard on :${config.port}`));
}
