import mysql.connector
import re

DB = {
    'host': 'yamabiko.proxy.rlwy.net',
    'port': 29012,
    'user': 'root',
    'password': 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    'database': 'florieren'
}
SKIP_IDS = {'admin/2022/3a18', 'admin', 'admin1'}

def uq(v):
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() == 'null':
        return None
    if len(s) >= 2 and ((s[0] == "'" and s[-1] == "'") or (s[0] == '"' and s[-1] == '"')):
        return s[1:-1]
    return s

def parse_table(path, table):
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    pat = r'INSERT INTO `' + table + r'`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)'
    m = re.search(pat, sql, re.IGNORECASE)
    if not m:
        return [], []
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    vb = m.group(2).strip()
    if not vb:
        return [], []
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
                cur = ch
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
                    cur = ch
                elif ch == ',':
                    vals.append(uq(cur))
                    cur = ''
                else:
                    cur += ch
        last = uq(cur)
        if last is not None and str(last).strip() != '':
            vals.append(last)
        if vals:
            out.append(vals)
    return cols, out

def main():
    path = r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql'
    sc, sr = parse_table(path, 'staff')
    print(f'Staff cols ({len(sc)}): {sc}')
    print(f'Staff rows: {len(sr)}')
    for i, row in enumerate(sr[:5]):
        print(f'  Row {i}: len={len(row)}, sample={row[:3]}')
    for i, row in enumerate(sr):
        if len(row) != len(sc):
            print(f'  Row {i} has {len(row)} cols, expected {len(sc)}')
            print(f'    Row: {row}')
            break

main()
