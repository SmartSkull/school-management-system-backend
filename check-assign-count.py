import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

matches = re.findall(r'INSERT INTO `assignment`', sql, re.IGNORECASE)
print(f'INSERT INTO `assignment` occurrences: {len(matches)}')

m = re.search(r'INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if m:
    vb = m.group(2).strip()
    count = vb.count('),') + vb.count(')') - vb.count(');')
    print(f'Approx row count: {count}')
    print(f'VB length: {len(vb)}')
