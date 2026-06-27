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

from datetime import datetime

def try_parse_date(s):
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S']:
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    # Handle "9th January, 2023"
    m = re.search(r'(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})', s)
    if m:
        ds = f"{m.group(1)} {m.group(2)} {m.group(3)}"
        try:
            return datetime.strptime(ds, '%d %B %Y').strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def main():
    cnx = mysql.connector.connect(**DB)
    cur = cnx.cursor()
    try:
        cur.execute('SELECT id, uniqueId FROM User')
        um = {r[1]: r[0] for r in cur.fetchall()}
        cur.execute('SELECT id, name FROM ClassRoom')
        cm = {r[1]: r[0] for r in cur.fetchall()}
        cur.execute('SELECT id, name FROM Subject')
        sm = {r[1].lower(): r[0] for r in cur.fetchall()}
        cur.execute('SELECT id, name FROM AcademicSession')
        snm = {r[1]: r[0] for r in cur.fetchall()}
        cur.execute('SELECT id, sessionId, name FROM AcademicTerm')
        tm = {}
        for r in cur.fetchall():
            for sname, sid in snm.items():
                if sid == r[1]:
                    tm[sname + '_' + r[2].lower()] = r[0]
                    break
        
        # Assignment
        print('Migrating assignment...')
        ac, ar = parse_table('assignment')
        ac_map = {c: i for i, c in enumerate(ac)}
        count = 0
        for row in ar:
            uid = row[ac_map.get('staff_id', 0)].strip()
            if uid not in um:
                continue
            staff_id = um[uid]
            subj = row[ac_map.get('subject', 1)].strip()
            cls = row[ac_map.get('class', 2)].strip()
            content = row[ac_map.get('assignment', 3)].strip()
            deadline = row[ac_map.get('deadline', 4)].strip()
            title = subj
            cid = cm.get(cls)
            sid = sm.get(subj.lower())
            cur.execute(
                'INSERT INTO Assignment (staffId, classRoomId, subjectId, title, content, dueAt, status, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (staff_id, cid, sid, title, content, try_parse_date(deadline), 'PUBLISHED')
            )
            count += 1
        cnx.commit()
        print(f'  Assignment: {count}')
        
        # Attendance
        print('Migrating attendance...')
        attc, attr = parse_table('attendance')
        attm = {c: i for i, c in enumerate(attc)}
        count = 0
        for row in attr:
            sid = row[attm.get('student_id', 0)].strip()
            if sid not in um:
                continue
            student_id = um[sid]
            present = row[attm.get('present', 1)].strip()
            absent = row[attm.get('absent', 2)].strip()
            comment = row[attm.get('comment', 3)].strip()
            pcomment = row[attm.get('principal_comment', 4)].strip()
            term = row[attm.get('term', 5)].strip()
            session = row[attm.get('session', 6)].strip()
            tkey = session + '_' + term.lower() if session and term else None
            term_id = tm.get(tkey) if tkey else None
            session_id = snm.get(session)
            
            p = int(present) if present.isdigit() else 0
            a = int(absent) if absent.isdigit() else 0
            
            cur.execute(
                'INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (student_id, session_id, term_id, p, a, comment, pcomment)
            )
            count += 1
        cnx.commit()
        print(f'  Attendance: {count}')
        
        # Result
        print('Migrating result...')
        rc, rr = parse_table('result')
        rm = {c: i for i, c in enumerate(rc)}
        count = 0
        for row in rr:
            tid = row[rm.get('teacher_id', 0)].strip()
            sid = row[rm.get('student_id', 1)].strip()
            if tid not in um or sid not in um:
                continue
            teacher_id = um[tid]
            student_id = um[sid]
            subj = row[rm.get('course', 3)].strip()
            session = row[rm.get('session', 4)].strip()
            term = row[rm.get('term', 5)].strip()
            test = row[rm.get('test_score', 7)].strip()
            exam = row[rm.get('exam_score', 8)].strip()
            total = row[rm.get('total_score', 9)].strip()
            grade = row[rm.get('grade', 12)].strip()
            
            tkey = session + '_' + term.lower() if session and term else None
            term_id = tm.get(tkey) if tkey else None
            session_id = snm.get(session)
            subj_id = sm.get(subj.lower())
            
            t = float(test) if test.replace('.','',1).isdigit() else 0
            e = float(exam) if exam.replace('.','',1).isdigit() else 0
            tot = float(total) if total.replace('.','',1).isdigit() else round(t + e, 2)
            
            cur.execute(
                'INSERT INTO Result (studentId, subjectId, teacherId, sessionId, termId, testScore, examScore, totalScore, grade, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())',
                (student_id, subj_id, teacher_id, session_id, term_id, t, e, tot, grade or None)
            )
            count += 1
        cnx.commit()
        print(f'  Result: {count}')
        
        # Post
        print('Migrating post...')
        pc, pr = parse_table('post')
        pm = {c: i for i, c in enumerate(pc)}
        count = 0
        for row in pr:
            aid = row[pm.get('admin_id', 0)].strip()
            if aid not in um:
                continue
            author_id = um[aid]
            text = row[pm.get('text', 2)].strip()
            image = row[pm.get('image', 1)].strip() or None
            audience = row[pm.get('user', 3)].strip() or 'all'
            cur.execute(
                'INSERT INTO Post (authorId, text, image, audience, createdAt, updatedAt) VALUES (%s, %s, %s, %s, NOW(), NOW())',
                (author_id, text, image, audience)
            )
            count += 1
        cnx.commit()
        print(f'  Post: {count}')
        
        # Comment
        print('Migrating comment...')
        cc, cr = parse_table('comment')
        cmm = {c: i for i, c in enumerate(cc)}
        count = 0
        for row in cr:
            pid = row[cmm.get('post_id', 0)].strip()
            uid = row[cmm.get('unique_id', 2)].strip()
            if pid not in um or uid not in um:
                continue
            author_id = um[uid]
            text = row[cmm.get('comment', 1)].strip()
            cur.execute(
                'INSERT INTO Comment (postId, authorId, text, createdAt) VALUES (%s, %s, %s, NOW())',
                (int(pid), author_id, text)
            )
            count += 1
        cnx.commit()
        print(f'  Comment: {count}')
        
        # Likes
        print('Migrating likes...')
        lc, lr = parse_table('likes')
        lm = {c: i for i, c in enumerate(lc)}
        count = 0
        for row in lr:
            pid = row[lm.get('post_id', 0)].strip()
            uid = row[lm.get('unique_id', 1)].strip()
            if pid not in um or uid not in um:
                continue
            user_id = um[uid]
            try:
                cur.execute(
                    'INSERT IGNORE INTO Like (postId, userId, createdAt) VALUES (%s, %s, NOW())',
                    (int(pid), user_id)
                )
                count += 1
            except:
                pass
        cnx.commit()
        print(f'  Likes: {count}')
        
        # Messages
        print('Migrating messages...')
        mc, mr = parse_table('messages')
        mm = {c: i for i, c in enumerate(mc)}
        count = 0
        for row in mr:
            incoming = row[mm.get('incoming_id', 0)].strip()
            outgoing = row[mm.get('outgoing_id', 1)].strip()
            if incoming not in um or outgoing not in um:
                continue
            body = row[mm.get('message', 2)].strip()
            cur.execute(
                'INSERT INTO Message (senderId, receiverId, body, createdAt) VALUES (%s, %s, %s, NOW())',
                (um[outgoing], um[incoming], body)
            )
            count += 1
        cnx.commit()
        print(f'  Messages: {count}')
        
        # Notification
        print('Migrating notification...')
        nc, nr = parse_table('notification')
        nm = {c: i for i, c in enumerate(nc)}
        count = 0
        for row in nr:
            uid = row[nm.get('unique_id', 0)].strip()
            if uid not in um:
                continue
            message = row[nm.get('message', 2)].strip()
            title = row[nm.get('message', 2)].strip()[:100]
            user_id = um[uid]
            cur.execute(
                'INSERT INTO Notification (userId, type, title, message, createdAt) VALUES (%s, %s, %s, %s, NOW())',
                (user_id, 'INFO', title, message)
            )
            count += 1
        cnx.commit()
        print(f'  Notification: {count}')
        
        # Scratch card
        print('Migrating scratch_card...')
        scc, scr = parse_table('scratch_card')
        scm = {c: i for i, c in enumerate(scc)}
        count = 0
        for row in scr:
            sid = row[scm.get('student_id', 0)].strip()
            if sid not in um:
                continue
            student_id = um[sid]
            amount = row[scm.get('transfer_amount', 1)].strip()
            term = row[scm.get('term', 4)].strip()
            session = row[scm.get('session', 5)].strip()
            verified = row[scm.get('verified', 6)].strip()
            tkey = session + '_' + term.lower() if session and term else None
            term_id = tm.get(tkey) if tkey else None
            session_id = snm.get(session)
            status = 'USED' if verified == '1' else 'PENDING'
            cur.execute(
                'INSERT INTO ScratchCard (studentId, amount, status, sessionId, termId, createdAt, updatedAt) VALUES (%s, %s, %s, %s, %s, NOW(), NOW())',
                (student_id, float(amount) if amount.replace('.','',1).isdigit() else 0, status, session_id, term_id)
            )
            count += 1
        cnx.commit()
        print(f'  ScratchCard: {count}')
        
        # School days
        print('Migrating school_days...')
        dc, dr = parse_table('school_days')
        dm = {c: i for i, c in enumerate(dc)}
        count = 0
        for row in dr:
            session = row[dm.get('session', 0)].strip()
            term = row[dm.get('term', 1)].strip()
            days = row[dm.get('total_days', 2)].strip()
            session_id = snm.get(session)
            tkey = session + '_' + term.lower() if session and term else None
            term_id = tm.get(tkey) if tkey else None
            if session_id and term_id:
                cur.execute(
                    'INSERT INTO SchoolDays (session, term, totalDays, createdAt, updatedAt) VALUES (%s, %s, %s, NOW(), NOW())',
                    (session, term, int(days) if days.isdigit() else 0)
                )
                count += 1
        cnx.commit()
        print(f'  SchoolDays: {count}')
        
        print('\nMIGRATION COMPLETE')
        
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
