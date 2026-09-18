/**
 * migrate-cbt-images-to-cloudinary.js
 *
 * CBT question images used to be written to ./uploads/cbt-images on the
 * server's own disk, which is wiped on every deploy. The <img> tags already
 * saved inside question HTML therefore point at files that no longer exist.
 *
 * This script finds those references, uploads any file still present in
 * uploads/cbt-images/ to Cloudinary, and rewrites the HTML in CbtQuestion to
 * the Cloudinary URL. New uploads already go to Cloudinary, so this only has
 * to run once — and only from a machine that still has the uploads/ folder.
 *
 * Usage:
 *   node scripts/migrate-cbt-images-to-cloudinary.js           # dry run (default)
 *   APPLY=true node scripts/migrate-cbt-images-to-cloudinary.js
 *
 * Options (env vars):
 *   APPLY=true       — actually upload and write to the DB. Without it nothing
 *                      is changed; the script only reports what it would do.
 *   LIMIT=50         — only consider the first N questions
 *   CONCURRENCY=5    — parallel uploads (default 5)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;

// ─── Configuration, read from the backend's .env ──────────────────────────────

/** Minimal .env reader, so the script never duplicates credentials. */
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const ENV = { ...loadEnv(path.join(__dirname, '..', '.env')), ...process.env };

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const CBT_DIR = path.join(UPLOADS_DIR, 'cbt-images');

const DB = {
  host: ENV.DB_HOST,
  port: Number(ENV.DB_PORT || 3306),
  user: ENV.DB_USER,
  password: ENV.DB_PASS,
  database: ENV.DB_NAME,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 30000,
};

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

const APPLY = ENV.APPLY === 'true';
const LIMIT = ENV.LIMIT ? Number(ENV.LIMIT) : null;
const CONCURRENCY = Number(ENV.CONCURRENCY || 5);

/** The HTML columns a question can embed an image in. */
const HTML_COLUMNS = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'sectionLabel'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SRC_RE = /(src\s*=\s*["'])([^"']+)(["'])/gi;

/**
 * The filename if this src points at the old local CBT image folder, in any of
 * the forms that were saved over time:
 *   /uploads/cbt-images/x.jpg
 *   /api/uploads/cbt-images/x.jpg
 *   https://www.smartcampus.com.ng/api/uploads/cbt-images/x.jpg
 */
function localCbtFile(src) {
  const clean = String(src).split(/[?#]/)[0];
  const match = /cbt-images\/([^/]+)$/.exec(clean);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Upload one file, returning its Cloudinary URL. */
function uploadFile(localPath) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      localPath,
      { folder: 'florieren/cbt', resource_type: 'auto', type: 'upload', access_mode: 'public' },
      (err, result) => {
        if (err || !result) return reject(err || new Error('No result'));
        resolve(result.secure_url);
      },
    );
  });
}

async function runConcurrently(tasks, concurrency) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  if (!DB.host || !DB.user || !ENV.CLOUDINARY_CLOUD_NAME) {
    console.error('Missing DB or Cloudinary settings. Run this from the backend folder with a populated .env.');
    process.exit(1);
  }

  console.log(`\n  CBT image migration → Cloudinary${APPLY ? '' : '   (DRY RUN — pass APPLY=true to write)'}`);
  console.log(`  Local folder: ${CBT_DIR}`);
  console.log(`  Folder exists: ${fs.existsSync(CBT_DIR)}\n`);

  const conn = await mysql.createConnection(DB);
  const [rows] = await conn.execute(
    `SELECT id, ${HTML_COLUMNS.join(', ')} FROM CbtQuestion ORDER BY id${LIMIT ? ` LIMIT ${LIMIT}` : ''}`,
  );
  console.log(`  Questions scanned: ${rows.length}`);

  // filename → Cloudinary URL, so the same image is uploaded once.
  const uploaded = new Map();
  const stats = { rows: 0, references: 0, recovered: 0, alreadyCloud: 0, missing: 0 };
  const missingFiles = new Set();
  const updates = [];

  for (const row of rows) {
    const changes = {};

    for (const column of HTML_COLUMNS) {
      const html = row[column];
      if (!html || !html.includes('cbt-images/')) continue;

      const matches = [...String(html).matchAll(SRC_RE)];
      if (!matches.length) continue;

      let replaced = String(html);
      for (const [full, prefix, src, suffix] of matches) {
        const filename = localCbtFile(src);
        if (!filename) continue;
        stats.references++;

        if (uploaded.has(filename)) {
          const url = uploaded.get(filename);
          if (url) {
            replaced = replaced.replace(full, `${prefix}${url}${suffix}`);
            stats.recovered++;
          } else {
            stats.missing++;
          }
          continue;
        }

        const localPath = path.join(CBT_DIR, filename);
        if (!fs.existsSync(localPath)) {
          uploaded.set(filename, null);   // remember: not recoverable
          missingFiles.add(filename);
          stats.missing++;
          continue;
        }

        if (!APPLY) {
          uploaded.set(filename, `https://res.cloudinary.com/<dry-run>/florieren/cbt/${filename}`);
          replaced = replaced.replace(full, `${prefix}https://res.cloudinary.com/<dry-run>/florieren/cbt/${filename}${suffix}`);
          stats.alreadyCloud++;   // counted as "would migrate"
          continue;
        }

        try {
          const url = await uploadFile(localPath);
          uploaded.set(filename, url);
          replaced = replaced.replace(full, `${prefix}${url}${suffix}`);
          stats.recovered++;
        } catch (err) {
          uploaded.set(filename, null);
          console.error(`  Upload failed for ${filename}: ${err.message}`);
          stats.missing++;
        }
      }

      if (replaced !== html) changes[column] = replaced;
    }

    if (Object.keys(changes).length) {
      stats.rows++;
      updates.push({ id: row.id, changes });
    }
  }

  if (APPLY && updates.length) {
    console.log(`\n  Writing ${updates.length} question row(s)…`);
    await runConcurrently(updates.map(({ id, changes }) => async () => {
      const columns = Object.keys(changes);
      const sql = `UPDATE CbtQuestion SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`;
      await conn.execute(sql, [...columns.map((c) => changes[c]), id]);
    }), CONCURRENCY);
  }

  await conn.end();

  console.log('\n  ── Result ──');
  console.log(`  Image references found : ${stats.references}`);
  console.log(`  Files found locally    : ${[...uploaded.values()].filter(Boolean).length}`);
  console.log(`  Question rows updated  : ${updates.length}`);
  console.log(`  References unresolved  : ${stats.missing}`);
  if (missingFiles.size) {
    console.log('\n  No file on disk for these references. Note this looks only at the');
    console.log('  uploads/ folder on THIS machine — if the images were uploaded to a');
    console.log('  server, run this script there instead, before its next deploy.');
    for (const name of [...missingFiles].slice(0, 20)) console.log(`    - ${name}`);
    if (missingFiles.size > 20) console.log(`    … and ${missingFiles.size - 20} more`);
  }
  console.log(APPLY ? '\n  Done.\n' : '\n  Dry run — nothing was changed. Re-run with APPLY=true to migrate.\n');
})().catch((err) => {
  console.error('\n  Migration failed:', err.message);
  process.exit(1);
});
