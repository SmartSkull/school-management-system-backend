import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

const envPath = candidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
}
