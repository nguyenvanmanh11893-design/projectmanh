import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the shared environment independently of the command working directory.
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
