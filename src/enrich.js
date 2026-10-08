import { config } from './config.js';
import { findPkMobiles } from './phone.js';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|@2x|domain\.com|email\.com/i;

async function get(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('text')) return '';
    return (await res.text()).slice(0, 500_000);
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

/** Visits the homepage (+ a contact page if linked) and pulls emails, socials, mobiles. */
export async function enrichFromWebsite(website) {
  if (!website) return {};
  let base;
  try { base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); } catch { return {}; }
  // Social links ARE the "website" for many Pakistani restaurants
  if (/instagram\.com/i.test(base.host)) return { instagram: base.href };
  if (/facebook\.com/i.test(base.host)) return { facebook: base.href };

  let html = await get(base.href);
  const contact = html.match(/href=["']([^"']*(?:contact|about)[^"']*)["']/i)?.[1];
  if (contact) {
    try { html += await get(new URL(contact, base).href); } catch { /* ignore */ }
  }
  if (!html) return {};

  const decoded = html.replace(/&#64;|&#x40;|\[at\]|\(at\)/gi, '@');
  const emails = [...new Set((decoded.match(EMAIL_RE) ?? []).map(e => e.toLowerCase()))].filter(e => !BAD_EMAIL.test(e));
  const insta = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i)?.[0];
  const fb = html.match(/https?:\/\/(?:www\.|web\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/i)?.[0];
  const waLink = html.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{10,13})/i)?.[1];
  const mobiles = findPkMobiles(html.replace(/<[^>]+>/g, ' '));

  return {
    email: emails[0] ?? null,
    instagram: insta ?? null,
    facebook: fb ?? null,
    whatsapp: waLink ?? mobiles[0] ?? null,
  };
}
