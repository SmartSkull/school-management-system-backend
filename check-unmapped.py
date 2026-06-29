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

# Count all unique class values
class_counts = {}
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
    if class_val:
        if class_val not in class_counts:
            class_counts[class_val] = 0
        class_counts[class_val] += 1

print('All class values in source:')
for cls, count in sorted(class_counts.items()):
    print(f'  {cls}: {count}')
    
source_to_target = {
    'jss1a': 'Jss-1',
    'jss2a': 'Jss-2',
    'jss3a': 'Jss-3',
    'ss1a': 'Ss-1',
    'ss2a': 'Ss-2',
    'ss3': 'Ss-3',
}
unmapped = {k: v for k, v in class_counts.items() if k.lower() not in source_to_target}
print(f'\nUnmapped classes (total {sum(unmapped.values())} students):')
for cls, count in unmapped.items():
    print(f'  {cls}: {count}')
