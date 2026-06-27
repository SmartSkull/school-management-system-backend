import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

def parse(table):
    pat = r'INSERT INTO `' + re.escape(table) + r'`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)'
    m = re.search(pat, sql, re.IGNORECASE)
    print(f'Table {table}: match={m is not None}')
    if not m:
        return [], []
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    print(f'  Cols: {cols}')
    vb = m.group(2).strip()
    print(f'  Values block length: {len(vb)}')
    rows = []
    cur = ''
    ins = False
    sc = "'"
    for ch in vb:
        if ins:
            if ch == sc and cur[-1] != '\\':
                ins = False
            cur += ch
        else:
            if ch == "'" or ch == '"':
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
    print(f'  Raw rows: {len(rows)}')
    out = []
    for rs in rows[:3]:
        print(f'  Row sample: {rs[:100]}')
    return cols, rows[:3]

parse('staff')
parse('users')
