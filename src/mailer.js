import nodemailer from 'nodemailer';
import { config } from './config.js';
import * as db from './db.js';

let transport;
export function setTransport(t) { transport = t; } // tests
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  return transport;
}

/**
 * Sends queued emails one by one with a delay, never more than EMAIL_DAILY_LIMIT per day.
 * dryRun (default) only prints what would be sent.
 */
export async function sendQueued({ dryRun = true, delaySeconds = config.emailDelaySeconds } = {}) {
  const left = Math.max(0, config.emailDailyLimit - db.emailsSentToday());
  const batch = db.leadsToEmail(left);
  if (!left) { console.log(`Daily limit (${config.emailDailyLimit}) reached. Kal phir.`); return { sent: 0 }; }
  if (!dryRun && (!config.smtpUser || !config.smtpPass)) throw new Error('SMTP_USER / SMTP_PASS missing in .env');

  let sent = 0;
  for (const [i, l] of batch.entries()) {
    if (dryRun) {
      console.log(`\n--- DRY RUN → ${l.email} (${l.name})\nSubject: ${l.email_subject}\n${l.email_body}`);
      continue;
    }
    try {
      await getTransport().sendMail({
        from: `${config.senderName} <${config.smtpUser}>`,
        to: l.email,
        subject: l.email_subject,
        text: l.email_body,
      });
      db.logEmail(l.id, l.email, true);
      db.updateLead(l.id, { email_sent_at: new Date().toISOString(), status: l.status === 'new' ? 'contacted' : l.status });
      sent++;
      console.log(`✅ ${l.email} (${l.name})`);
    } catch (e) {
      db.logEmail(l.id, l.email, false, e.message);
      console.log(`❌ ${l.email}: ${e.message}`);
    }
    if (i < batch.length - 1) await new Promise(r => setTimeout(r, delaySeconds * 1000));
  }
  if (dryRun) console.log(`\n${batch.length} emails ready. Bhejne ke liye: npm run email -- --send`);
  return { sent, queued: batch.length };
}
