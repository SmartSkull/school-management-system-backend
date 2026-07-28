const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren',
    multipleStatements: true
  });

  // Single round trip: find + delete everything
  const [results] = await conn.execute(`
    SET FOREIGN_KEY_CHECKS = 0;

    SET @ids = (
      SELECT GROUP_CONCAT(id) FROM User
      WHERE schoolId = 9 AND role IN ('STAFF','ADMIN')
      AND (
        (LOWER(firstName) LIKE '%sonia%' OR LOWER(lastName) LIKE '%taiwo%') OR
        (LOWER(firstName) LIKE '%ekenedirichukwu%' OR LOWER(lastName) LIKE '%arodiogbu%') OR
        (LOWER(firstName) LIKE '%unuakemolen%' OR LOWER(lastName) LIKE '%oyakhire%') OR
        (LOWER(firstName) LIKE '%akande%' OR LOWER(lastName) LIKE '%busayomi%') OR
        (LOWER(firstName) LIKE '%oluwakemisola%' OR LOWER(lastName) LIKE '%fashonu%') OR
        (LOWER(firstName) LIKE '%shogoye%' OR LOWER(lastName) LIKE '%olufunke%') OR
        (LOWER(firstName) LIKE '%adisa%' OR LOWER(lastName) LIKE '%oyas%')
      )
    );

    SELECT @ids AS found_ids;

    DELETE FROM Notification WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM Post WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM Comment WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM \`Like\` WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM Message WHERE FIND_IN_SET(senderId, @ids) OR FIND_IN_SET(receiverId, @ids);
    DELETE FROM Leave WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM StaffAttendance WHERE FIND_IN_SET(userId, @ids);
    UPDATE Result SET teacherId = NULL WHERE teacherId IN (SELECT id FROM Staff WHERE FIND_IN_SET(userId, @ids));
    UPDATE ClassRoom SET classTeacherId = NULL WHERE classTeacherId IN (SELECT id FROM Staff WHERE FIND_IN_SET(userId, @ids));
    DELETE FROM Assignment WHERE staffId IN (SELECT id FROM Staff WHERE FIND_IN_SET(userId, @ids));
    DELETE FROM Staff WHERE FIND_IN_SET(userId, @ids);
    DELETE FROM User WHERE FIND_IN_SET(id, @ids);

    SET FOREIGN_KEY_CHECKS = 1;
    SELECT ROW_COUNT() AS deleted;
  `);

  // results[2] is the SELECT @ids result
  console.log('Found IDs:', results[2]?.[0]?.found_ids);
  console.log('Last delete count:', results[results.length - 2]?.[0]?.deleted);
  console.log('Done.');
  await conn.end();
})().catch(console.error);
