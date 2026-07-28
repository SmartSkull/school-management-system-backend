const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });

  const userId = 445;

  // Delete all related records then the user — all in parallel where possible
  await conn.execute(`SET FOREIGN_KEY_CHECKS = 0`);

  await Promise.all([
    conn.execute(`DELETE FROM Notification WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM Post WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM Comment WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM \`Like\` WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM Message WHERE senderId = ? OR receiverId = ?`, [userId, userId]),
    conn.execute(`DELETE FROM Leave WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM StaffAttendance WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM TransportRouteChat WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM TransportBroadcast WHERE userId = ?`, [userId]),
    conn.execute(`DELETE FROM StudentAttendance WHERE userId = ?`, [userId]),
  ]);

  // Get staffId first for staff-related cleanup
  const [[staffRows]] = await conn.execute(`SELECT id FROM Staff WHERE userId = ?`, [userId]);
  if (staffRows) {
    const staffId = staffRows.id;
    await Promise.all([
      conn.execute(`UPDATE Result SET teacherId = NULL WHERE teacherId = ?`, [staffId]),
      conn.execute(`UPDATE ClassRoom SET classTeacherId = NULL WHERE classTeacherId = ?`, [staffId]),
      conn.execute(`DELETE FROM Assignment WHERE staffId = ?`, [staffId]),
      conn.execute(`DELETE FROM Staff WHERE id = ?`, [staffId]),
    ]);
  }

  // Now delete the user
  const [del] = await conn.execute(`DELETE FROM User WHERE id = ?`, [userId]);
  console.log(`User ${userId} deleted: ${del.affectedRows} row(s)`);

  await conn.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  await conn.end();
  console.log('Done.');
})().catch(console.error);
