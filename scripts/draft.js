// Re-run drafting for leads without messages (e.g. after adding an AI key).
import { draft } from '../src/pipeline.js';
await draft(Number(process.argv[2] ?? 200));
