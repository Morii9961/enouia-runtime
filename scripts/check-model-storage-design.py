"""Selected full-model storage byte corpus; no real generation directories."""
import argparse
import base64
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/backend/model-storage-v1.json"
EMITTED = ROOT / "target/design-probes/canonical-history-v1/model-files-v1.json"
spec = importlib.util.spec_from_file_location("storage_probe", ROOT / "scripts/check-storage-bytes-design.py")
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)
require, digest, parse, compact = storage.require, storage.digest, storage.parse, storage.compact
SCHEMA = storage.SCHEMA
IDENTITY = {"identity/core.md": b"Synthetic model-storage identity.\n", "identity/runtime_rules.md": b"Explicit fixture actions only; no live Runtime activation.\n"}
OPERATION = {"create_session": "create_session", "save": "save_memory", "append_user": "append_user_turn",
             "checkpoint": "create_checkpoint", "propose": "propose_candidate", "approve": "review_candidate",
             "reject": "review_candidate", "undo": "undo_supersession"}


def expected_states():
    history = json.loads((ROOT / "tests/fixtures/backend/canonical-history-v1.json").read_text(encoding="utf-8"))
    models = json.loads(EMITTED.read_text(encoding="utf-8"))
    names = ["bootstrap"] + [s["name"] for s in history["steps"]]
    require([m["name"] for m in models] == names, "Rust emitted history coverage")
    expected = []
    for index, model in enumerate(models):
        require(set(model) == {"name", "files"}, "emitted fields")
        step = history["steps"][index - 1] if index else None
        expected.append({"name": model["name"], "files": {p: s.encode("utf-8") for p,s in model["files"].items()},
                         "operation": OPERATION[step["action"]["kind"]] if step else "bootstrap",
                         "at": step["at"] if step else history["steps"][0]["at"]})
    return expected


def validate(value, expected):
    require(set(value) == {"schema_version", "evidence", "objects", "generations", "selectors"}, "fixture fields")
    require(type(value["schema_version"]) is int and value["schema_version"] == 1, "fixture version")
    require(value["evidence"] == "synthetic_rust_model_storage_bytes_only", "evidence label")
    objects = {}
    for item in value["objects"]:
        require(set(item) == {"name", "base64", "byteLength", "sha256"}, "object fields")
        require(isinstance(item["name"], str) and item["name"] not in objects, "object identity")
        raw = base64.b64decode(item["base64"], validate=True)
        require(base64.b64encode(raw).decode("ascii") == item["base64"], "base64 canonical")
        require(type(item["byteLength"]) is int and len(raw) == item["byteLength"] and digest(raw) == item["sha256"], "object exact bytes")
        objects[item["name"]] = raw
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    require(len(value["generations"]) == len(expected) and len(value["selectors"]) == len(expected), "history length")
    used, generations, transactions = set(), {}, set()
    previous_files, parent, vault = {}, None, None
    comparisons = 0
    for index, (row, oracle) in enumerate(zip(value["generations"], expected)):
        require(set(row) == {"name", "manifest", "files"} and row["name"] == oracle["name"], "generation model identity")
        require(row["manifest"] in objects, "manifest object missing")
        used.add(row["manifest"])
        raw = objects[row["manifest"]]
        require(len(raw) <= 4 * 1024 * 1024, "manifest bound")
        manifest = parse(raw)
        storage.probe.shape(manifest, schema["$defs"]["manifest"], SCHEMA)
        gid = manifest["generation_id"]
        require(gid not in generations and manifest["transaction_id"] not in transactions, "generation/transaction collision")
        transactions.add(manifest["transaction_id"])
        require(manifest["parent"] == parent and manifest["created_at"] == oracle["at"], "selected history parent/time")
        vault = vault or manifest["vault_id"]
        require(manifest["vault_id"] == vault and not manifest["raw_objects"], "selected Vault/raw policy")
        paths = [e["path"] for e in manifest["files"]]
        wanted = set(oracle["files"]) | set(IDENTITY) | {"mutation.json"}
        require(paths == sorted(set(paths)) and set(paths) == wanted and set(row["files"]) == wanted, "complete sorted inventory")
        files = {}
        for entry in manifest["files"]:
            name = row["files"][entry["path"]]
            require(name in objects, "listed object missing")
            used.add(name)
            data = objects[name]
            require(len(data) == entry["byte_length"] and digest(data) == entry["sha256"], "manifest listed byte identity")
            require(len(data) <= 16 * 1024 * 1024, "file bound")
            files[entry["path"]] = data
            if entry["path"] in IDENTITY:
                require(data == IDENTITY[entry["path"]], "selected Identity bytes")
            elif entry["path"] != "mutation.json":
                require(data == oracle["files"][entry["path"]], "exact Rust model serialization")
                comparisons += 1
        require(len(raw) + sum(map(len, files.values())) <= 256 * 1024 * 1024, "selected generation bound")
        require(len(files["mutation.json"]) <= 1024 * 1024, "mutation bound")
        mutation = parse(files["mutation.json"])
        storage.probe.shape(mutation, schema["$defs"]["mutation"], SCHEMA)
        for key in ("schema_version", "vault_id", "generation_id", "transaction_id", "created_at", "parent"):
            require(mutation[key] == manifest[key], "mutation binding: " + key)
        require(mutation["operation"] == oracle["operation"], "selected operation kind")
        content_files = {p: data for p,data in files.items() if p != "mutation.json"}
        require(set(previous_files) <= set(content_files), "retained records cannot disappear")
        changed = sorted(p for p,data in content_files.items() if previous_files.get(p) != data)
        require(mutation["changed_paths"] == changed, "actual changed paths")
        if index == 0:
            require(changed == sorted(IDENTITY), "empty bootstrap only")
        parent = {"generation_id": gid, "manifest_sha256": digest(raw)}
        generations[gid] = {"vault_id": vault, "manifest_sha256": digest(raw)}
        previous_files = content_files
        selector_name = value["selectors"][index]
        require(selector_name in objects, "selector missing")
        used.add(selector_name)
        selector_raw = objects[selector_name]
        require(len(selector_raw) <= 1024, "selector bound")
        current = parse(selector_raw)
        storage.probe.shape(current, schema["$defs"]["current"], SCHEMA)
        require(current["generation_id"] == gid and current["vault_id"] == vault and current["manifest_sha256"] == digest(raw), "exact selector identity")
    require(used == set(objects), "unaccounted object")
    return len(generations), len(objects), comparisons


