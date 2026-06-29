import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if match:
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
    
    print(f'First raw row (first 200 chars):')
    print(rows[0][:200])
    print(f'\nFirst raw row (raw):')
    print(repr(rows[0][:200]))
    
    # Count non-empty values
    vals = rows[0].split(',')
    print(f'\nValues in first row: {len(vals)}')
    for i, v in enumerate(vals[:15]):
        print(f'  [{i}]: {repr(v[:50])}')
