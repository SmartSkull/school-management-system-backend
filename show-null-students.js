const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  
  const [school8] = await conn.execute("SELECT id FROM School WHERE slug = 'florieren-1'");
  const schoolId = school8[0].id;
  
  // Get all students for school 8
  const [students] = await conn.execute(`
    SELECT s.id as studentId, u.uniqueId, u.firstName, u.lastName, s.classRoomId, c.name as className
    FROM Student s 
    JOIN User u ON s.userId = u.id 
    LEFT JOIN ClassRoom c ON c.id = s.classRoomId
    WHERE u.schoolId = ?
    ORDER BY u.uniqueId
  `, [schoolId]);
  
  console.log('School 8 students:', students.length);
  console.log('\nStudents with NULL class:');
  students.filter(s => !s.classRoomId).forEach(s => {
    console.log('  ' + s.uniqueId + ' (' + s.firstName + ' ' + s.lastName + ')');
  });
  
  await conn.end();
}

main();
