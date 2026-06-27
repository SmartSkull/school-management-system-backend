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
SQL_PATH = r'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql'

def parse_table(table):
    with open(SQL_PATH, 'r', encoding='utf-8') as f:
        sql = f.read()
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
        if len(vals) > len(cols):
            vals = vals[:len(cols)-1] + [', '.join(vals[len(cols)-1:])]
        while len(vals) < len(cols):
            vals.append('')
        if vals:
            out.append(vals)
    return cols, out

def main():
    cnx = mysql.connector.connect(**DB)
    cur = cnx.cursor()
    try:
        print('Loading existing users...')
        cur.execute('SELECT id, uniqueId FROM User')
        um = {r[1]: r[0] for r in cur.fetchall()}
        print(f'  Existing: {len(um)}')
        
        print('Parsing staff...')
        sc, sr = parse_table('staff')
        print(f'  Source: {len(sr)}, expected {len(sc)} cols')
        
        print('Parsing users (students)...')
        uc, ur = parse_table('users')
        print(f'  Source: {len(ur)}, expected {len(uc)} cols')
        
        stc = []
        stuc = []
        for row in sr:
            uid = row[sc.index('unique_id')].strip()
            if uid in SKIP_IDS or not uid or uid in um:
                continue
            stc.append(row)
        for row in ur:
            uid = row[uc.index('student_id')].strip()
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
            uid = row[sc.index('unique_id')].strip()
            cur.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STAFF',
                 row[sc.index('firstname')].strip() or 'Staff',
                 row[sc.index('lastname')].strip() or '',
                 row[sc.index('email')].strip() or None,
                 row[sc.index('telephone')].strip() or None,
                 row[sc.index('password')].strip() or '$2y$10$default',
                 row[sc.index('image')].strip() or None,
                 'ACTIVE')
            )
            um[uid] = cur.lastrowid
            if cur.lastrowid % 5 == 0:
                print(f'  ... {cur.lastrowid} staff users')
        
        print('Creating student users...')
        for i, row in enumerate(stuc):
            uid = row[uc.index('student_id')].strip()
            cur.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STUDENT',
                 row[uc.index('firstname')].strip() or 'Student',
                 row[uc.index('lastname')].strip() or '',
                 row[uc.index('email')].strip() or None,
                 row[uc.index('telephone')].strip() or None,
                 row[uc.index('password')].strip() or '$2y$10$default',
                 row[uc.index('image')].strip() or None,
                 'ACTIVE')
            )
            um[uid] = cur.lastrowid
            if i % 20 == 0:
                print(f'  ... {i+1} of {len(stuc)} students')
        cnx.commit()
        print(f'Users created: {len(um)} total')
        
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
            uid = row[sc.index('unique_id')].strip()
            user_id = um.get(uid)
            if not user_id or user_id in su:
                continue
            cur.execute(
                'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid,
                 row[sc.index('state_of_origin')].strip() or None,
                 row[sc.index('date_of_birth')].strip() or None,
                 row[sc.index('home_address')].strip() or None,
                 row[sc.index('about')].strip() or None)
            )
        cnx.commit()
        
        print('Creating Student records...')
        cur.execute('SELECT userId FROM Student')
        stv = {r[0] for r in cur.fetchall()}
        for i, row in enumerate(stuc):
            uid = row[uc.index('student_id')].strip()
            user_id = um.get(uid)
            if not user_id or user_id in stv:
                continue
            cn = row[uc.index('class')].strip()
            cid = cm.get(cn) if cn else None
            cur.execute(
                'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid, cid,
                 row[uc.index('year_of_admission')].strip() or None,
                 row[uc.index('date_of_birth')].strip() or None,
                 row[uc.index('state_of_origin')].strip() or None,
                 row[uc.index('home_address')].strip() or None,
                 row[uc.index('father_name')].strip() or None,
                 row[uc.index('mother_name')].strip() or None,
                 row[uc.index('parent_image')].strip() or None,
                 row[uc.index('about')].strip() or None)
            )
            if i % 20 == 0:
                print(f'  ... {i+1} of {len(stuc)} students')
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
