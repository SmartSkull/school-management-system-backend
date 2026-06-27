import mysql.connector
db = mysql.connector.connect(host='yamabiko.proxy.rlwy.net', port=29012, user='root', password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database='florieren')
cur = db.cursor()
queries = [
    ('Users (greatkings)', 'SELECT COUNT(*) FROM User WHERE uniqueId LIKE "greatkings/%"'),
    ('Staff records', 'SELECT COUNT(*) FROM Staff'),
    ('Student records', 'SELECT COUNT(*) FROM Student'),
    ('Assignments', 'SELECT COUNT(*) FROM Assignment'),
    ('Attendance', 'SELECT COUNT(*) FROM Attendance'),
    ('Results', 'SELECT COUNT(*) FROM Result'),
    ('Messages', 'SELECT COUNT(*) FROM Message'),
    ('Notifications', 'SELECT COUNT(*) FROM Notification'),
    ('SchoolDays', 'SELECT COUNT(*) FROM SchoolDays'),
]
for name, q in queries:
    cur.execute(q)
    print(f'{name}: {cur.fetchone()[0]}')
db.close()
