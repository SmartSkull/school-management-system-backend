import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

m = re.search(r'INSERT INTO `staff`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if m:
    vb = m.group(2).strip()
    print('Values block length:', len(vb))
    print('First 1000 chars:')
    print(vb[:1000])
    print('\nLast 1000 chars:')
    print(vb[-1000:])
