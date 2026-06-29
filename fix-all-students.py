import re
import mysql.connector

conn = mysql.connector.connect(
    host='yamabiko.proxy.rlwy.net',
    port=29012,
    user='root',
    password='HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database='florieren'
)
cur = conn.cursor()

# Parse all users INSERT blocks
with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

matches = list(re.finditer(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);', sql, re.IGNORECASE))

source_to_target = {
    'jss1a': 'Jss-1',
    'jss2a': 'Jss-2',
    'jss3a': 'Jss-3',
    'ss1a': 'Ss-1',
    'ss2a': 'Ss-2',
    'ss3': 'Ss-3',
}

student_class_map = {}
for bi, m in enumerate(matches):
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    class_idx = cols.index('class')
    student_id_idx = cols.index('student_id')
    
    vb = m.group(2).strip()
    row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
    row_matches = list(row_pattern.finditer(vb))
    
    for rm in row_matches:
        content = rm.group(1)
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
            student_class_map[student_id] = target_class
        
print(f'Total students with mappable classes: {len(student_class_map)}')

# Get class IDs
cur.execute('SELECT id, name FROM ClassRoom WHERE schoolId = 9 ORDER BY name')
classes = {r[1].lower(): r[0] for r in cur.fetchall()}

# Update all students with NULL classRoomId
cur.execute('SELECT s.id, u.uniqueId FROM Student s JOIN User u ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NULL')
null_students = cur.fetchall()
print(f'Students with NULL classRoomId: {len(null_students)}')

updated = 0
skipped = 0
no_match = 0
for student_db_id, unique_id in null_students:
    class_name = student_class_map.get(unique_id)
    if class_name:
        class_id = classes.get(class_name.lower())
        if class_id:
            cur.execute('UPDATE Student SET classRoomId = %s WHERE id = %s', (class_id, student_db_id))
            if cur.rowcount > 0:
                updated += 1
            else:
                skipped += 1
        else:
            print(f'Class not found: {class_name} for {unique_id}')
            skipped += 1
    else:
        no_match += 1

conn.commit()
print(f'Updated: {updated}')
print(f'Skipped: {skipped}')
print(f'No source match: {no_match}')

# Verify
cur.execute('SELECT COUNT(*) FROM Student s JOIN User u ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NULL')
remaining = cur.fetchone()[0]
print(f'Remaining NULL classRoomId: {remaining}')

conn.close()
