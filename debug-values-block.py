import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

# Get just the VALUES block
match = re.search(r'INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', sql, re.IGNORECASE)
if match:
    vb = match[2].strip()
    print(f'First 500 chars of VALUES block:')
    print(vb[:500])
    print(f'\n...Last 500 chars:')
    print(vb[-500:])
