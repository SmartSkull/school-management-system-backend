import mysql.connector
db = mysql.connector.connect(host='yamabiko.proxy.rlwy.net', port=29012, user='root', password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database='florieren')
cur = db.cursor()
ids = ['greatkings/2022/d2f4', 'greatkings/2022/9005', 'greatkings/2022/b6c5']
for sid in ids:
    cur.execute('SELECT id FROM Student WHERE studentNo = %s', (sid,))
    r = cur.fetchone()
    print(sid, '->', r[0] if r else 'NOT FOUND')
cur.execute('SELECT id, studentNo FROM Student WHERE studentNo LIKE "greatkings/2022/%" LIMIT 5')
print('Sample students:')
for row in cur.fetchall():
    print(row)
db.close()
