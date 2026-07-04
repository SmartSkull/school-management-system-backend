<?php
/**
 * cloudinary-migrate.php
 *
 * Upload this file to your server's public web directory (e.g. florierenparklaneis.com.ng/cloudinary-migrate.php)
 * Then open it in a browser: https://florierenparklaneis.com.ng/cloudinary-migrate.php?secret=florieren2026
 *
 * It will:
 * 1. Scan the uploads folder on the server
 * 2. Upload each image to Cloudinary
 * 3. Update the Railway MySQL DB with the new Cloudinary URL
 *
 * DELETE THIS FILE after migration is complete.
 */

// ─── Security: require a secret key in the URL ────────────────────────────────
define('SECRET', 'florieren2026');
if (($_GET['secret'] ?? '') !== SECRET) {
    http_response_code(403);
    die('Forbidden. Add ?secret=florieren2026 to the URL.');
}

// ─── Configuration ────────────────────────────────────────────────────────────
$CLOUDINARY = [
    'cloud_name' => 'dg3gdxpf4',
    'api_key'    => '411113773126615',
    'api_secret' => 'JGeenI4gaXwWcyi4XRb3GaEldAA',
];

$DB = [
    'host'     => 'yamabiko.proxy.rlwy.net',
    'port'     => 29012,
    'user'     => 'root',
    'password' => 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    'dbname'   => 'florieren',
];

// Tables and columns to migrate
$TABLES = [
    ['table' => 'User',    'id' => 'id', 'col' => 'image',       'folder' => 'florieren/users'],
    ['table' => 'School',  'id' => 'id', 'col' => 'logo',        'folder' => 'florieren/schools'],
    ['table' => 'Student', 'id' => 'id', 'col' => 'parentImage', 'folder' => 'florieren/parents'],
    ['table' => 'Post',    'id' => 'id', 'col' => 'image',       'folder' => 'florieren/posts'],
];

// Dry run: set to true to preview without uploading or updating DB
$DRY_RUN = isset($_GET['dry']) && $_GET['dry'] === '1';

// Only process one table (optional): ?table=User
$ONLY_TABLE = $_GET['table'] ?? null;

// ─── Find uploads directory ───────────────────────────────────────────────────
$uploadsDir = null;
$candidates = [
    __DIR__ . '/uploads',
    __DIR__ . '/../uploads',
    __DIR__ . '/../../uploads',
    dirname(__DIR__) . '/uploads',
];
foreach ($candidates as $c) {
    if (is_dir($c)) { $uploadsDir = realpath($c); break; }
}
if (!$uploadsDir && isset($_GET['uploads_dir'])) {
    $uploadsDir = $_GET['uploads_dir'];
}

// ─── Output helpers ───────────────────────────────────────────────────────────
set_time_limit(0);
ini_set('output_buffering', 'off');
header('Content-Type: text/html; charset=utf-8');

function out($msg) {
    echo $msg . "<br>\n";
    if (ob_get_level()) ob_flush();
    flush();
}

function outOk($msg)   { out("<span style='color:green'>✓ $msg</span>"); }
function outErr($msg)  { out("<span style='color:red'>✗ $msg</span>"); }
function outWarn($msg) { out("<span style='color:orange'>⚠ $msg</span>"); }
function outInfo($msg) { out("<span style='color:#666'>$msg</span>"); }

// ─── Cloudinary upload ────────────────────────────────────────────────────────
function uploadToCloudinary($filePath, $filename, $folder, $config) {
    $publicId  = pathinfo($filename, PATHINFO_FILENAME);
    $timestamp = time();
    $params    = [
        'folder'         => $folder,
        'overwrite'      => 'false',
        'public_id'      => $publicId,
        'timestamp'      => $timestamp,
    ];
    ksort($params);
    $paramStr = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $signature = sha1($paramStr . $config['api_secret']);

    $postFields = $params;
    $postFields['file']      = new CURLFile($filePath);
    $postFields['api_key']   = $config['api_key'];
    $postFields['signature'] = $signature;

    $ch = curl_init("https://api.cloudinary.com/v1_1/{$config['cloud_name']}/image/upload");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        throw new Exception("Cloudinary HTTP $httpCode: $response");
    }

    $data = json_decode($response, true);
    if (!isset($data['secure_url'])) {
        throw new Exception("No secure_url in response: $response");
    }

    return $data['secure_url'];
}

// ─── Find file on disk ────────────────────────────────────────────────────────
function findFile($uploadsDir, $filename) {
    $direct = $uploadsDir . '/' . $filename;
    if (file_exists($direct)) return $direct;
    // Search one level of subdirectories
    foreach (scandir($uploadsDir) as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $sub = $uploadsDir . '/' . $entry . '/' . $filename;
        if (file_exists($sub)) return $sub;
    }
    return null;
}