def rewrite(value, name, change):
    item = next(i for i in value["objects"] if i["name"] == name)
    body = parse(base64.b64decode(item["base64"]))
    change(body)
    raw = compact(body)
    item.update(base64=base64.b64encode(raw).decode("ascii"), byteLength=len(raw), sha256=digest(raw))


def final_hash(value):
    name = value["generations"][-1]["manifest"]
    item = next(i for i in value["objects"] if i["name"] == name)
    rewrite(value, value["selectors"][-1], lambda c: c.update(manifest_sha256=item["sha256"]))


def final_mutation(value, change):
    row = value["generations"][-1]
    name = row["files"]["mutation.json"]
    rewrite(value, name, change)
    item = next(i for i in value["objects"] if i["name"] == name)
    rewrite(value, row["manifest"], lambda m: next(e for e in m["files"] if e["path"] == "mutation.json").update(byte_length=item["byteLength"], sha256=item["sha256"]))
    final_hash(value)


def negative_checks(fixture, expected):
    cases = []
    def case(label, change):
        value = deepcopy(fixture)
        change(value)
        cases.append((label, value))
    case("object bytes corrupted", lambda v: v["objects"][0].update(sha256="0" * 64))
    case("generation omitted", lambda v: v["generations"].pop())
    case("model history reordered", lambda v: v["generations"].reverse())
    case("selector substituted", lambda v: v["selectors"].__setitem__(-1, v["selectors"][0]))
    case("unknown fixture field", lambda v: v.update(runtimeEnabled=True))
    case("wrong operation despite rehash", lambda v: final_mutation(v, lambda m: m.update(operation="save_memory")))
    case("changed paths omitted despite rehash", lambda v: final_mutation(v, lambda m: m["changed_paths"].pop()))
    case("mutation lists itself despite rehash", lambda v: final_mutation(v, lambda m: m["changed_paths"].append("mutation.json")))
    case("transaction mismatch despite rehash", lambda v: final_mutation(v, lambda m: m.update(transaction_id="txn_" + "f" * 32)))
    case("late bootstrap despite rehash", lambda v: final_mutation(v, lambda m: m.update(operation="bootstrap")))
    def manifest(value, change):
        rewrite(value, value["generations"][-1]["manifest"], change)
        final_hash(value)
    case("unsorted complete inventory", lambda v: manifest(v, lambda m: m["files"].reverse()))
    case("self manifest entry", lambda v: manifest(v, lambda m: m["files"][0].update(path="manifest.json")))
    case("path traversal", lambda v: manifest(v, lambda m: m["files"][0].update(path="../memory.json")))
    case("per-file bound", lambda v: manifest(v, lambda m: m["files"][0].update(byte_length=16777217)))
    case("model/raw import fabricated", lambda v: manifest(v, lambda m: m["raw_objects"].append({"sha256": "a" * 64, "byte_length": 1})))
    case("parent hash contradiction", lambda v: manifest(v, lambda m: m["parent"].update(manifest_sha256="0" * 64)))
    def session_rewrite(value):
        row = value["generations"][-1]
        path = next(p for p in row["files"] if p.startswith("sessions/"))
        name = row["files"][path]
        rewrite(value, name, lambda s: s["events"][0]["event"].update(content="Rewritten historical user input"))
        item = next(i for i in value["objects"] if i["name"] == name)
        manifest(value, lambda m: next(e for e in m["files"] if e["path"] == path).update(byte_length=item["byteLength"], sha256=item["sha256"]))
    case("rehashed original turn rewrite", session_rewrite)
    for label, value in cases:
        try:
            validate(value, expected)
        except (ValueError, UnicodeError):
            continue
        raise ValueError("negative accepted: " + label)
    return len(cases)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cargo", help="Installed Cargo path for offline pure-model byte comparison")
    args = parser.parse_args()
    command = [sys.executable, str(ROOT / "scripts/check-canonical-history-design.py"), "--emit-model-files"]
    if args.cargo:
        command += ["--cargo", args.cargo]
    subprocess.run(command, cwd=ROOT, check=True)
    expected = expected_states()
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    generations, objects, comparisons = validate(fixture, expected)
    negatives = negative_checks(fixture, expected)
    print(f"PASS DESIGN full-model storage corpus: {generations} synthetic generations; {objects} exact objects; {comparisons} Rust file-byte comparisons; {negatives} malformed corpus refusals")
    print("NOT VERIFIED: actual storage adapter/transition validator, invocation/receipt/raw graphs, Windows publication or durability")
