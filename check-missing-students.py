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

# Check how many students school 9 has total
cur.execute('SELECT COUNT(*) FROM Student s JOIN User u ON s.userId = u.id WHERE u.schoolId = 9')
total = cur.fetchone()[0]
print(f'Total students for school 9: {total}')

cur.execute('SELECT COUNT(*) FROM Student s JOIN User u ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NULL')
null_count = cur.fetchone()[0]
print(f'NULL classRoomId: {null_count}')

cur.execute('SELECT COUNT(*) FROM Student s JOIN User u ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NOT NULL')
assigned = cur.fetchone()[0]
print(f'Assigned classRoomId: {assigned}')

# Check what uniqueIds exist in source for school 9
with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
cols = [c.strip().replace('`', '') for c in match[1].split(',')]
student_id_idx = cols.index('student_id')
school_idx = cols.index('school') if 'school' in cols else None
user_id_idx = cols.index('user_id')

vb = match[2].strip()
row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
row_matches = list(row_pattern.finditer(vb))

print(f'\nSource rows: {len(row_matches)}')
source_student_ids = set()
school_ids = {}
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
    school = vals[school_idx].strip() if school_idx and school_idx < len(vals) else ''
    user_id = vals[user_id_idx].strip() if user_id_idx < len(vals) else ''
    
    if school and school not in school_ids:
        school_ids[school] = 0
    if school:
        school_ids[school] += 1
    
    if student_id:
        source_student_ids.add(student_id)

print('Schools in source:', school_ids)
print(f'Total source student IDs: {len(source_student_ids)}')

# Check what uniqueIds are in DB for school 9
cur.execute('SELECT u.uniqueId FROM User u JOIN Student s ON s.userId = u.id WHERE u.schoolId = 9 ORDER BY u.uniqueId')
db_ids = {r[0] for r in cur.fetchall()}
print(f'\nDB student IDs for school 9: {len(db_ids)}')

missing_in_source = db_ids - source_student_ids
print(f'DB IDs not in source: {len(missing_in_source)}')
if missing_in_source:
    for sid in sorted(list(missing_in_source))[:20]:
        print(f'  {sid}')

conn.close()
