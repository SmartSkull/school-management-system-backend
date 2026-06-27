import mysql.connector
db = mysql.connector.connect(host='yamabiko.proxy.rlwy.net', port=29012, user='root', password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database='florieren')
cur = db.cursor()
cur.execute("SELECT uniqueId, firstName, lastName, role FROM User WHERE uniqueId LIKE 'greatkings/%' LIMIT 5")
print('GreatKings users:')
for row in cur.fetchall():
    print(row)
cur.execute("SELECT uniqueId, firstName, lastName, role FROM User WHERE uniqueId LIKE 'staff/%' LIMIT 5")
print('\nStaff users:')
for row in cur.fetchall():
    print(row)
db.close()
