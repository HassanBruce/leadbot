import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = (k, d) => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', 3200)),
  dataDir: env('DATA_DIR', './data'),
  adminPassword: env('ADMIN_PASSWORD', ''),

  // About you / your offer (goes into every message)
  senderName: env('SENDER_NAME', 'Hassan'),
  offer: env('OFFER', 'WhatsApp AI assistant jo 24/7 customers ko reply kare, menu/prices bataye aur orders le'),
  demoUrl: env('DEMO_URL', ''),
  senderPhone: env('SENDER_PHONE', ''),

  // AI (Gemini via OpenAI-compatible endpoint). Optional: falls back to templates.
  aiBaseUrl: env('AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
  aiApiKey: env('AI_API_KEY', ''),
  aiModel: env('AI_MODEL', 'gemini-2.5-flash-lite'),

  // Lead sources
  overpassUrl: env('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
  placesApiKey: env('GOOGLE_PLACES_API_KEY', ''), // optional, better data
  userAgent: env('USER_AGENT', 'leadbot/1.0 (small-business outreach)'),

  // Email (Gmail + App Password)
  smtpHost: env('SMTP_HOST', 'smtp.gmail.com'),
  smtpPort: Number(env('SMTP_PORT', 465)),
  smtpUser: env('SMTP_USER', ''),
  smtpPass: env('SMTP_PASS', ''),
  emailDailyLimit: Number(env('EMAIL_DAILY_LIMIT', 25)),
  emailDelaySeconds: Number(env('EMAIL_DELAY_SECONDS', 45)),
};
