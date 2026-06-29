import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if match:
    cols = [c.strip().replace('`', '') for c in match[1].split(',')]
    print('Columns:', cols)
    class_idx = cols.index('class')
    student_id_idx = cols.index('student_id')
    print(f'class_idx: {class_idx}, student_id_idx: {student_id_idx}')
    
    vb = match[2].strip()
    print(f'Values block length: {len(vb)}')
    
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
    
    print(f'Parsed rows: {len(rows)}')
    
    # Show first 3 rows
    for i, rs in enumerate(rows[:3]):
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
                    vals.append(cur_str.strip())
                    cur_str = ''
                else:
                    cur_str += ch
        last = cur_str.strip()
        if last:
            vals.append(last)
        while len(vals) < len(cols):
            vals.append('')
        print(f'\nRow {i}:')
        print(f'  student_id ({student_id_idx}): {vals[student_id_idx] if student_id_idx < len(vals) else "N/A"}')
        print(f'  class ({class_idx}): {vals[class_idx] if class_idx < len(vals) else "N/A"}')
        print(f'  total vals: {len(vals)}')
else:
    print('No match found for users table')
