import { config } from './config.js';

/** Template fallback (works with no AI key). */
export function templateDraft(lead) {
  const name = lead.name;
  const wa = `Assalam o Alaikum! ${name} ka page dekha, mashallah. Aap ke paas WhatsApp pe roz kaafi inquiries aati hongi — menu, price, delivery.\n\n` +
    `Main ${config.senderName} hoon, software engineer. Maine ek AI assistant banaya hai jo aap ke WhatsApp pe 24/7 customers ko Roman Urdu/English mein reply karta hai, menu aur prices batata hai aur order le kar aap ko bhej deta hai.\n\n` +
    `1 minute ka demo video bhej doon?`;
  const subject = `24/7 WhatsApp order assistant for ${name}`;
  const body = `Assalam o Alaikum ${name} team,\n\n` +
    `I'm ${config.senderName}, a software engineer in Pakistan. I've built a WhatsApp AI assistant for restaurants: it replies to customers 24/7 in Urdu, Roman Urdu or English, shares your menu and prices, takes orders with the delivery address, and sends each order to you.\n\n` +
    `Late-night messages and busy-hour inquiries stop going unanswered.\n\n` +
    (config.demoUrl ? `1-minute demo: ${config.demoUrl}\n\n` : '') +
    `Would you like a free 1-week trial on your number?\n\n` +
    `Regards,\n${config.senderName}${config.senderPhone ? `\nWhatsApp: ${config.senderPhone}` : ''}\n\n` +
    `(If you'd rather not hear from me again, just reply "stop".)`;
  return { wa_message: wa, email_subject: subject, email_body: body };
}

/** Personalized with AI; falls back to the template on any problem. */
export async function aiDraft(lead) {
  if (!config.aiApiKey) return templateDraft(lead);
  const facts = {
    name: lead.name, category: lead.category, area: lead.area, address: lead.address,
    rating: lead.rating, reviews: lead.reviews, has_instagram: !!lead.instagram, has_website: !!lead.website,
  };
  const prompt = `Write cold outreach for a Pakistani small business. Sender: ${config.senderName}, a software engineer.
Offer: ${config.offer}.
${config.demoUrl ? `Demo link (only in the email): ${config.demoUrl}` : ''}
Business facts (use only these, never invent anything): ${JSON.stringify(facts)}

1) "wa_message": WhatsApp message in Roman Urdu, warm and respectful, max 70 words, mention the business by name, one specific benefit, END by asking permission to send a 1-minute demo video. No links, no emojis spam (max 1), no fake claims or numbers.
2) "email_subject": short English subject, under 9 words.
3) "email_body": English email, max 120 words, greet with "Assalam o Alaikum", same offer, ask if they'd like a free 1-week trial, sign as ${config.senderName}${config.senderPhone ? ` (WhatsApp ${config.senderPhone})` : ''}, last line: (If you'd rather not hear from me again, just reply "stop".)

Return ONLY JSON: {"wa_message":"","email_subject":"","email_body":""}`;
  try {
    const res = await fetch(`${config.aiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.aiApiKey}` },
      body: JSON.stringify({ model: config.aiModel, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const text = (await res.json()).choices?.[0]?.message?.content ?? '';
    const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!obj.wa_message || !obj.email_subject || !obj.email_body) throw new Error('incomplete');
    if (!/stop/i.test(obj.email_body)) obj.email_body += `\n\n(If you'd rather not hear from me again, just reply "stop".)`;
    return obj;
  } catch {
    return templateDraft(lead);
  }
}

export function waLink(lead) {
  return `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(lead.wa_message ?? '')}`;
}
