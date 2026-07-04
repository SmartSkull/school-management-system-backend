/**
 * migrate-images-to-cloudinary.js
 *
 * Fetches all local image URLs from the Railway DB (User.image, School.logo,
 * Student.parentImage, Post.image), uploads each one to Cloudinary, then
 * updates the DB row with the new Cloudinary secure_url.
 *
 * Usage:
 *   node scripts/migrate-images-to-cloudinary.js
 *
 * Options (set via env vars or edit the CONFIG block below):
 *   DRY_RUN=true   — print what would happen without uploading or updating
 *   TABLE=User      — only migrate a single table (User|School|Student|Post)
 */

'use strict';

const mysql      = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const https      = require('https');
const http       = require('http');
const path       = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  // Source server — where old images live
  BASE_URL: 'https://florierenparklaneis.com.ng/uploads',

  // Railway DB
  db: {
    host:     'yamabiko.proxy.rlwy.net',
    port:     29012,
    user:     'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren',
    ssl:      { rejectUnauthorized: false },
    connectTimeout: 20000,
  },

  // Cloudinary
  cloudinary: {
    cloud_name: 'dg3gdxpf4',
    api_key:    '411113773126615',
    api_secret: 'JGeenI4gaXwWcyi4XRb3GaEldAA',
  },

  // Options
  DRY_RUN:    process.env.DRY_RUN === 'true',
  ONLY_TABLE: process.env.TABLE || null,  // e.g. 'User', 'School', 'Student', 'Post'
  CONCURRENCY: 5,  // max parallel uploads at a time
};

// ─── Tables to migrate ────────────────────────────────────────────────────────
// { table, idCol, imageCol, folder } — folder = Cloudinary sub-folder
const TABLES = [
  { table: 'User',    idCol: 'id', imageCol: 'image',       folder: 'florieren/users'    },
  { table: 'School',  idCol: 'id', imageCol: 'logo',        folder: 'florieren/schools'  },
  { table: 'Student', idCol: 'id', imageCol: 'parentImage', folder: 'florieren/parents'  },
  { table: 'Post',    idCol: 'id', imageCol: 'image',       folder: 'florieren/posts'    },
];

// ─── Setup ────────────────────────────────────────────────────────────────────
cloudinary.config(CONFIG.cloudinary);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the value looks like a local image filename (not already a Cloudinary URL,
 * not an email address, not garbage data).
 */
function isLocalImage(value) {
  if (!value) return false;
  // Already a Cloudinary URL
  if (value.includes('cloudinary.com')) return false;
  // Looks like an email address — definitely not an image
  if (value.includes('@')) return false;
  // Already a full http URL pointing elsewhere — skip (unknown host)
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.includes('florierenparklaneis.com.ng');
  }
  // Must end in a known image extension
  if (!/\.(jpe?g|png|gif|webp|svg)$/i.test(value)) return false;
  return true;
}

/**
 * Builds the full source URL from a stored value.
 * Handles both relative filenames and full URLs.
 */
function buildSourceUrl(value) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  // Strip any leading slashes / path prefix in case it's stored as e.g. "/uploads/file.jpg"
  const filename = value.replace(/^.*[/\\]/, '');
  return `${CONFIG.BASE_URL}/${filename}`;
}

/**
 * Downloads a URL and returns a Buffer.
 */
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow one redirect
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Uploads a buffer to Cloudinary and returns the secure_url.
 */
function uploadToCloudinary(buffer, filename, folder) {
  return new Promise((resolve, reject) => {
    const publicId = path.parse(filename).name; // strip extension
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: false,          // don't re-upload if already exists
        resource_type: 'image',
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Process a chunk of rows for one table.
 */
async function processRows(conn, tableConfig, rows, stats) {
  const { table, idCol, imageCol, folder } = tableConfig;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < rows.length; i += CONFIG.CONCURRENCY) {
    const batch = rows.slice(i, i + CONFIG.CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const id    = row[idCol];
      const value = row[imageCol];

      if (!isLocalImage(value)) {
        stats.skipped++;
        return;
      }

      const sourceUrl = buildSourceUrl(value);
      const filename  = value.replace(/^.*[/\\]/, '');

      try {
        if (CONFIG.DRY_RUN) {
          console.log(`  [DRY RUN] ${table}#${id}: ${value} → would upload to ${folder}`);
          stats.dryRun++;
          return;
        }

        // Download
        const buffer = await downloadBuffer(sourceUrl);

        // Upload to Cloudinary
        const cloudUrl = await uploadToCloudinary(buffer, filename, folder);

        // Update DB
        await conn.execute(
          `UPDATE \`${table}\` SET \`${imageCol}\` = ? WHERE \`${idCol}\` = ?`,
          [cloudUrl, id]
        );

        console.log(`  ✓ ${table}#${id}: ${value} → ${cloudUrl}`);
        stats.migrated++;

      } catch (err) {
        console.error(`  ✗ ${table}#${id} (${value}): ${err.message}`);
        stats.failed++;
        stats.errors.push({ table, id, value, error: err.message });
      }
    }));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  Florieren → Cloudinary Image Migration');
  console.log('='.repeat(60));
  if (CONFIG.DRY_RUN) console.log('  ⚠  DRY RUN MODE — no changes will be made\n');

  const stats = { migrated: 0, skipped: 0, failed: 0, dryRun: 0, errors: [] };
  const conn  = await mysql.createConnection(CONFIG.db);

  try {
    const tablesToProcess = TABLES.filter(
      (t) => !CONFIG.ONLY_TABLE || t.table === CONFIG.ONLY_TABLE
    );

    for (const tableConfig of tablesToProcess) {
      const { table, idCol, imageCol } = tableConfig;
      console.log(`\n── ${table}.${imageCol} ──`);

      const [rows] = await conn.execute(
        `SELECT \`${idCol}\`, \`${imageCol}\` FROM \`${table}\` WHERE \`${imageCol}\` IS NOT NULL AND \`${imageCol}\` != ''`
      );

      console.log(`  Found ${rows.length} rows with a value`);
      if (rows.length === 0) continue;

      await processRows(conn, tableConfig, rows, stats);
    }

  } finally {
    await conn.end().catch(() => {});
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  if (CONFIG.DRY_RUN) {
    console.log(`  Would migrate : ${stats.dryRun}`);
  } else {
    console.log(`  Migrated      : ${stats.migrated}`);
    console.log(`  Skipped       : ${stats.skipped}  (already Cloudinary or null)`);
    console.log(`  Failed        : ${stats.failed}`);
  }

  if (stats.errors.length > 0) {
    console.log('\n  Failed rows:');
    stats.errors.forEach((e) => {
      console.log(`    ${e.table}#${e.id} [${e.value}] — ${e.error}`);
    });
  }

  console.log('\nDone.\n');
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
