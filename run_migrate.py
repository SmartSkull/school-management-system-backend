import mysql.connector
import re

DB = {
    'host': 'yamabiko.proxy.rlwy.net',
    'port': 29012,
    'user': 'root',
    'password': 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    'database': 'florieren'
}
SCHOOL_ID = 9
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
    cnx = mysql.connector.connect(**DB)
    cur = cnx.cursor()
    try:
        print('Loading existing users...')
        cur.execute('SELECT id, uniqueId FROM User')
        um = {r[1]: r[0] for r in cur.fetchall()}
        print(f'  Existing users: {len(um)}')
        
        print('Parsing staff...')
        sc, sr = parse_table(path, 'staff')
        print(f'  Source staff: {len(sr)}')
        
        print('Parsing students...')
        uc, ur = parse_table(path, 'users')
        print(f'  Source students: {len(ur)}')
        
        stc = []
        stuc = []
        for row in sr:
            uid = uq(row[sc.index('unique_id')])
            if uid in SKIP_IDS or not uid or uid in um:
                continue
            stc.append(row)
        for row in ur:
            uid = uq(row[uc.index('student_id')])
            if uid in SKIP_IDS or not uid or uid in um:
                continue
            stuc.append(row)
        
        print(f'Staff to create: {len(stc)}')
        print(f'Students to create: {len(stuc)}')
        
        if not stc and not stuc:
            print('Nothing to migrate')
            return
        
        print('Creating staff users...')
        for row in stc:
            uid = uq(row[sc.index('unique_id')])
            cur.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STAFF',
                 uq(row[sc.index('firstname')]) or 'Staff',
                 uq(row[sc.index('lastname')]) or '',
                 uq(row[sc.index('email')]),
                 uq(row[sc.index('telephone')]),
                 uq(row[sc.index('password')]) or '$2y$10$default',
                 uq(row[sc.index('image')]), 'ACTIVE')
            )
            um[uid] = cur.lastrowid
        
        print('Creating student users...')
        for row in stuc:
            uid = uq(row[uc.index('student_id')])
            cur.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STUDENT',
                 uq(row[uc.index('firstname')]) or 'Student',
                 uq(row[uc.index('lastname')]) or '',
                 uq(row[uc.index('email')]),
                 uq(row[uc.index('telephone')]),
                 uq(row[uc.index('password')]) or '$2y$10$default',
                 uq(row[uc.index('image')]), 'ACTIVE')
            )
            um[uid] = cur.lastrowid
        cnx.commit()
        print(f'Users created. Total: {len(um)}')
        
        print('Loading classes...')
        cur.execute('SELECT id, name FROM ClassRoom WHERE schoolId = %s', (SCHOOL_ID,))
        cm = {r[1]: r[0] for r in cur.fetchall()}
        cur.execute('SELECT id, name FROM ClassRoom')
        for r in cur.fetchall():
            cm[r[1]] = r[0]
        
        print('Creating Staff records...')
        cur.execute('SELECT userId FROM Staff')
        su = {r[0] for r in cur.fetchall()}
        for row in stc:
            uid = uq(row[sc.index('unique_id')])
            user_id = um.get(uid)
            if not user_id or user_id in su:
                continue
            cur.execute(
                'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid,
                 uq(row[sc.index('state_of_origin')]),
                 uq(row[sc.index('date_of_birth')]),
                 uq(row[sc.index('home_address')]),
                 uq(row[sc.index('about')]))
            )
        cnx.commit()
        print('Staff records created')
        
        print('Creating Student records...')
        cur.execute('SELECT userId FROM Student')
        stv = {r[0] for r in cur.fetchall()}
        for row in stuc:
            uid = uq(row[uc.index('student_id')])
            user_id = um.get(uid)
            if not user_id or user_id in stv:
                continue
            cn = uq(row[uc.index('class')])
            cid = cm.get(cn) if cn else None
            cur.execute(
                'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid, cid,
                 uq(row[uc.index('year_of_admission')]),
                 uq(row[uc.index('date_of_birth')]),
                 uq(row[uc.index('state_of_origin')]),
                 uq(row[uc.index('home_address')]),
                 uq(row[uc.index('father_name')]),
                 uq(row[uc.index('mother_name')]),
                 uq(row[uc.index('parent_image')]),
                 uq(row[uc.index('about')]))
            )
        cnx.commit()
        print(f'\nMIGRATION COMPLETE: Staff={len(stc)}, Students={len(stuc)}')
        
    except Exception as e:
        cnx.rollback()
        print(f'FAILED: {e}')
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        cnx.close()

if __name__ == '__main__':
    main()
