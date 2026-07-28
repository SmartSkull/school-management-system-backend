const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });

  const userId = 445;

  const [counts] = await conn.execute(`
    SELECT
      (SELECT COUNT(*) FROM Notification WHERE userId = ?) AS notifications,
      (SELECT COUNT(*) FROM Post WHERE userId = ?) AS posts,
      (SELECT COUNT(*) FROM Comment WHERE userId = ?) AS comments,
      (SELECT COUNT(*) FROM \`Like\` WHERE userId = ?) AS likes,
      (SELECT COUNT(*) FROM Message WHERE senderId = ? OR receiverId = ?) AS messages,
      (SELECT COUNT(*) FROM Staff WHERE userId = ?) AS staff,
      (SELECT COUNT(*) FROM Result r JOIN Staff s ON s.id = r.teacherId WHERE s.userId = ?) AS results,
      (SELECT COUNT(*) FROM Assignment WHERE staffId IN (SELECT id FROM Staff WHERE userId = ?)) AS assignments,
      (SELECT COUNT(*) FROM Leave WHERE userId = ?) AS leaves,
      (SELECT COUNT(*) FROM StaffAttendance WHERE userId = ?) AS attendance
  `, [userId,userId,userId,userId,userId,userId,userId,userId,userId,userId,userId]);

  console.log('Blocking records for user 445:', JSON.stringify(counts[0], null, 2));
  await conn.end();
})().catch(console.error);
