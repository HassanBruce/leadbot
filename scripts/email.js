// Dry run by default. Real send: npm run email -- --send
import { sendQueued } from '../src/mailer.js';
await sendQueued({ dryRun: !process.argv.includes('--send') });
