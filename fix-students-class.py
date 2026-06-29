import mysql.connector

conn = mysql.connector.connect(
    host='yamabiko.proxy.rlwy.net',
    port=29012,
    user='root',
    password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database='florieren'
)
cur = conn.cursor()

# Check classes in ClassRoom for schoolId=9
cur.execute('SELECT id, name FROM ClassRoom WHERE schoolId = 9 ORDER BY name')
classes = {r[1]: r[0] for r in cur.fetchall()}
print('Classes in DB for school 9:', len(classes))
for name, id in classes.items():
    print(f'  {id}: {name}')

# Check unique class values in the source SQL users table
import re
with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if match:
    cols = [c.strip().replace('`', '') for c in match[1].split(',')]
    class_idx = cols.index('class')
    
    # Parse rows
    vb = match[2].strip()
    rows = []
    cur_str = ''
    in_str = False
    sc = "'"
    for ch in vb:
        if in_str:
            if ch == sc and cur_str[-1] == '\\':
                cur_str = cur_str[:-1] + ch
            else:
                cur_str += ch
                if ch == sc:
                    in_str = False
        else:
            if ch == "'" or ch == '"':
                in_str = True
                sc = ch
                cur_str = ch
            elif ch == '(':
                cur_str = ''
            elif ch == ')' and cur_str.strip():
                rows.append(cur_str.strip())
                cur_str = ''
            else:
                cur_str += ch
    
    source_classes = {}
    for rs in rows:
        vals = []
        cur_str = ''
        in_str = False
        sc = "'"
        for ch in rs:
            if in_str:
                if ch == sc and cur_str[-1] == '\\':
                    cur_str = cur_str[:-1] + ch
                else:
                    cur_str += ch
                    if ch == sc:
                        in_str = False
            else:
                if ch == "'" or ch == '"':
                    in_str = True
                    sc = ch
                    cur_str = ch
                elif ch == ',':
                    vals.append(cur_str.strip().strip("'\""))
                    cur_str = ''
                else:
                    cur_str += ch
        last = cur_str.strip().strip("'\" ")
        if last:
            vals.append(last)
        while len(vals) < len(cols):
            vals.append('')
        
        class_val = vals[class_idx].strip() if class_idx < len(vals) else ''
        if class_val and class_val not in ('none', 'null', ''):
            if not source_classes.get(class_val):
                source_classes[class_val] = 0
            source_classes[class_val] += 1
    
    print('\nUnique classes in source users:')
    for cls, count in sorted(source_classes.items()):
        print(f'  {cls}: {count} students')
        if cls in classes:
            print(f'    -> Mapped to ClassRoom id {classes[cls]}')
        else:
            print(f'    -> NOT FOUND in ClassRoom table')

cur.execute('SELECT COUNT(*) FROM Student WHERE classRoomId IS NULL')
null_count = cur.fetchone()[0]
print(f'\nStudents with NULL classRoomId: {null_count}')

conn.close()
