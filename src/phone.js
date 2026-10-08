/**
 * Normalizes Pakistani numbers to international digits (92XXXXXXXXXX).
 * Mobiles (03XX…) are the ones that can be on WhatsApp.
 */
export function normalizePk(raw) {
  if (!raw) return null;
  // OSM sometimes has several numbers separated by ; or ,
  const first = String(raw).split(/[;,/]| or /i)[0];
  let d = first.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (/^3\d{9}$/.test(d)) d = '92' + d;      // 3001234567
  if (!/^92\d{9,10}$/.test(d)) return null;
  return d;
}

export const isMobile = intl => /^923\d{9}$/.test(intl ?? '');

/** All candidate numbers in a string (for website scraping). */
export function findPkMobiles(text) {
  const out = new Set();
  const re = /(?:\+?92|0)[\s-]?3\d{2}[\s-]?\d{7}/g;
  for (const m of String(text).match(re) ?? []) {
    const n = normalizePk(m);
    if (n && isMobile(n)) out.add(n);
  }
  return [...out];
}
