const mysql = require('mysql2/promise');
const path  = require('path');
const fs    = require('fs');

const UPLOADS2 = path.join(__dirname, '..', 'uploads2');
const UPLOADS1 = path.join(__dirname, '..', 'uploads');

(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren',
    ssl: { rejectUnauthorized: false }
  });

  // All GK students with non-cloudinary parentImage
  const [students] = await conn.execute(
    `SELECT s.id, s.parentImage FROM Student s
     JOIN User u ON u.id = s.userId
     WHERE u.schoolId = 9
       AND s.parentImage IS NOT NULL AND s.parentImage != ''
       AND s.parentImage NOT LIKE '%cloudinary.com%'`
  );

  console.log('Total GK students with non-cloudinary parentImage:', students.length);

  let emails = 0, filenames = 0, notFound = 0;
  const realFiles = [];

  for (const s of students) {
    const val = s.parentImage;
    if (val.includes('@')) { emails++; continue; }
    if (val.startsWith('http')) { continue; }

    // Check if file exists in uploads2 or uploads
    const inUploads2 = fs.existsSync(path.join(UPLOADS2, val));
    const inUploads1 = fs.existsSync(path.join(UPLOADS1, val));

    if (inUploads2 || inUploads1) {
      filenames++;
      realFiles.push({ id: s.id, val, where: inUploads2 ? 'uploads2' : 'uploads' });
    } else {
      notFound++;
      console.log(`  Not found: Student#${s.id} [${val}]`);
    }
  }

  console.log(`\nEmails (bad data): ${emails}`);
  console.log(`Real files found:  ${filenames}`);
  console.log(`  - In uploads2:   ${realFiles.filter(f => f.where === 'uploads2').length}`);
  console.log(`  - In uploads:    ${realFiles.filter(f => f.where === 'uploads').length}`);
  console.log(`Not found on disk: ${notFound}`);

  if (realFiles.length > 0) {
    console.log('\nReal files sample:', JSON.stringify(realFiles.slice(0, 5), null, 2));
  }

  // Also check Post.image for GK school posts
  const [posts] = await conn.execute(
    `SELECT p.id, p.image FROM Post p
     JOIN School sch ON sch.id = p.schoolId
     WHERE sch.id = 9
       AND p.image IS NOT NULL AND p.image != ''
       AND p.image NOT LIKE '%cloudinary.com%'`
  );
  console.log('\nGK posts with non-cloudinary image:', posts.length);
  if (posts.length > 0) console.log('Samples:', JSON.stringify(posts.slice(0, 5)));

  await conn.end();
})();
