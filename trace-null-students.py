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

# Get NULL student IDs
cur.execute('SELECT u.uniqueId FROM User u JOIN Student s ON s.userId = u.id WHERE u.schoolId = 9 AND s.classRoomId IS NULL')
null_ids = {r[0] for r in cur.fetchall()}

# Parse all users INSERT blocks
with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

matches = list(re.finditer(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);', sql, re.IGNORECASE))

for bi, m in enumerate(matches):
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    class_idx = cols.index('class')
    student_id_idx = cols.index('student_id')
    
    vb = m.group(2).strip()
    row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
    row_matches = list(row_pattern.finditer(vb))
    
    found_in_block = 0
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
        
        if student_id in null_ids:
            found_in_block += 1
            print(f'Block {bi}: {student_id} -> class="{class_val}"')
    
    if found_in_block:
        print(f'  Found {found_in_block} NULL students in block {bi}')

conn.close()
