"""In-memory SQL DESIGN probe. No Runtime/Vault adapter or persisted database.

Run with Python's built-in sqlite3 and an FTS5/trigram-capable local library.
Expected outputs are committed independently in the synthetic metadata fixture.
"""
import hashlib
import json
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "contracts/vault/memory-index-v1.sql").read_text(encoding="utf-8")
FIXTURE = json.loads((ROOT / "tests/fixtures/retrieval/literal-v1.json").read_text(encoding="utf-8"))
BINDING = ("vlt_" + "1" * 32, "gen_" + "2" * 32, "3" * 64)


def opaque(prefix, number):
    return f"{prefix}{number:032x}"


def fold(value):
    return value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))


def terms(query):
    if len(query.encode("utf-8")) > 1024 or any(
        (ord(c) < 32 and c not in "\t\n\r\v\f") or 127 <= ord(c) <= 159 for c in query
    ):
        raise ValueError("invalid_query")
    result = sorted(set(fold(t) for t in re.split(r"[ \t\n\r\v\f\u3000]+", query) if t))
    if not result or len(result) > 16 or any(len(t) > 64 for t in result):
        raise ValueError("invalid_query")
    return result


def expected_values(documents):
    rows = []
    for document in documents:
        if document.get("candidate_marker") or document["status"] != "active":
            continue
        ordinals = {}
        for field, value in document["values"]:
            ordinal = ordinals.get(field, 0)
            ordinals[field] = ordinal + 1
            if value:
                rows.append((opaque("mem_", document["id"]), field, ordinal, fold(value)))
    return sorted(rows, key=lambda row: row[:3])


