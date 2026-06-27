import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

m = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if not m:
    print('No match')
    exit()

cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
vb = m.group(2).strip()
rows = []
cur = ''
ins = False
sc = "'"
for ch in vb:
    if ins:
        if ch == sc and cur[-1] == '\\':
            cur = cur[:-1] + ch
        else:
            cur += ch
            if ch == sc:
                ins = False
    else:
        if ch == "'" or ch == "'":
            ins = True
            sc = ch
            cur = ch
        elif ch == '(':
            cur = ''
        elif ch == ')' and cur.strip():
            rows.append(cur.strip())
            cur = ''
        else:
            cur += ch

target_ids = {'greatkings/2022/d2f4', 'greatkings/2022/9005', 'greatkings/2022/b6c5'}
found = set()
for rs in rows:
    vals = []
    cur = ''
    ins = False
    sc = "'"
    for ch in rs:
        if ins:
            if ch == sc and cur[-1] == '\\':
                cur = cur[:-1] + ch
            else:
                cur += ch
                if ch == sc:
                    ins = False
        else:
            if ch == "'" or ch == '"':
                ins = True
                sc = ch
                cur = ch
            elif ch == ',':
                vals.append(cur.strip().strip("'\" "))
                cur = ''
            else:
                cur += ch
    last = cur.strip().strip("'\" ")
    if last:
        vals.append(last)
    while len(vals) < len(cols):
        vals.append('')
    student_id = vals[cols.index('student_id')].strip()
    if student_id in target_ids:
        found.add(student_id)
        print(f'FOUND: {student_id} -> {vals[cols.index("firstname")]} {vals[cols.index("lastname")]}')

print(f'\nFound {len(found)} of {len(target_ids)} target IDs')
for tid in target_ids:
    if tid not in found:
        print(f'  MISSING: {tid}')
