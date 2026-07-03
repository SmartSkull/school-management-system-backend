"""
Compares row counts in the two source SQL files against the live Railway database.
Run: python check_migration.py
"""
import re
import subprocess
import sys
from collections import defaultdict

# ── Railway DB credentials (from .env) ───────────────────────────────────────
DB_HOST = "yamabiko.proxy.rlwy.net"
DB_PORT = "29012"
DB_USER = "root"
DB_PASS = "HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ"
DB_NAME = "florieren"

SQL_FILES = [
    "greatkin_gk.sql",
    "greatkin_florieren.sql",
]

# ── Step 1: Parse INSERT statements from both SQL files ───────────────────────
def count_rows_in_sql(filepath):
    """
    Counts rows per table in a MySQL dump.
    Handles both:
      INSERT INTO `table` VALUES (...),(...),...;   <- multi-row
      INSERT INTO `table` VALUES (...);             <- single-row
    """
    counts = defaultdict(int)
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"  [!] File not found: {filepath}")
        return counts

    # Find every INSERT INTO `table` ... VALUES clause
    # We count the number of top-level value tuples per insert statement
    pattern = re.compile(
        r"INSERT\s+INTO\s+[`'\"]?(\w+)[`'\"]?\s+(?:\([^)]+\)\s+)?VALUES\s*([\s\S]+?)(?:;|$)",
        re.IGNORECASE
    )

    for match in pattern.finditer(content):
        table = match.group(1).lower()
        values_block = match.group(2)
        # Count top-level tuples: each starts with ( at depth 0
        # We just count occurrences of ),( or ),\n( between tuples
        # Simple approach: split on "),(" patterns
        # More robust: count opening parens at depth 0
        depth = 0
        row_count = 0
        in_string = False
        string_char = None
        i = 0
        while i < len(values_block):
            c = values_block[i]
            if in_string:
                if c == '\\':
                    i += 2
                    continue
                if c == string_char:
                    in_string = False
            else:
                if c in ("'", '"', '`'):
                    in_string = True
                    string_char = c
                elif c == '(':
                    if depth == 0:
                        row_count += 1
                    depth += 1
                elif c == ')':
                    depth -= 1
            i += 1
        counts[table] += row_count

    return counts

print("=" * 60)
print("Parsing SQL files...")
print("=" * 60)

combined_sql_counts = defaultdict(int)
for sql_file in SQL_FILES:
    counts = count_rows_in_sql(sql_file)
    if counts:
        print(f"\n{sql_file}:")
        for table, count in sorted(counts.items()):
            print(f"  {table:<40} {count:>6} rows")
            combined_sql_counts[table] += count
    else:
        print(f"\n{sql_file}: no INSERT statements found or file missing")

print(f"\n{'Combined SQL totals':}")
print("-" * 50)
for table, count in sorted(combined_sql_counts.items()):
    print(f"  {table:<40} {count:>6} rows")

# ── Step 2: Query live Railway DB ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("Querying Railway database...")
print("=" * 60)

# Build a single SQL query that counts all tables at once
tables = sorted(combined_sql_counts.keys())
union_parts = [
    f"SELECT '{t}' AS tbl, COUNT(*) AS cnt FROM `{t}`"
    for t in tables
]
query = " UNION ALL ".join(union_parts) + ";"

# Try mysql CLI
cmd = [
    "mysql",
    f"-h{DB_HOST}",
    f"-P{DB_PORT}",
    f"-u{DB_USER}",
    f"-p{DB_PASS}",
    DB_NAME,
    "--batch",
    "--skip-column-names",
    "-e", query,
]

try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"mysql error: {result.stderr.strip()}")
        sys.exit(1)

    db_counts = {}
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t")
        if len(parts) == 2:
            db_counts[parts[0].strip()] = int(parts[1].strip())

except FileNotFoundError:
    print("'mysql' CLI not found. Please install MySQL client tools.")
    sys.exit(1)
except subprocess.TimeoutExpired:
    print("Database query timed out.")
    sys.exit(1)

# ── Step 3: Compare ───────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"{'TABLE':<40} {'SQL':>8} {'DB':>8}  STATUS")
print("=" * 60)

all_ok = True
missing = []
mismatched = []
matched = []

for table in sorted(combined_sql_counts.keys()):
    sql_count = combined_sql_counts[table]
    db_count = db_counts.get(table, None)

    if db_count is None:
        status = "⚠  TABLE NOT FOUND IN DB"
        missing.append(table)
        all_ok = False
    elif db_count < sql_count:
        status = f"✗  MISSING {sql_count - db_count} ROWS"
        mismatched.append((table, sql_count, db_count))
        all_ok = False
    elif db_count > sql_count:
        status = f"✓  (DB has {db_count - sql_count} extra rows)"
        matched.append(table)
    else:
        status = "✓  OK"
        matched.append(table)

    db_str = str(db_count) if db_count is not None else "N/A"
    print(f"  {table:<40} {sql_count:>8} {db_str:>8}  {status}")

print("=" * 60)
print(f"\nSummary: {len(matched)} OK, {len(mismatched)} mismatched, {len(missing)} missing tables")

if all_ok:
    print("\n✅ All data appears to be fully migrated!")
else:
    if mismatched:
        print("\n⚠  Tables with missing rows:")
        for t, sql, db in mismatched:
            print(f"   {t}: {sql - db} rows missing ({db}/{sql} in DB)")
    if missing:
        print("\n⚠  Tables not found in DB:")
        for t in missing:
            print(f"   {t}")
