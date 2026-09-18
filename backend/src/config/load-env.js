import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the shared environment independently of the command working directory.
if (process.env.LOAD_DOTENV !== 'false') dotenv.config({ quiet: true, path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
