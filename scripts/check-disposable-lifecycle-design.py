"""Selected snapshot decision DESIGN vectors; no cache, worker, IPC or clock."""
from copy import deepcopy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "contracts/ipc/disposable-lifecycle-v1.json"
FIXTURE = ROOT / "tests/fixtures/backend/disposable-lifecycle-v1.json"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, names):
    require(set(value) == set(names.split()), "closed decision input")


def integer(value, minimum=0, maximum=9007199254740991):
    require(type(value) is int and minimum <= value <= maximum, "integer bound")


def booleans(value, names):
    require(all(type(value[n]) is bool for n in names.split()), "boolean premise")


def page(value, policy):
    fields(value, "now issued processMatch found queryMatch originalBindingMatch currentBindingMatch limit offset count")
    booleans(value, "processMatch found queryMatch originalBindingMatch currentBindingMatch")
    for name in ("now", "issued", "offset", "count"):
        integer(value[name])
    integer(value["limit"], 1, policy["page"]["maxItems"])
    require(value["offset"] <= value["count"] and value["issued"] <= value["now"], "page state")
    if not value["processMatch"] or not value["found"] or value["now"] - value["issued"] >= policy["page"]["ttlMs"]:
        return {"code": "process_expired"}
    if not value["queryMatch"]:
        return {"code": "invalid_request"}
    if not value["originalBindingMatch"] or not value["currentBindingMatch"]:
        return {"code": "stale_page"}
    end = min(value["count"], value["offset"] + value["limit"])
    return {"code": "page", "start": value["offset"], "end": end, "remaining": value["count"] - end, "hasNext": end < value["count"]}


def events(value, policy):
    fields(value, "processMatch found sequence after limit")
    booleans(value, "processMatch found")
    integer(value["sequence"], 1)
    integer(value["after"])
    integer(value["limit"], 1, policy["events"]["pollCap"])
    if not value["processMatch"] or not value["found"]:
        return {"code": "process_expired"}
    oldest = max(1, value["sequence"] - policy["events"]["retainedCap"] + 1)
    if value["after"] < oldest - 1 or value["after"] > value["sequence"]:
        return {"code": "events", "gap": True, "sequences": [], "next": value["sequence"]}
    end = min(value["sequence"], value["after"] + value["limit"])
    return {"code": "events", "gap": False, "sequences": list(range(value["after"] + 1, end + 1)), "next": end}


def preview(value, policy):
    fields(value, "processMatch found jobMatch capsuleMatch now issued currentBindingMatch")
    booleans(value, "processMatch found jobMatch capsuleMatch currentBindingMatch")
    integer(value["now"])
    integer(value["issued"])
    require(value["issued"] <= value["now"], "preview clock")
    if not value["processMatch"]:
        return {"code": "process_expired"}
    if not value["found"] or not value["jobMatch"] or not value["capsuleMatch"] or value["now"] - value["issued"] >= policy["preview"]["ttlMs"]:
        return {"code": "preview_expired"}
    # Exact retained bytes describe the original pinned bundle, even if the
    # current bundle has advanced. They cannot be promoted into an invocation.
    return {"code": "preview", "persisted": False, "inputIsCurrent": value["currentBindingMatch"]}


def admission(value, policy):
    fields(value, "active queued keys indexKind indexOwned retainedMatch conflict")
    booleans(value, "indexKind indexOwned retainedMatch conflict")
    integer(value["active"], 0, policy["jobs"]["activeCap"])
    integer(value["queued"], 0, policy["jobs"]["queuedCap"])
    integer(value["keys"], 0, policy["jobs"]["actionKeyCap"])
    require(not (value["retainedMatch"] and value["conflict"]), "key premise contradiction")
    if value["conflict"]:
        return {"code": "request_conflict"}
    if value["retainedMatch"]:
        return {"code": "replay", "allocate": False}
    if value["keys"] == policy["jobs"]["actionKeyCap"] or (value["indexKind"] and value["indexOwned"]):
        return {"code": "busy", "allocate": False}
    if value["active"] < policy["jobs"]["activeCap"]:
        return {"code": "start", "allocate": True}
    if value["queued"] < policy["jobs"]["queuedCap"]:
        return {"code": "queue", "allocate": True}
    return {"code": "busy", "allocate": False}


def retention(value, policy):
    fields(value, "kind now issued bytes retained pinned oldest")
    require(value["kind"] in {"page", "preview", "terminal"}, "cache kind")
    booleans(value, "pinned oldest")
    for name in ("now", "issued", "bytes", "retained"):
        integer(value[name])
    require(value["now"] >= value["issued"], "retention clock")
    kind = value["kind"]
    ttl = policy["jobs"]["terminalTtlMs"] if kind == "terminal" else policy[kind]["ttlMs"]
    if value["now"] - value["issued"] >= ttl:
        return {"code": "expire"}
    if kind == "preview":
        over = value["bytes"] > policy["preview"]["processBytes"]
    elif kind == "terminal":
        over = value["retained"] > policy["jobs"]["terminalCap"]
    else:
        # retained here is the affected Vault count. Process cap is handled by
        # the same eviction algorithm with processCap, outside this case set.
        over = value["retained"] > policy["page"]["vaultCap"]
    if over and value["oldest"] and not value["pinned"]:
        return {"code": "evict"}
    if over:
        return {"code": "busy"}
    return {"code": "retain"}


DECISIONS = {"page": page, "events": events, "preview": preview, "admission": admission, "retention": retention}


def check(fixture, policy):
    require(set(fixture) == {"schemaVersion", "evidence", "cases"} and type(fixture["schemaVersion"]) is int and fixture["schemaVersion"] == 1, "fixture envelope")
    require(fixture["evidence"] == "declared_snapshot_design_decisions", "fixture evidence")
    names = set()
    for row in fixture["cases"]:
        fields(row, "id kind input expected")
        require(row["id"] not in names and row["kind"] in DECISIONS, "case identity")
        names.add(row["id"])
        observed = DECISIONS[row["kind"]](row["input"], policy)
        require(observed == row["expected"], "decision differs: " + row["id"])
    require({row["kind"] for row in fixture["cases"]} == set(DECISIONS), "decision coverage")
    return len(names)


if __name__ == "__main__":
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    count = check(fixture, policy)
    negatives = 0
    for kind, field, bad in [("page", "limit", 101), ("page", "limit", True), ("page", "offset", 1001), ("page", "issued", 600001), ("events", "limit", 129), ("events", "sequence", 0), ("admission", "active", 5), ("preview", "found", 1)]:
        row = deepcopy(next(r for r in fixture["cases"] if r["kind"] == kind))
        row["input"][field] = bad
        try:
            DECISIONS[kind](row["input"], policy)
        except ValueError:
            negatives += 1
            continue
        raise ValueError("invalid premise not refused: " + field)
    print(f"PASS DESIGN disposable decisions: {count} frozen cases; {negatives} invalid premise refusals")
    print("NOT VERIFIED: real cache allocation, monotonic clocks, workers, event snapshots, IPC identifiers, cancellation or durability")