function isLocalImage($value) {
    if (!$value) return false;
    if (strpos($value, 'cloudinary.com') !== false) return false;
    if (strpos($value, '@') !== false) return false;
    if (strpos($value, 'http') === 0) return false;
    if (!preg_match('/\.(jpe?g|png|gif|webp|svg)$/i', $value)) return false;
    return true;
}

// ─── HTML wrapper ─────────────────────────────────────────────────────────────
echo <<<HTML
<!DOCTYPE html>
<html>
<head>
  <title>Cloudinary Migration</title>
  <style>
    body { font-family: monospace; background: #111; color: #eee; padding: 20px; }
    br { line-height: 1.8; }
    h2 { color: #4af; }
    .section { margin: 15px 0; padding: 10px; border-left: 3px solid #4af; }
  </style>
</head>
<body>
<h2>🚀 Florieren → Cloudinary Migration</h2>
HTML;

if ($DRY_RUN) out("<b style='color:yellow'>⚠ DRY RUN MODE — nothing will be changed</b>");

// ─── Show server IP ───────────────────────────────────────────────────────────
if (isset($_GET['check_ip'])) {
    $ip = file_get_contents('https://api.ipify.org');
    out("Server outbound IP: <b style='color:yellow'>$ip</b>");
    out("Add this IP to Railway's allowed IPs list.");
    die("</body></html>");
}

// ─── Connect to DB ────────────────────────────────────────────────────────────
out("<br><b>Connecting to Railway DB…</b>");
try {
    $pdo = new PDO(
        "mysql:host={$DB['host']};port={$DB['port']};dbname={$DB['dbname']};charset=utf8mb4",
        $DB['user'], $DB['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 20]
    );
    outOk("Connected to Railway DB");
} catch (Exception $e) {
    outErr("DB connection failed: " . $e->getMessage());
    die("</body></html>");
}

// ─── Show uploads dir ─────────────────────────────────────────────────────────
if (!$uploadsDir) {
    outErr("Could not find uploads directory automatically.");
    out("Add <b>?uploads_dir=/absolute/path/to/uploads</b> to the URL.");
    die("</body></html>");
}
outOk("Uploads directory: <b>$uploadsDir</b>");

// ─── Process tables ───────────────────────────────────────────────────────────
$stats = ['migrated' => 0, 'skipped' => 0, 'not_found' => 0, 'failed' => 0];

foreach ($TABLES as $t) {
    if ($ONLY_TABLE && $t['table'] !== $ONLY_TABLE) continue;

    echo "<div class='section'>";
    out("<b>── {$t['table']}.{$t['col']} ──</b>");

    $stmt = $pdo->prepare("SELECT `{$t['id']}`, `{$t['col']}` FROM `{$t['table']}` WHERE `{$t['col']}` IS NOT NULL AND `{$t['col']}` != ''");
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    outInfo("Found " . count($rows) . " rows");

    foreach ($rows as $row) {
        $id    = $row[$t['id']];
        $value = $row[$t['col']];

        if (!isLocalImage($value)) {
            $stats['skipped']++;
            continue;
        }

        $filename = basename($value);
        $filePath = findFile($uploadsDir, $filename);

        if (!$filePath) {
            outWarn("{$t['table']}#{$id} ({$filename}): not found on disk — skipping");
            $stats['not_found']++;
            continue;
        }

        if ($DRY_RUN) {
            outInfo("[DRY RUN] {$t['table']}#{$id}: {$filename} → would upload to {$t['folder']}");
            $stats['migrated']++;
            continue;
        }

        try {
            $cloudUrl = uploadToCloudinary($filePath, $filename, $t['folder'], $CLOUDINARY);
            $update = $pdo->prepare("UPDATE `{$t['table']}` SET `{$t['col']}` = ? WHERE `{$t['id']}` = ?");
            $update->execute([$cloudUrl, $id]);
            outOk("{$t['table']}#{$id}: {$filename} → {$cloudUrl}");
            $stats['migrated']++;
        } catch (Exception $e) {
            outErr("{$t['table']}#{$id} ({$filename}): " . $e->getMessage());
            $stats['failed']++;
        }
    }
    echo "</div>";
}

// ─── Summary ─────────────────────────────────────────────────────────────────
echo "<br><h2>Summary</h2>";
out("Migrated  : <b style='color:green'>{$stats['migrated']}</b>");
out("Skipped   : {$stats['skipped']} (already Cloudinary or null)");
out("Not found : {$stats['not_found']} (file missing from disk)");
out("Failed    : <b style='color:red'>{$stats['failed']}</b>");
out("<br><b style='color:yellow'>⚠ Delete this file from the server when done!</b>");

echo "</body></html>";
