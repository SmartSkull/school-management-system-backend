const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');
  const GKA_SCHOOL_ID = 9;
  const uniqueId = 'greatkings/2025/cbdb';

  // Check if already exists
  const [existing] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uniqueId]);
  if (existing.length > 0) {
    console.log('Already exists in Railway, id:', existing[0].id);
    await conn.end();
    return;
  }

  // Get classRoom id for SS2A
  const [classRow] = await conn.execute(
    'SELECT id FROM ClassRoom WHERE schoolId = ? AND name = ?', [GKA_SCHOOL_ID, 'SS2A']
  );
  const classRoomId = classRow.length ? classRow[0].id : null;

  // Insert User
  const [userRes] = await conn.execute(
    `INSERT INTO User (schoolId, role, uniqueId, firstName, lastName, email, telephone, image, password, status, createdAt, updatedAt)
     VALUES (?, 'STUDENT', ?, ?, ?, ?, ?, NULL, ?, 'ACTIVE', NOW(), NOW())`,
    [GKA_SCHOOL_ID, uniqueId, 'DISU', "AL'AMEEN", 'auspom4real@gmail.com', '08062093770',
     '$2y$10$bP01QU7LZmR53bl0ZRzzJOlZrDlhqvk//gl6FETzaGxaSOi4gWJom']
  );

  // Insert Student profile
  await conn.execute(
    `INSERT INTO Student (userId, studentNo, classRoomId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())`,
    [userRes.insertId, uniqueId, classRoomId]
  );

  console.log('Inserted DISU AL\'AMEEN — userId:', userRes.insertId, '| uniqueId:', uniqueId, '| class: SS2A');
  await conn.end();
}
main().catch(console.error);
