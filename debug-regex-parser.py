import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if match:
    cols = [c.strip().replace('`', '') for c in match[1].split(',')]
    class_idx = cols.index('class')
    student_id_idx = cols.index('student_id')
    print(f'Columns: {cols}')
    print(f'class_idx: {class_idx}, student_id_idx: {student_id_idx}')
    
    vb = match[2].strip()
    
    # Use regex to find individual rows
    # Each row is a parenthesized list of values
    row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
    row_matches = list(row_pattern.finditer(vb))
    print(f'Found {len(row_matches)} rows with regex')
    
    # Show first 3 rows
    for m in row_matches[:3]:
        print(f'\nRaw row: {m.group(0)[:200]}')
    
    # Parse a few rows manually
    for i, m in enumerate(row_matches[:3]):
        content = m.group(1)
        # Simple split by comma, but respect quotes
        vals = []
        cur = ''
        in_quote = False
        quote_char = None
        for ch in content:
            if in_quote:
                cur += ch
                if ch == quote_char:
                    in_quote = False
            else:
                if ch in ("'", '"'):
                    in_quote = True
                    quote_char = ch
                    cur += ch
                elif ch == ',':
                    vals.append(cur.strip().strip("'\""))
                    cur = ''
                else:
                    cur += ch
        last = cur.strip().strip("'\"")
        if last:
            vals.append(last)
        
        print(f'\nParsed row {i}:')
        print(f'  vals count: {len(vals)}')
        print(f'  student_id: {vals[student_id_idx] if student_id_idx < len(vals) else "N/A"}')
        print(f'  class: {vals[class_idx] if class_idx < len(vals) else "N/A"}')
else:
    print('No match')
