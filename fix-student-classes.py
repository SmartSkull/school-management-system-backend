import mysql.connector
import re

conn = mysql.connector.connect(
    host='yamabiko.proxy.rlwy.net',
    port=29012,
    user='root',
    password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database='florieren'
)
cur = conn.cursor()

# Get all classes
cur.execute('SELECT id, name FROM ClassRoom WHERE schoolId = 9 ORDER BY name')
classes = {r[1].lower(): r[0] for r in cur.fetchall()}
print('Classes in DB:', classes)

# Class name mapping from source to target
source_to_target = {
    'jss1a': 'Jss-1',
    'jss2a': 'Jss-2',
    'jss3a': 'Jss-3',
    'ss1a': 'Ss-1',
    'ss2a': 'Ss-2',
    'ss3': 'Ss-3',
}

# Create missing classes
for source_name, target_name in source_to_target.items():
    if target_name.lower() not in classes:
        cur.execute('INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (9, %s, NOW(), NOW())', (target_name,))
        class_id = cur.lastrowid
        classes[target_name.lower()] = class_id
        print(f'Created class: {target_name} (id: {class_id})')

conn.commit()

# Parse source SQL for student classes
with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
cols = [c.strip().replace('`', '') for c in match[1].split(',')]
class_idx = cols.index('class')
student_id_idx = cols.index('student_id')

vb = match[2].strip()
row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
row_matches = list(row_pattern.finditer(vb))

student_class_map = {}
for m in row_matches:
    content = m.group(1)
    vals = []
    cur_str = ''
    in_quote = False
    quote_char = None
    for ch in content:
        if in_quote:
            cur_str += ch
            if ch == quote_char:
                in_quote = False
        else:
            if ch in ("'", '"'):
                in_quote = True
                quote_char = ch
                cur_str += ch
            elif ch == ',':
                vals.append(cur_str.strip().strip("'\" "))
                cur_str = ''
            else:
                cur_str += ch
    last = cur_str.strip().strip("'\" ")
    if last:
        vals.append(last)
    while len(vals) < len(cols):
        vals.append('')
    
    student_id = vals[student_id_idx].strip() if student_id_idx < len(vals) else ''
    class_val = vals[class_idx].strip() if class_idx < len(vals) else ''
    
    if student_id and class_val and class_val.lower() in source_to_target:
        target_class = source_to_target[class_val.lower()]
        class_id = classes.get(target_class.lower())
        if class_id:
            student_class_map[student_id] = class_id

print(f'\nStudents to update: {len(student_class_map)}')

# Update students in DB
updated = 0
for student_id, class_room_id in student_class_map.items():
    cur.execute(
        'UPDATE Student SET classRoomId = %s WHERE userId IN (SELECT id FROM User WHERE uniqueId = %s) AND classRoomId IS NULL',
        (class_room_id, student_id)
    )
    if cur.rowcount > 0:
        updated += 1

conn.commit()
print(f'Updated {updated} student records')

# Verify
cur.execute('SELECT COUNT(*) FROM Student WHERE classRoomId IS NULL')
remaining = cur.fetchone()[0]
print(f'Remaining NULL classRoomId: {remaining}')

conn.close()