def build(documents):
    database = sqlite3.connect(":memory:")
    database.executescript(SQL)
    with database:
        database.execute("INSERT INTO index_meta VALUES (1,1,?,?,?,'ascii_fold_v1','scope_literal_v1',?,0)",
                         (*BINDING, sqlite3.sqlite_version))
        database.execute("INSERT INTO source VALUES (?, 'manual_save', ?, ?)",
                         (opaque("src_", 1), "2026-10-01T00:00:00.000Z", "0" * 64))
        for document in documents:
            if document.get("candidate_marker"):
                continue
            digest = hashlib.sha256(json.dumps(document, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
            project = opaque("prj_", document["project"]) if "project" in document else None
            database.execute("INSERT INTO memory VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                opaque("mem_", document["id"]), document["kind"], document["status"],
                opaque("src_", 1), project, None, "2026-10-01T00:00:00.000Z", document["updated_at"],
                document.get("valid_from"), document.get("valid_until"), digest))
        for rowid, row in enumerate(expected_values(documents), 1):
            database.execute("INSERT INTO search_value VALUES (?,?,?,?,?)", (rowid, *row))
            database.execute("INSERT INTO search_fts(rowid,value) VALUES (?,?)", (rowid, row[-1]))
        verify(database, documents, require_ready=False)
        database.execute("UPDATE index_meta SET ready=1")
    return database


def verify(database, documents, require_ready=True):
    observed = database.execute("SELECT vault_id,generation_id,manifest_sha256,ready FROM index_meta").fetchall()
    if len(observed) != 1 or observed[0][:3] != BINDING or (require_ready and observed[0][3] != 1):
        raise ValueError("stale_or_incomplete_binding")
    rows = database.execute("SELECT memory_id,field,ordinal,value FROM search_value ORDER BY memory_id,field,ordinal").fetchall()
    if rows != expected_values(documents):
        raise ValueError("projection_mismatch")
    projected = database.execute("SELECT value_id,value FROM search_value ORDER BY value_id").fetchall()
    indexed = database.execute("SELECT rowid,value FROM search_fts ORDER BY rowid").fetchall()
    if projected != indexed:
        raise ValueError("fts_projection_mismatch")
    if database.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise ValueError("integrity_failure")
    if database.execute("PRAGMA foreign_key_check").fetchall():
        raise ValueError("foreign_key_failure")
    database.execute("INSERT INTO search_fts(search_fts) VALUES ('integrity-check')")


def lexical_query(database, case):
    query_terms = terms(case["query"])
    intersection = None
    for term in query_terms:
        if len(term) >= 3:
            literal = '"' + term.replace('"', '""') + '"'
            rows = database.execute("SELECT v.memory_id FROM search_fts JOIN search_value v ON v.value_id=search_fts.rowid WHERE search_fts MATCH ?", (literal,))
        else:
            rows = database.execute("SELECT memory_id FROM search_value WHERE instr(value, ?) > 0", (term,))
        hits = {row[0] for row in rows}
        intersection = hits if intersection is None else intersection & hits
    eligible = []
    selected_project = opaque("prj_", case["project"]) if "project" in case else None
    for memory_id in intersection:
        row = database.execute("SELECT status,updated_at,project_id,valid_from,valid_until FROM memory WHERE memory_id=?", (memory_id,)).fetchone()
        status, updated, project, start, end = row
        now = FIXTURE["as_of"]
        if status != "active" or updated > now or (start and start > now) or (end and end < now):
            continue
        if selected_project and project and project != selected_project:
            continue
        values = database.execute("SELECT field,value FROM search_value WHERE memory_id=?", (memory_id,)).fetchall()
        if not all(any(term in value for _, value in values) for term in query_terms):
            raise ValueError("literal_projection_mismatch")
        exact_tags = len({value for field, value in values if field == "tag" and value in query_terms})
        eligible.append((memory_id, exact_tags, updated))
    # Stable sorts establish integer score/time descending and ID ascending.
    eligible.sort(key=lambda item: item[0])
    eligible.sort(key=lambda item: item[2], reverse=True)
    eligible.sort(key=lambda item: item[1], reverse=True)
    return [int(item[0][4:], 16) for item in eligible[:case.get("limit", 64)]]


def main():
    checks = 0
    for documents in (FIXTURE["documents"], list(reversed(FIXTURE["documents"]))):
        with build(documents) as database:
            verify(database, documents)
            for case in FIXTURE["cases"]:
                actual = lexical_query(database, case)
                if actual != case["expected"]:
                    raise AssertionError((case, actual))
                checks += 1
            for change, restore, expected_error in (
                ("UPDATE index_meta SET ready=0", "UPDATE index_meta SET ready=1", "stale_or_incomplete_binding"),
                ("UPDATE index_meta SET manifest_sha256='incorrect'", "UPDATE index_meta SET manifest_sha256='" + BINDING[2] + "'", "stale_or_incomplete_binding"),
                ("UPDATE search_fts SET value='altered' WHERE rowid=1", None, "fts_projection_mismatch"),
            ):
                database.execute(change)
                try:
                    verify(database, documents)
                except ValueError as error:
                    if str(error) != expected_error:
                        raise
                else:
                    raise AssertionError("invalid projection/binding accepted")
                if restore:
                    database.execute(restore)
                else:
                    original = database.execute("SELECT value FROM search_value WHERE value_id=1").fetchone()[0]
                    database.execute("UPDATE search_fts SET value=? WHERE rowid=1", (original,))
                checks += 1
            database.execute("UPDATE search_value SET value='altered' WHERE value_id=1")
            try:
                verify(database, documents)
            except ValueError as error:
                if str(error) != "projection_mismatch":
                    raise
            else:
                raise AssertionError("projection corruption accepted")
            checks += 1
        database.close()
    for query in ("  ", "bad\x00query", "a" * 65, " ".join(f"term{i}" for i in range(17))):
        try:
            terms(query)
        except ValueError:
            checks += 1
        else:
            raise AssertionError("invalid query accepted")
    print(json.dumps({"scope": "in-memory SQL design only", "sqlite_version": sqlite3.sqlite_version,
                      "lexical_cases": len(FIXTURE["cases"]), "rebuild_orders": 2, "checks_passed": checks}))


if __name__ == "__main__":
    main()
