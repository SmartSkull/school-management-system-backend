/**
 * migrate-local-uploads-to-cloudinary.js
 *
 * Reads files directly from the local uploads/ folder, uploads them to
 * Cloudinary, then updates the Railway DB row with the new secure_url.
 *
 * The DB stores bare filenames (e.g. "1717671547.jpeg") or paths like
 * "assignments/1778613313126_PQ.pdf". This script resolves them against
 * the uploads/ directory, uploads to Cloudinary, and updates the DB.
 *
 * Usage:
 *   node scripts/migrate-local-uploads-to-cloudinary.js
 *
 * Options (env vars):
 *   DRY_RUN=true         — print what would happen without uploading/updating
 *   TABLE=User           — only migrate one table (User|School|Student|Post)
 *   CONCURRENCY=5        — parallel uploads (default: 5)
 */

'use strict';

const fs         = require('fs');
const path       = require('path');
const mysql      = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;

// ─── Config ───────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const DB = {
  host:           'yamabiko.proxy.rlwy.net',
  port:           29012,
  user:           'root',
  password:       'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
  database:       'florieren',
  ssl:            { rejectUnauthorized: false },
  connectTimeout: 30000,
};

const CLOUDINARY_CONFIG = {
  cloud_name: 'dg3gdxpf4',
  api_key:    '411113773126615',
  api_secret: 'JGeenI4gaXwWcyi4XRb3GaEldAA',
};

const DRY_RUN    = process.env.DRY_RUN === 'true';
const ONLY_TABLE = process.env.TABLE   || null;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

// Tables: { table, idCol, imageCol, folder }
const TABLES = [
  { table: 'User',    idCol: 'id', imageCol: 'image',       folder: 'florieren/users'    },
  { table: 'School',  idCol: 'id', imageCol: 'logo',        folder: 'florieren/schools'  },
  { table: 'Student', idCol: 'id', imageCol: 'parentImage', folder: 'florieren/parents'  },
  { table: 'Post',    idCol: 'id', imageCol: 'image',       folder: 'florieren/posts'    },
];

cloudinary.config(CLOUDINARY_CONFIG);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a DB value to a local file path.
 * Handles bare filenames ("1717671547.jpeg") and relative paths
 * ("assignments/foo.pdf", "messages/bar.jpg").
 * Returns null if the value is already a Cloudinary URL, null, or not a file.
 */
function resolveLocalPath(value) {
  if (!value) return null;
  if (value.includes('cloudinary.com')) return null;  // already migrated
  if (value.includes('@')) return null;               // email address in DB
  if (value.startsWith('http://') || value.startsWith('https://')) return null; // external URL

  // Strip any leading slashes or "uploads/" prefix the DB might have
  let relative = value.replace(/^\/+/, '').replace(/^uploads\//, '');

  const candidate = path.join(UPLOADS_DIR, relative);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  return null;
}

/**
 * Upload a local file to Cloudinary.
 * PDFs and other non-image files use resource_type='raw'.
 */
function uploadFile(localPath, folder) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(localPath).toLowerCase();
    const isRaw = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.mp4', '.webp', '.mp3'].includes(ext)
      || ext === '.webm';
    const resource_type = isRaw ? 'raw' : 'auto';

    cloudinary.uploader.upload(
      localPath,
      { folder, resource_type, type: 'upload', access_mode: 'public' },
      (err, result) => {
        if (err || !result) return reject(err || new Error('No result'));
        resolve(result.secure_url);
      }
    );
  });
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function runConcurrently(tasks, concurrency) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Migrate one table ────────────────────────────────────────────────────────

async function migrateTable(conn, { table, idCol, imageCol, folder }) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${table}.${imageCol}`);
  console.log('='.repeat(60));

  const [rows] = await conn.execute(
    `SELECT ${idCol}, \`${imageCol}\` FROM \`${table}\` WHERE \`${imageCol}\` IS NOT NULL AND \`${imageCol}\` != ''`
  );

  console.log(`  Found ${rows.length} rows with a value`);

  let migrated = 0;
  let skipped  = 0;
  let failed   = 0;
  const failures = [];

  const tasks = rows.map((row) => async () => {
    const id    = row[idCol];
    const value = row[imageCol];

    const localPath = resolveLocalPath(value);

    if (!localPath) {
      // Already a Cloudinary URL or unresolvable — skip silently unless it
      // looks like a bare filename we couldn't find on disk
      if (value && !value.includes('cloudinary.com') && !value.includes('@') && !value.startsWith('http')) {
        console.log(`  ⚠  ${table}#${id} (${value}): file not found in uploads/`);
        failed++;
        failures.push({ table, id, value, reason: 'File not found in uploads/' });
      } else {
        skipped++;
      }
      return;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${table}#${id}: would upload ${path.basename(localPath)} → ${folder}/`);
      migrated++;
      return;
    }

    try {
      const url = await uploadFile(localPath, folder);
      await conn.execute(
        `UPDATE \`${table}\` SET \`${imageCol}\` = ? WHERE \`${idCol}\` = ?`,
        [url, id]
      );
      console.log(`  ✓ ${table}#${id} (${path.basename(localPath)}): ${url}`);
      migrated++;
    } catch (err) {
      console.log(`  ✗ ${table}#${id} (${path.basename(localPath)}): ${err.message}`);
      failed++;
      failures.push({ table, id, value, reason: err.message });
    }
  });

  await runConcurrently(tasks, CONCURRENCY);

  return { migrated, skipped, failed, failures };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('  Florieren → Cloudinary Migration (from local uploads/)');
  if (DRY_RUN) console.log('  *** DRY RUN — no uploads or DB updates will happen ***');
  console.log('='.repeat(60));
  console.log(`  Uploads dir: ${UPLOADS_DIR}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error(`\nERROR: uploads/ directory not found at ${UPLOADS_DIR}`);
    process.exit(1);
  }

  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('  DB connected ✓\n');
  } catch (err) {
    console.error('Failed to connect to DB:', err.message);
    process.exit(1);
  }

  const tables = ONLY_TABLE
    ? TABLES.filter((t) => t.table === ONLY_TABLE)
    : TABLES;

  let totalMigrated = 0;
  let totalSkipped  = 0;
  let totalFailed   = 0;
  const allFailures = [];

  for (const tableConfig of tables) {
    const { migrated, skipped, failed, failures } = await migrateTable(conn, tableConfig);
    totalMigrated += migrated;
    totalSkipped  += skipped;
    totalFailed   += failed;
    allFailures.push(...failures);
  }

  await conn.end();

  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  console.log(`  Migrated  : ${totalMigrated}`);
  console.log(`  Skipped   : ${totalSkipped}  (already Cloudinary or null)`);
  console.log(`  Failed    : ${totalFailed}`);

  if (allFailures.length > 0) {
    console.log('\n  Failed rows:');
    for (const f of allFailures) {
      console.log(`    ${f.table}#${f.id} [${f.value}] → ${f.reason}`);
    }

    // Write failures to a log file for review
    const logPath = path.join(__dirname, 'migration-failures.json');
    fs.writeFileSync(logPath, JSON.stringify(allFailures, null, 2), 'utf8');
    console.log(`\n  Failures written to: ${logPath}`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
