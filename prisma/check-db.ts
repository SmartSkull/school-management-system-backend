import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkData() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'florieren',
    connectTimeout: 10000,
  });

  console.log('Detailed analysis of missing/incorrect data...\n');

  // Check total students count vs expected
  const [totalStudents] = await connection.execute('SELECT COUNT(*) as count FROM Student');
  console.log('Total Students:', totalStudents);

  const [totalUsers] = await connection.execute('SELECT COUNT(*) as count FROM User');
  console.log('Total Users:', totalUsers);

  // Check which school each student belongs to
  const [schoolStats] = await connection.execute(`
    SELECT sch.name, COUNT(s.id) as studentCount
    FROM Student s
    JOIN User u ON s.userId = u.id
    JOIN School sch ON u.schoolId = sch.id
    GROUP BY sch.name
  `);
  console.log('\nStudents per school:', schoolStats);

  // Check duplicate session entries
  const [duplicateSessions] = await connection.execute(`
    SELECT s1.id, s1.name, s1.schoolId, s2.id as id2
    FROM AcademicSession s1
    JOIN AcademicSession s2 ON s1.name = s2.name AND s1.id != s2.id
    ORDER BY s1.name
  `);
  console.log('\nDuplicate sessions:');
  console.log(duplicateSessions);

  // Check missing terms for 2023/2024 session
  const [terms2023] = await connection.execute(`
    SELECT t.name, COUNT(*) as count
    FROM AcademicTerm t
    JOIN AcademicSession s ON t.sessionId = s.id
    WHERE s.name = '2023/2024'
    GROUP BY t.name
  `);
  console.log('\nTerms for 2023/2024 session:', terms2023);

  // Find students with no attendance
  const [studentsNoAttendance] = await connection.execute(`
    SELECT s.studentNo, s.id
    FROM Student s
    LEFT JOIN Attendance a ON s.id = a.studentId
    WHERE a.studentId IS NULL
    LIMIT 20
  `);
  console.log('\nStudents with no attendance records:', studentsNoAttendance);

  // Check sessions linked to schools
  const [sessionSchoolLink] = await connection.execute(`
    SELECT sch.name as school, sess.name as session, COUNT(t.id) as termCount
    FROM AcademicSession sess
    LEFT JOIN AcademicTerm t ON t.sessionId = sess.id
    LEFT JOIN School sch ON sess.schoolId = sch.id
    GROUP BY sch.name, sess.name
    ORDER BY sch.name, sess.name
  `);
  console.log('\nSession-school links:');
  console.log(sessionSchoolLink);

  // Check records with Null/Nil that may have become 0
  // In greatkin_gk.sql, records like (15, 'greatkings/2022/011f', '', '', '', '', 'first', '2022/2023', '')
  // and (17, ... 'Null', ...) - these empty/null values should be 0 but the migration may have skipped them
  const [emptyPresentRecords] = await connection.execute(`
    SELECT s.studentNo, a.present, a.absent
    FROM Attendance a 
    JOIN Student s ON a.studentId = s.id
    WHERE s.studentNo IN ('greatkings/2022/011f', 'greatkings/2022/d2f4', 'greatkings/2022/9005')
    LIMIT 10
  `);
  console.log('\nAttendance for students with empty data in SQL:', emptyPresentRecords);

  await connection.end();
}

checkData().catch(console.error);