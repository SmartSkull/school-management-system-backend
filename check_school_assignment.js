require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const url = process.env.DATABASE_URL;
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  const [, user, password, host, port, database] = m;
  const conn = await mysql.createConnection({ host, port: parseInt(port), user, password, database, ssl: { rejectUnauthorized: false } });

  // Schools
  const [schools] = await conn.query('SELECT id, name, slug FROM School');
  console.log('=== SCHOOLS ===');
  schools.forEach(s => console.log(JSON.stringify(s)));

  // ClassRooms with schoolId
  const [classes] = await conn.query('SELECT id, schoolId, name FROM ClassRoom ORDER BY schoolId, name');
  console.log('\n=== CLASSROOMS (id | schoolId | name) ===');
  classes.forEach(c => console.log(JSON.stringify(c)));

  // Students per school via classRoom
  const [dist] = await conn.query(`
    SELECT sch.id as schoolId, sch.name as schoolName, COUNT(st.id) as studentCount
    FROM School sch
    LEFT JOIN ClassRoom c ON c.schoolId = sch.id
    LEFT JOIN Student st ON st.classRoomId = c.id
    GROUP BY sch.id, sch.name
  `);
  console.log('\n=== STUDENTS PER SCHOOL (via classRoom) ===');
  dist.forEach(r => console.log(JSON.stringify(r)));

  // Users per schoolId + role
  const [userSchools] = await conn.query(`
    SELECT u.schoolId, sch.name as schoolName, u.role, COUNT(*) as cnt
    FROM User u
    LEFT JOIN School sch ON sch.id = u.schoolId
    GROUP BY u.schoolId, u.role
    ORDER BY u.schoolId, u.role
  `);
  console.log('\n=== USERS PER SCHOOL+ROLE ===');
  userSchools.forEach(r => console.log(JSON.stringify(r)));

  // Sample: students whose User.schoolId doesn't match their classRoom's schoolId
  const [mismatched] = await conn.query(`
    SELECT u.id as userId, u.uniqueId, u.firstName, u.lastName, u.schoolId as userSchoolId,
           c.schoolId as classSchoolId, c.name as className,
           sch1.name as userSchool, sch2.name as classSchool
    FROM User u
    JOIN Student st ON st.userId = u.id
    LEFT JOIN ClassRoom c ON c.id = st.classRoomId
    LEFT JOIN School sch1 ON sch1.id = u.schoolId
    LEFT JOIN School sch2 ON sch2.id = c.schoolId
    WHERE u.schoolId != c.schoolId
      AND c.schoolId IS NOT NULL
      AND u.schoolId IS NOT NULL
    LIMIT 50
  `);
  console.log('\n=== MISMATCHED: User.schoolId != ClassRoom.schoolId ===');
  console.log('Count preview (up to 50):');
  mismatched.forEach(r => console.log(JSON.stringify(r)));

  const [[{ total }]] = await conn.query(`
    SELECT COUNT(*) as total
    FROM User u
    JOIN Student st ON st.userId = u.id
    LEFT JOIN ClassRoom c ON c.id = st.classRoomId
    WHERE u.schoolId != c.schoolId
      AND c.schoolId IS NOT NULL
      AND u.schoolId IS NOT NULL
  `);
  console.log('Total mismatched students:', total);

  await conn.end();
}
main().catch(e => console.error('Error:', e.message));
