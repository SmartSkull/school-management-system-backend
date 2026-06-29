import mysql.connector

conn = mysql.connector.connect(
    host='yamabiko.proxy.rlwy.net',
    port=29012,
    user='root',
    password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database='florieren'
)
cur = conn.cursor()

cur.execute('SELECT u.uniqueId, u.firstname, u.lastname FROM User u JOIN Student s ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NULL ORDER BY u.uniqueId')
null_students = cur.fetchall()
print(f'NULL class students: {len(null_students)}')
for sid, fn, ln in null_students[:20]:
    print(f'  {sid} | {fn} | {ln}')
if len(null_students) > 20:
    print(f'  ... and {len(null_students)-20} more')

conn.close()
