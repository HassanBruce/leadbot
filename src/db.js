import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { normalizePk, isMobile } from './phone.js';

let db;
export function getDb() {
  if (db) return db;
  const file = config.dataDir === ':memory:' ? ':memory:'
    : (fs.mkdirSync(config.dataDir, { recursive: true }), path.join(config.dataDir, 'leads.sqlite'));
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT, source_id TEXT,
      name TEXT NOT NULL, category TEXT, address TEXT, area TEXT, city TEXT,
      phone TEXT, whatsapp TEXT, email TEXT, website TEXT, instagram TEXT, facebook TEXT,
      rating REAL, reviews INTEGER,
      enriched INTEGER NOT NULL DEFAULT 0,
      wa_message TEXT, email_subject TEXT, email_body TEXT,
      email_sent_at TEXT, wa_opened_at TEXT,
      status TEXT NOT NULL DEFAULT 'new',   -- new | contacted | replied | interested | demo | won | lost | skip
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_leads_wa ON leads(whatsapp);
    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER, to_addr TEXT, ok INTEGER, error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS optout (email TEXT PRIMARY KEY);
  `);
  return db;
}

/** Inserts a lead unless we already have it (same source id, or same WhatsApp number). */
export function upsertLead(l, city) {
  const d = getDb();
  const phone = normalizePk(l.phone);
  const whatsapp = l.whatsapp ? normalizePk(l.whatsapp) : (isMobile(phone) ? phone : null);
  if (whatsapp && d.prepare('SELECT 1 FROM leads WHERE whatsapp=?').get(whatsapp)) return false;
  const dupName = d.prepare(`SELECT 1 FROM leads WHERE lower(name)=lower(?) AND lower(coalesce(address,''))=lower(?)`).get(l.name, l.address ?? '');
  if (dupName) return false;
  const r = d.prepare(`INSERT OR IGNORE INTO leads
    (source, source_id, name, category, address, area, city, phone, whatsapp, email, website, instagram, facebook, rating, reviews)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    l.source, l.source_id, l.name, l.category ?? null, l.address ?? null, l.area ?? null, city ?? null,
    phone, whatsapp, l.email?.toLowerCase() ?? null, l.website ?? null, l.instagram ?? null, l.facebook ?? null,
    l.rating ?? null, l.reviews ?? null);
  return r.changes === 1;
}

export function updateLead(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  getDb().prepare(`UPDATE leads SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`)
    .run(...keys.map(k => fields[k] ?? null), id);
}

export const getLead = id => getDb().prepare('SELECT * FROM leads WHERE id=?').get(id);
export const leadsToEnrich = (limit = 200) => getDb().prepare('SELECT * FROM leads WHERE enriched=0 AND website IS NOT NULL LIMIT ?').all(limit);
export const leadsToDraft = (limit = 200) => getDb().prepare(`SELECT * FROM leads WHERE wa_message IS NULL AND status='new' AND (whatsapp IS NOT NULL OR email IS NOT NULL) LIMIT ?`).all(limit);

export function leadsToEmail(limit) {
  return getDb().prepare(`SELECT * FROM leads WHERE email IS NOT NULL AND email_sent_at IS NULL AND email_body IS NOT NULL
    AND status IN ('new','contacted') AND email NOT IN (SELECT email FROM optout) LIMIT ?`).all(limit);
}

export const emailsSentToday = () => getDb().prepare(`SELECT COUNT(*) n FROM email_log WHERE ok=1 AND date(created_at)=date('now')`).get().n;
export const logEmail = (leadId, to, ok, error) => getDb().prepare('INSERT INTO email_log (lead_id, to_addr, ok, error) VALUES (?,?,?,?)').run(leadId, to, ok ? 1 : 0, error ?? null);
export const optOut = email => getDb().prepare('INSERT OR IGNORE INTO optout (email) VALUES (?)').run(email.toLowerCase());

export function listLeads({ status, q, limit = 300 } = {}) {
  const where = [], args = [];
  if (status && status !== 'all') { where.push('status=?'); args.push(status); }
  if (q) { where.push('(name LIKE ? OR area LIKE ? OR address LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  return getDb().prepare(`SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (whatsapp IS NOT NULL) DESC, coalesce(reviews,0) DESC, id DESC LIMIT ?`).all(...args, limit);
}

export function counts() {
  const rows = getDb().prepare('SELECT status, COUNT(*) n FROM leads GROUP BY status').all();
  const by = Object.fromEntries(rows.map(r => [r.status, r.n]));
  const d = getDb();
  return {
    by,
    total: rows.reduce((s, r) => s + r.n, 0),
    withWhatsapp: d.prepare('SELECT COUNT(*) n FROM leads WHERE whatsapp IS NOT NULL').get().n,
    withEmail: d.prepare('SELECT COUNT(*) n FROM leads WHERE email IS NOT NULL').get().n,
    emailedToday: emailsSentToday(),
  };
}
