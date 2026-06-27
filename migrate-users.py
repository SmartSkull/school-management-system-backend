import mysql.connector
import re
import json

DB_CONFIG = {
    'host': 'yamabiko.proxy.rlwy.net',
    'port': 29012,
    'user': 'root',
    'password': 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    'database': 'florieren'
}
SCHOOL_ID = 9
SKIP = {'admin/2022/3a18', 'admin', 'admin1'}

def unquote(v):
    if v is None:
        return None
    v = str(v).strip()
    if v.lower() == 'null':
        return None
    if (v.startswith("'") and v.endswith("'")) or (v.startswith('"') and v.endswith('"')):
        return v[1:-1]
    return v

def parse_sql_rows(path, table):
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    pattern = re.compile(r'INSERT INTO `' + re.escape(table) + r'`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)', re.IGNORECASE)
    m = pattern.search(sql)
    if not m:
        return [], []
    cols = [c.strip().replace('`', '') for c in m.group(1).split(',')]
    vb = m.group(2).strip()
    if not vb:
        return [], []
    rows = []
    cur = ''
    in_str = False
    sc = ''
    for ch in vb:
        if in_str:
            if ch == sc and (len(cur) == 0 or cur[-1] != '\\'):
                in_str = False
            cur += ch
        else:
            if ch == "'" or ch == '"':
                in_str = True
                sc = ch
                cur += ch
            elif ch == '(':
                cur = ''
            elif ch == ')' and cur.strip():
                rows.append(cur.strip())
                cur = ''
            else:
                cur += ch
    parsed = []
    for rs in rows:
        vals = []
        cur = ''
        in_str = False
        sc = ''
        for ch in rs:
            if in_str:
                if ch == sc and (len(cur) == 0 or cur[-1] != '\\'):
                    in_str = False
                cur += ch
            else:
                if ch == "'" or ch == '"':
                    in_str = True
                    sc = ch
                    cur += ch
                elif ch == ',':
                    vals.append(unquote(cur))
                    cur = ''
                else:
                    cur += ch
        last = unquote(cur)
        if last is not None and str(last).strip() != '':
            vals.append(last)
        if vals:
            parsed.append(vals)
    return cols, parsed

def main():
    cnx = mysql.connector.connect(**DB_CONFIG)
    cursor = cnx.cursor()
    
    try:
        print('Loading existing data...')
        cursor.execute('SELECT id, uniqueId FROM User')
        um = {row[1]: row[0] for row in cursor.fetchall()}
        cursor.execute('SELECT userId FROM Staff')
        su = {row[0] for row in cursor.fetchall()}
        cursor.execute('SELECT userId FROM Student')
        stv = {row[0] for row in cursor.fetchall()}
        
        print('Parsing staff...')
        sc, sr = parse_sql_rows('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'staff')
        print('Parsing users...')
        uc, ur = parse_sql_rows('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'users')
        
        stc = []
        stuc = []
        for row in sr:
            uid = unquote(row[sc.index('unique_id')])
            if uid in SKIP or not uid or uid in um:
                continue
            stc.append(row)
        for row in ur:
            uid = unquote(row[uc.index('student_id')])
            if uid in SKIP or not uid or uid in um:
                continue
            stuc.append(row)
        
        print(f'Staff to create: {len(stc)}')
        print(f'Students to create: {len(stuc)}')
        
        if not stc and not stuc:
            print('Nothing to migrate')
            return
        
        print('Creating users...')
        for row in stc:
            uid = unquote(row[sc.index('unique_id')])
            cursor.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STAFF',
                 unquote(row[sc.index('firstname')]) or 'Staff',
                 unquote(row[sc.index('lastname')]) or '',
                 unquote(row[sc.index('email')]),
                 unquote(row[sc.index('telephone')]),
                 unquote(row[sc.index('password')]) or '$2y$10$default',
                 unquote(row[sc.index('image')]), 'ACTIVE')
            )
            um[uid] = cursor.lastrowid
        
        for row in stuc:
            uid = unquote(row[uc.index('student_id')])
            cursor.execute(
                'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (uid, 'STUDENT',
                 unquote(row[uc.index('firstname')]) or 'Student',
                 unquote(row[uc.index('lastname')]) or '',
                 unquote(row[uc.index('email')]),
                 unquote(row[uc.index('telephone')]),
                 unquote(row[uc.index('password')]) or '$2y$10$default',
                 unquote(row[uc.index('image')]), 'ACTIVE')
            )
            um[uid] = cursor.lastrowid
        print(f'Users created. Total: {len(um)}')
        
        print('Loading classes...')
        cursor.execute('SELECT id, name FROM ClassRoom WHERE schoolId = %s', (SCHOOL_ID,))
        cm = {row[1]: row[0] for row in cursor.fetchall()}
        cursor.execute('SELECT id, name FROM ClassRoom')
        for row in cursor.fetchall():
            cm[row[1]] = row[0]
        
        print('Creating Staff records...')
        for row in stc:
            uid = unquote(row[sc.index('unique_id')])
            user_id = um.get(uid)
            if not user_id or user_id in su:
                continue
            cursor.execute(
                'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid,
                 unquote(row[sc.index('state_of_origin')]),
                 unquote(row[sc.index('date_of_birth')]),
                 unquote(row[sc.index('home_address')),
                 unquote(row[sc.index('about')]))
            )
        print('Staff records created')
        
        print('Creating Student records...')
        for row in stuc:
            uid = unquote(row[uc.index('student_id')])
            user_id = um.get(uid)
            if not user_id or user_id in stv:
                continue
            cn = unquote(row[uc.index('class')])
            cid = cm.get(cn) if cn else None
            cursor.execute(
                'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (user_id, uid, cid,
                 unquote(row[uc.index('year_of_admission')]),
                 unquote(row[uc.index('date_of_birth')]),
                 unquote(row[uc.index('state_of_origin')]),
                 unquote(row[uc.index('home_address')]),
                 unquote(row[uc.index('father_name')]),
                 unquote(row[uc.index('mother_name')]),
                 unquote(row[uc.index('parent_image')]),
                 unquote(row[uc.index('about')))
            )
        print('Student records created')
        
        cnx.commit()
        print('MIGRATION COMMITTED')
        print(f'Staff: {len(stc)}, Students: {len(stuc)}')
        
    except Exception as e:
        cnx.rollback()
        print(f'FAILED: {e}')
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        cnx.close()

if __name__ == '__main__':
    main()
