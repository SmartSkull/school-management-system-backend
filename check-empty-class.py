import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
cols = [c.strip().replace('`', '') for c in match[1].split(',')]
class_idx = cols.index('class')
student_id_idx = cols.index('student_id')

vb = match[2].strip()
row_pattern = re.compile(r'\((\d+,\s*[^)]+)\)(?:,\s*)?', re.DOTALL)
row_matches = list(row_pattern.finditer(vb))

empty_class = 0
null_class = 0
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
    
    class_val = vals[class_idx].strip() if class_idx < len(vals) else ''
    if class_val == '' or class_val is None:
        empty_class += 1
    elif class_val.lower() == 'null':
        null_class += 1

print(f'Empty class values: {empty_class}')
print(f'NULL class values: {null_class}')
print(f'Total source rows: {len(row_matches)}')
