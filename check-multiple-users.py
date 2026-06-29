import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

# Find all INSERT INTO `users` blocks
matches = list(re.finditer(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);', sql, re.IGNORECASE))
print(f'Found {len(matches)} users INSERT blocks')

for i, m in enumerate(matches):
    vals = m.group(2).strip()
    print(f'\nBlock {i}: {len(vals)} chars')
    print(f'  First 100: {vals[:100]}')
    print(f'  Last 100: {vals[-100:]}')
