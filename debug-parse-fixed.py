import re

with open(r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

def parse_table(table):
    pat = r'INSERT INTO `' + table + r'`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)'
    m = re.search(pat, sql, re.IGNORECASE)
    if not m:
        return [], []
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    vb = m.group(2).strip()
    rows = []
    cur = ''
    ins = False
    sc = "'"
    for ch in vb:
        if ins:
            if ch == sc and cur[-1] == '\\':
                cur = cur[:-1] + ch
            else:
                cur += ch
                if ch == sc:
                    ins = False
        else:
            if ch == "'" or ch == '"':
                ins = True
                sc = ch
                cur += ch
            elif ch == '(':
                cur = ''
            elif ch == ')' and cur.strip():
                rows.append(cur.strip())
                cur = ''
            else:
                cur += ch
    out = []
    for rs in rows:
        vals = []
        cur = ''
        ins = False
        sc = "'"
        for ch in rs:
            if ins:
                if ch == sc and cur[-1] == '\\':
                    cur = cur[:-1] + ch
                else:
                    cur += ch
                    if ch == sc:
                        ins = False
            else:
                if ch == "'" or ch == '"':
                    ins = True
                    sc = ch
                    cur += ch
                elif ch == ',':
                    vals.append(cur.strip().strip("'").strip('"'))
                    cur = ''
                else:
                    cur += ch
        last = cur.strip().strip("'").strip('"')
        if last != '':
            vals.append(last)
        if vals:
            out.append(vals)
    return cols, out

sc, sr = parse_table('staff')
print(f'Staff: {len(sr)} rows')
for i in range(min(3, len(sr))):
    print(f'  Row {i}: {sr[i][:3]}...')

uc, ur = parse_table('users')
print(f'Users: {len(ur)} rows')
for i in range(min(3, len(ur))):
    print(f'  Row {i}: {ur[i][:3]}...')
