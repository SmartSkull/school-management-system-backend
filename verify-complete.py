import mysql.connector
db = mysql.connector.connect(host='yamabiko.proxy.rlwy.net', port=29012, user='root', password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database='florieren')
cur = db.cursor()
queries = [
    'SELECT COUNT(*) FROM User WHERE uniqueId LIKE "greatkings/%"',
    'SELECT COUNT(*) FROM User WHERE uniqueId LIKE "staff/%"',
    'SELECT COUNT(*) FROM Staff',
    'SELECT COUNT(*) FROM Student',
    'SELECT COUNT(*) FROM Assignment',
    'SELECT COUNT(*) FROM Attendance',
    'SELECT COUNT(*) FROM Result',
    'SELECT COUNT(*) FROM Post',
    'SELECT COUNT(*) FROM Message',
]
for q in queries:
    cur.execute(q)
    print(q.split('FROM')[1].strip().split(' ')[0] + ':', cur.fetchone()[0])
db.close()
