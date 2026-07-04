/**
 * migrate-images-to-cloudinary-server.js
 *
 * Run this DIRECTLY ON THE SERVER (via SSH) where the upload files exist on disk.
 * Reads files from the local filesystem instead of downloading over HTTP.
 *
 * Usage on the server:
 *   node migrate-images-to-cloudinary-server.js
 *
 * Options:
 *   DRY_RUN=true node migrate-images-to-cloudinary-server.js
 *   TABLE=User node migrate-images-to-cloudinary-server.js
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const mysql   = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;

// ─── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Absolute path to the uploads folder on the server
  UPLOADS_DIR: process.env.UPLOADS_DIR || '/var/www/florieren/nestjs-backend/uploads',

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

  DRY_RUN:    process.env.DRY_RUN === 'true',
  ONLY_TABLE: process.env.TABLE || null,
  CONCURRENCY: 5,
};

// ─── Tables ───────────────────────────────────────────────────────────────────
const TABLES = [
  { table: 'User',    idCol: 'id', imageCol: 'image',       folder: 'florieren/users'   },
  { table: 'School',  idCol: 'id', imageCol: 'logo',        folder: 'florieren/schools' },
  { table: 'Student', idCol: 'id', imageCol: 'parentImage', folder: 'florieren/parents' },
  { table: 'Post',    idCol: 'id', imageCol: 'image',       folder: 'florieren/posts'   },
];

cloudinary.config(CONFIG.cloudinary);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLocalImage(value) {
  if (!value) return false;
  if (value.includes('cloudinary.com')) return false;
  if (value.includes('@')) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (!/\.(jpe?g|png|gif|webp|svg)$/i.test(value)) return false;
  return true;
}

/** Extract just the filename from a stored value (strips any path prefix) */
function getFilename(value) {
  return path.basename(value);
}

/** Find the file on disk — checks root uploads dir and one level of subdirs */
function findFilePath(filename) {
  const direct = path.join(CONFIG.UPLOADS_DIR, filename);
  if (fs.existsSync(direct)) return direct;

  // Search subdirectories (assignments, messages, bookgame, etc.)
  try {
    const subdirs = fs.readdirSync(CONFIG.UPLOADS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const sub of subdirs) {
      const subPath = path.join(CONFIG.UPLOADS_DIR, sub, filename);
      if (fs.existsSync(subPath)) return subPath;
    }
  } catch {}

  return null;
}

function uploadToCloudinary(filePath, filename, folder) {
  return new Promise((resolve, reject) => {
    const publicId = path.parse(filename).name;
    cloudinary.uploader.upload(
      filePath,
      { folder, public_id: publicId, overwrite: false, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
  });
}

async function processRows(conn, tableConfig, rows, stats) {
  const { table, idCol, imageCol, folder } = tableConfig;

  for (let i = 0; i < rows.length; i += CONFIG.CONCURRENCY) {
    const batch = rows.slice(i, i + CONFIG.CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const id    = row[idCol];
      const value = row[imageCol];

      if (!isLocalImage(value)) {
        stats.skipped++;
        return;
      }

      const filename = getFilename(value);
      const filePath = findFilePath(filename);

      if (!filePath) {
        console.warn(`  ⚠ ${table}#${id} (${filename}): file not found on disk — skipping`);
        stats.notFound++;
        return;
      }

      try {
        if (CONFIG.DRY_RUN) {
          console.log(`  [DRY RUN] ${table}#${id}: ${filename} → would upload to ${folder}`);
          stats.dryRun++;
          return;
        }

        const cloudUrl = await uploadToCloudinary(filePath, filename, folder);
        await conn.execute(
          `UPDATE \`${table}\` SET \`${imageCol}\` = ? WHERE \`${idCol}\` = ?`,
          [cloudUrl, id]
        );
        console.log(`  ✓ ${table}#${id}: ${filename} → ${cloudUrl}`);
        stats.migrated++;

      } catch (err) {
        console.error(`  ✗ ${table}#${id} (${filename}): ${err.message}`);
        stats.failed++;
        stats.errors.push({ table, id, value, error: err.message });
      }
    }));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  Florieren → Cloudinary Image Migration (server mode)');
  console.log('='.repeat(60));
  console.log(`  Uploads dir : ${CONFIG.UPLOADS_DIR}`);
  if (CONFIG.DRY_RUN) console.log('  ⚠  DRY RUN MODE — no changes will be made');
  console.log('');

  if (!fs.existsSync(CONFIG.UPLOADS_DIR)) {
    console.error(`ERROR: Uploads directory not found: ${CONFIG.UPLOADS_DIR}`);
    console.error('Set the correct path with: UPLOADS_DIR=/path/to/uploads node migrate-images-to-cloudinary-server.js');
    process.exit(1);
  }

  const stats = { migrated: 0, skipped: 0, notFound: 0, failed: 0, dryRun: 0, errors: [] };
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

  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  if (CONFIG.DRY_RUN) {
    console.log(`  Would migrate : ${stats.dryRun}`);
    console.log(`  Not on disk   : ${stats.notFound}`);
  } else {
    console.log(`  Migrated      : ${stats.migrated}`);
    console.log(`  Skipped       : ${stats.skipped}  (already Cloudinary or null)`);
    console.log(`  Not on disk   : ${stats.notFound}  (old files missing from server)`);
    console.log(`  Failed        : ${stats.failed}`);
  }

  if (stats.errors.length > 0) {
    console.log('\n  Failed rows:');
    stats.errors.forEach((e) => console.log(`    ${e.table}#${e.id} [${e.value}] — ${e.error}`));
  }

  console.log('\nDone.\n');
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
