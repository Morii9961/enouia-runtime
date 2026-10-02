"""Selected in-memory Vault byte/lineage DESIGN vectors; never opens a Vault."""
import base64
from copy import deepcopy
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "contracts/vault/storage-v1.schema.json"
FIXTURE = ROOT / "tests/fixtures/backend/storage-bytes-v1.json"
spec = importlib.util.spec_from_file_location("read_shape", ROOT / "scripts/check-read-results-design.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
IDENTITY = {"identity/core.md", "identity/runtime_rules.md"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def parse(raw):
    require(raw.endswith(b"\n") and not raw.startswith(b"\xef\xbb\xbf"), "JSON framing")
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result
    def constant(value):
        raise ValueError("nonfinite JSON: " + value)
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant)


def validate(value):
    require(set(value) == {"schemaVersion", "evidence", "objects", "generations", "selectors"}, "fixture fields")
    require(type(value["schemaVersion"]) is int and value["schemaVersion"] == 1, "fixture version")
    require(value["evidence"] == "synthetic_identity_only_design_bytes", "evidence label")
    objects = {}
    for item in value["objects"]:
        require(set(item) == {"name", "base64", "byteLength", "sha256"}, "object fields")
        require(isinstance(item["name"], str) and item["name"] not in objects, "object name")
        raw = base64.b64decode(item["base64"], validate=True)
        require(base64.b64encode(raw).decode("ascii") == item["base64"], "base64 canonical")
        require(type(item["byteLength"]) is int and len(raw) == item["byteLength"], "object length")
        require(digest(raw) == item["sha256"], "object digest")
        objects[item["name"]] = raw
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    seen, transactions, used = {}, set(), set()
    for row in value["generations"]:
        require(set(row) == {"manifest", "files"}, "generation fields")
        require(row["manifest"] in objects, "manifest object missing")
        used.add(row["manifest"])
        raw = objects[row["manifest"]]
        require(len(raw) <= 4 * 1024 * 1024, "manifest bound")
        manifest = parse(raw)
        probe.shape(manifest, schema["$defs"]["manifest"], SCHEMA)
        gid = manifest["generation_id"]
        require(gid not in seen and manifest["transaction_id"] not in transactions, "ID collision")
        transactions.add(manifest["transaction_id"])
        timestamp = datetime.strptime(manifest["created_at"], "%Y-%m-%dT%H:%M:%S.%fZ")
        require(timestamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{timestamp.microsecond // 1000:03d}Z" == manifest["created_at"], "canonical time")
        require(manifest["raw_objects"] == [], "selected identity fixture has no raw")
        entries = manifest["files"]
        names = [entry["path"] for entry in entries]
        require(names == sorted(set(names)), "sorted unique paths")
        require(set(names) == IDENTITY | {"mutation.json"} and set(row["files"]) == set(names), "identity-only inventory")
        files = {}
        for entry in entries:
            obj_name = row["files"][entry["path"]]
            require(obj_name in objects, "file object missing")
            used.add(obj_name)
            data = objects[obj_name]
            require(len(data) == entry["byte_length"] and digest(data) == entry["sha256"], "listed byte identity")
            files[entry["path"]] = data
            if entry["path"] in IDENTITY:
                require(not data.startswith(b"\xef\xbb\xbf"), "identity BOM")
                data.decode("utf-8")
        require(len(raw) + sum(map(len, files.values())) <= 256 * 1024 * 1024, "generation bound")
        require(len(files["mutation.json"]) <= 1024 * 1024, "mutation bound")
        mutation = parse(files["mutation.json"])
        probe.shape(mutation, schema["$defs"]["mutation"], SCHEMA)
        for key in ("schema_version", "vault_id", "generation_id", "transaction_id", "created_at", "parent"):
            require(mutation[key] == manifest[key], "mutation binding: " + key)
        parent = manifest["parent"]
        if parent is None:
            require(not seen and mutation["operation"] == "bootstrap", "only initial bootstrap")
            changed = sorted(IDENTITY)
        else:
            require(parent["generation_id"] in seen, "ancestor missing or forward reference")
            previous = seen[parent["generation_id"]]
            require(parent["manifest_sha256"] == previous["manifest_hash"], "parent exact bytes")
            require(manifest["vault_id"] == previous["manifest"]["vault_id"], "Vault continuity")
            require(timestamp >= previous["timestamp"], "clock regression")
            require(mutation["operation"] == "update_identity", "identity-only transition")
            changed = sorted(p for p in IDENTITY if files[p] != previous["files"][p])
            require(changed, "empty identity mutation")
        require(mutation["changed_paths"] == changed, "changed paths equality")
        seen[gid] = {"manifest": manifest, "manifest_hash": digest(raw), "files": files, "timestamp": timestamp}
    require(len(value["selectors"]) == len(seen) and seen, "selector coverage")
    selected = set()
    for name in value["selectors"]:
        require(name in objects, "selector object missing")
        used.add(name)
        raw = objects[name]
        require(len(raw) <= 1024, "selector bound")
        current = parse(raw)
        probe.shape(current, schema["$defs"]["current"], SCHEMA)
        require(current["generation_id"] in seen and current["generation_id"] not in selected, "selector generation")
        selected.add(current["generation_id"])
        target = seen[current["generation_id"]]
        require(current["vault_id"] == target["manifest"]["vault_id"] and current["manifest_sha256"] == target["manifest_hash"], "selector exact binding")
    require(used == set(objects), "unaccounted fixture object")
    return len(seen), len(objects)


def edit_json(value, name, change):
    item = next(i for i in value["objects"] if i["name"] == name)
    body = parse(base64.b64decode(item["base64"]))
    change(body)
    raw = compact(body)
    item.update(base64=base64.b64encode(raw).decode("ascii"), byteLength=len(raw), sha256=digest(raw))


def negative_checks(fixture):
    cases = []
    def case(label, change):
        value = deepcopy(fixture)
        change(value)
        cases.append((label, value))
    def manifest(value, change):
        edit_json(value, "manifest2", change)
    case("unknown fixture field", lambda v: v.update(activated=True))
    case("length mismatch", lambda v: v["objects"][0].update(byteLength=0))
    case("digest mismatch", lambda v: v["objects"][0].update(sha256="0" * 64))
    case("duplicate object name", lambda v: v["objects"].append(deepcopy(v["objects"][0])))
    case("missing file object", lambda v: v["generations"][1]["files"].update({"identity/core.md": "absent"}))
    case("unlisted file", lambda v: v["generations"][1]["files"].update({"secret.md": "core0"}))
    case("self-hash inventory", lambda v: manifest(v, lambda m: m["files"][0].update(path="manifest.json")))
    case("path traversal", lambda v: manifest(v, lambda m: m["files"][0].update(path="../identity/core.md")))
    case("case variant", lambda v: manifest(v, lambda m: m["files"][0].update(path="Identity/core.md")))
    case("duplicate path", lambda v: manifest(v, lambda m: m["files"].append(deepcopy(m["files"][0]))))
    case("unsorted files", lambda v: manifest(v, lambda m: m["files"].reverse()))
    case("listed byte length", lambda v: manifest(v, lambda m: m["files"][0].update(byte_length=0)))
    case("parent hash mismatch", lambda v: manifest(v, lambda m: m["parent"].update(manifest_sha256="0" * 64)))
    case("missing ancestor", lambda v: manifest(v, lambda m: m["parent"].update(generation_id="gen_" + "f" * 32)))
    case("cycle", lambda v: manifest(v, lambda m: m["parent"].update(generation_id=m["generation_id"])))
    case("unknown manifest field", lambda v: manifest(v, lambda m: m.update(committed=True)))
    case("noncanonical date", lambda v: manifest(v, lambda m: m.update(created_at="2026-02-30T00:00:00.000Z")))
    case("selector wrong hash", lambda v: edit_json(v, "current2", lambda c: c.update(manifest_sha256="0" * 64)))
    case("selector wrong Vault", lambda v: edit_json(v, "current2", lambda c: c.update(vault_id="vlt_" + "f" * 32)))
    case("duplicate selector", lambda v: v["selectors"].__setitem__(2, "current1"))
    # Mutation-only corruptions update the manifest entry and selector hash, so
    # semantic rejection cannot merely rely on an earlier stale hash mismatch.
    def mutation(value, change):
        edit_json(value, "mutation2", change)
        item = next(i for i in value["objects"] if i["name"] == "mutation2")
        manifest(value, lambda m: next(e for e in m["files"] if e["path"] == "mutation.json").update(byte_length=item["byteLength"], sha256=item["sha256"]))
        item = next(i for i in value["objects"] if i["name"] == "manifest2")
        edit_json(value, "current2", lambda c: c.update(manifest_sha256=item["sha256"]))
    case("changed paths omit actual", lambda v: mutation(v, lambda m: m.update(changed_paths=["identity/core.md"])))
    case("changed paths include mutation", lambda v: mutation(v, lambda m: m["changed_paths"].append("mutation.json")))
    case("late bootstrap", lambda v: mutation(v, lambda m: m.update(operation="bootstrap")))
    case("mutation wrong transaction", lambda v: mutation(v, lambda m: m.update(transaction_id="txn_" + "f" * 32)))
    def header(value, change):
        edit_json(value, "mutation2", change)
        item = next(i for i in value["objects"] if i["name"] == "mutation2")
        def update(body):
            change(body)
            next(e for e in body["files"] if e["path"] == "mutation.json").update(byte_length=item["byteLength"], sha256=item["sha256"])
        manifest(value, update)
        item = next(i for i in value["objects"] if i["name"] == "manifest2")
        body = parse(base64.b64decode(item["base64"]))
        edit_json(value, "current2", lambda c: c.update(vault_id=body["vault_id"], generation_id=body["generation_id"], manifest_sha256=item["sha256"]))
    case("rehash clock regression", lambda v: header(v, lambda b: b.update(created_at="2026-10-01T00:00:00.000Z")))
    case("rehash Vault discontinuity", lambda v: header(v, lambda b: b.update(vault_id="vlt_" + "f" * 32)))
    case("rehash transaction reuse", lambda v: header(v, lambda b: b.update(transaction_id="txn_" + format(10, "032x"))))
    case("rehash lost parent", lambda v: header(v, lambda b: b.update(parent=None)))
    case("rehash wrong parent hash", lambda v: header(v, lambda b: b["parent"].update(manifest_sha256="0" * 64)))
    for label, value in cases:
        try:
            validate(value)
        except (ValueError, UnicodeError):
            continue
        raise ValueError("negative not refused: " + label)
    malformed = [b'{"a":1,"a":2}\n', b'{"x":NaN}\n', b'{}', b'\xef\xbb\xbf{}\n', b'{"x":"\xff"}\n']
    for raw in malformed:
        try:
            parse(raw)
        except (ValueError, UnicodeError):
            continue
        raise ValueError("malformed JSON accepted")
    return len(cases), len(malformed)


if __name__ == "__main__":
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    generations, objects = validate(fixture)
    negatives, decoding = negative_checks(fixture)
    print(f"PASS DESIGN storage bytes: {generations} identity-only generations; {objects} exact byte objects; {negatives} mutated bundle and {decoding} decoding refusals")
    print("NOT VERIFIED: full model/Session/invocation/receipt graph, Rust serialization, Vault access, Windows durability or production")
