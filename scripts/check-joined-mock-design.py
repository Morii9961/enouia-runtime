"""Selected inert generation/receipt/Mock joins; no store or dispatcher."""
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
FIXTURE = ROOT / "tests/fixtures/backend/joined-mock-v1.json"


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


storage = module("joined_storage", "check-storage-bytes-design.py")
digests = module("joined_digests", "check-command-digests-design.py")
require, compact, parse, digest = storage.require, storage.compact, storage.parse, storage.digest


def read(name):
    return json.loads((ROOT / "tests/fixtures/backend" / name).read_text(encoding="utf-8"))


def model_files(bundle):
    result = {}
    for kind, key in (("sources", "source_id"), ("memory", "memory_id"), ("candidates", "candidate_id"), ("sessions", "session_id")):
        records = bundle["sessions"] if kind == "sessions" else bundle["memory"]["memories" if kind == "memory" else kind]
        for record in records:
            result[f"{kind}/{record[key]}.json"] = compact(record)
    return result


def base_state():
    base = read("model-storage-v1.json")
    objects = {i["name"]: base64.b64decode(i["base64"], validate=True) for i in base["objects"]}
    row = base["generations"][-1]
    return parse(objects[base["selectors"][-1]]), {p: objects[n] for p, n in row["files"].items() if p != "mutation.json"}


def shape(value, path):
    path = ROOT / path
    storage.probe.shape(value, json.loads(path.read_text(encoding="utf-8")), path)


def validate(value):
    require(set(value) == {"schema_version", "evidence", "request", "generations"}, "fixture fields")
    require(type(value["schema_version"]) is int and value["schema_version"] == 1, "fixture version")
    require(value["evidence"] == "synthetic_selected_model_invocation_receipt_join", "evidence label")
    base, previous = base_state()
    corpus = read("mock-continuity-v1.json")
    config, expected = corpus["config"], corpus["expected"]
    request = value["request"]
    require(request == {"schemaVersion": 2, "clientRequestId": "synthetic_mock_submission_1", "expectedBinding": base,
                       "operation": {"kind": "send_mock_turn", "sessionId": config["session_id"], "content": config["text"],
                                     "projectId": "prj_" + "0" * 31 + "1", "maxTokens": 32768}}, "exact command intent")
    semantic_sha = digest(digests.semantic_bytes(request))
    frames = {k: expected[k + "_bytes"].encode("utf-8") for k in ("capsule", "request", "response")}
    operation_id, invocation_id = "op_" + f"{0x8001:032x}", "inv_" + f"{0x7001:032x}"
    op_path, inv_path = f"operations/{operation_id}.json", f"invocations/{invocation_id}.json"
    paths = {"capsule": f"capsules/{config['capsule_id']}.json", "request": f"requests/{config['request_id']}.json",
             "response": f"responses/{config['request_id']}.json"}
    stages = [("accepted", "accept_mock_submission", config["user_at"]),
              ("prepared", "attach_mock_preparation", config["prepared_at"]),
              ("dispatching", "mark_invocation_dispatch", "2026-10-03T00:00:19.000Z"),
              ("completed", "finalize_mock_submission", config["completed_at"])]
    require(len(value["generations"]) == 4, "four boundary generations")
    parent = {k: base[k] for k in ("generation_id", "manifest_sha256")}
    input_binding, previous_receipt = None, None
    total_files = 0
    for index, (row, (stage, operation, at)) in enumerate(zip(value["generations"], stages)):
        require(set(row) == {"stage", "manifest_utf8", "current_utf8", "files"} and row["stage"] == stage, "stage envelope/order")
        raw = row["manifest_utf8"].encode("utf-8")
        manifest = parse(raw)
        require(compact(manifest) == raw, "exact manifest compact/LF")
        schema = json.loads(storage.SCHEMA.read_text(encoding="utf-8"))
        storage.probe.shape(manifest, schema["$defs"]["manifest"], storage.SCHEMA)
        gid = "gen_" + f"{0x2013 + index:032x}"
        require(manifest["generation_id"] == gid and manifest["transaction_id"] == "txn_" + f"{0x3013 + index:032x}", "synthetic backend IDs")
        require(manifest["vault_id"] == base["vault_id"] and manifest["parent"] == parent and manifest["created_at"] == at and not manifest["raw_objects"], "lineage/time/raw")
        files = {p: s.encode("utf-8") for p, s in row["files"].items()}
        entries = manifest["files"]
        require([e["path"] for e in entries] == sorted(files), "complete sorted manifest inventory")
        for entry in entries:
            data = files[entry["path"]]
            require(len(data) == entry["byte_length"] and digest(data) == entry["sha256"], "exact listed bytes")
        require(len(raw) + sum(map(len, files.values())) <= 256 * 1024 * 1024, "generation byte bound")
        mutation = parse(files["mutation.json"])
        storage.probe.shape(mutation, schema["$defs"]["mutation"], storage.SCHEMA)
        require(all(mutation[k] == manifest[k] for k in ("schema_version", "vault_id", "generation_id", "transaction_id", "parent", "created_at")), "mutation binding")
        content = {p: b for p,b in files.items() if p != "mutation.json"}
        require(set(previous) <= set(content), "retained files")
        changed = sorted(p for p,b in content.items() if previous.get(p) != b)
        require(mutation["operation"] == operation and mutation["changed_paths"] == changed, "mutation exact change set")
        bundle = expected["completed" if index == 3 else "input"]
        wanted = model_files(bundle)
        wanted.update({"identity/" + item["name"]: item["content"].encode("utf-8") for item in config["identity"]})
        wanted[op_path] = files[op_path]
        if index:
            wanted.update({inv_path: files[inv_path], paths["capsule"]: frames["capsule"], paths["request"]: frames["request"]})
        if index == 3:
            wanted[paths["response"]] = frames["response"]
        require(content == wanted, "complete model/Identity/preparation/response inventory")
        receipt = parse(files[op_path])
        require(compact(receipt) == files[op_path], "receipt compact/LF")
        shape(receipt, "contracts/invocation/operation-receipt-v1.schema.json")
        refs = dict.fromkeys(("memoryId", "sourceId", "candidateId", "sessionId", "userTurnId", "userSourceId", "assistantTurnId", "assistantSourceId", "invocationId"))
        refs.update(sessionId=config["session_id"], userTurnId=config["user_turn_id"], userSourceId=config["user_source_id"])
        if index:
            refs["invocationId"] = invocation_id
        if index == 3:
            refs.update(assistantTurnId=config["assistant_turn_id"], assistantSourceId=config["assistant_source_id"])
        receipt_gid = "gen_" + f"{0x2014:032x}" if index == 2 else gid
        receipt_at = config["prepared_at"] if index == 2 else at
        require(receipt == {"schema_version": 1, "operation_id": operation_id, "client_key_sha256": digest(request["clientRequestId"].encode("utf-8")),
                            "request_sha256": semantic_sha, "digest_policy": "command_digest_v2", "command_kind": "send_mock_turn",
                            "expected_binding": base, "created_at": config["user_at"], "updated_at": receipt_at,
                            "status": "accepted" if index == 0 else "completed" if index == 3 else "running",
                            "committed_generation_id": receipt_gid, "result_refs": refs, "error_code": None}, "receipt semantic/result/last-change binding")
        if index == 2:
            require(files[op_path] == previous_receipt, "unchanged running receipt retains previous committed generation")
        if index:
            ledger = parse(files[inv_path])
            require(compact(ledger) == files[inv_path], "ledger compact/LF")
            shape(ledger, "contracts/invocation/record-v1.schema.json")
            result = None if index != 3 else {"response_sha256": digest(frames["response"]), "response_bytes": len(frames["response"]),
                                            "assistant_turn_id": config["assistant_turn_id"], "assistant_source_id": config["assistant_source_id"]}
            require(ledger == {"schema_version": 1, "invocation_id": invocation_id, "request_id": config["request_id"], "capsule_id": config["capsule_id"],
                               "capsule_sha256": digest(frames["capsule"]), "capsule_bytes": len(frames["capsule"]), "session_id": config["session_id"],
                               "user_turn_id": config["user_turn_id"], "input_binding": input_binding, "provider_id": "mock-v1",
                               "prepared_at": config["prepared_at"], "updated_at": at, "status": stage,
                               "dispatch_at": None if index == 1 else stages[2][2], "cancel_requested_at": None,
                               "terminal_at": at if index == 3 else None, "error_code": None, "result": result}, "ledger input/bytes/transition/result joins")
        current_raw = row["current_utf8"].encode("utf-8")
        current = parse(current_raw)
        storage.probe.shape(current, schema["$defs"]["current"], storage.SCHEMA)
        require(current == {"schema_version": 1, "vault_id": base["vault_id"], "generation_id": gid, "manifest_sha256": digest(raw)} and compact(current) == current_raw, "exact selector binding")
        if not index:
            input_binding = current
        parent, previous, previous_receipt = {k: current[k] for k in ("generation_id", "manifest_sha256")}, content, files[op_path]
        total_files += len(files)
    return total_files


def negative_checks(fixture):
    cases = []
    def case(label, stage, path, change):
        value = deepcopy(fixture)
        row = value["generations"][stage]
        file = next(p for p in row["files"] if p.startswith(path))
        data = parse(row["files"][file].encode("utf-8"))
        change(data)
        raw = compact(data)
        row["files"][file] = raw.decode("utf-8")
        manifest = parse(row["manifest_utf8"].encode("utf-8"))
        next(e for e in manifest["files"] if e["path"] == file).update(byte_length=len(raw), sha256=digest(raw))
        # Rehash the full downstream parent/selector/mutation chain. Rejection
        # must detect the semantic contradiction, not a broken outer digest.
        for index in range(stage, 4):
            row = value["generations"][index]
            if index != stage:
                manifest = parse(row["manifest_utf8"].encode("utf-8"))
                manifest["parent"] = parent
                mutation = parse(row["files"]["mutation.json"].encode("utf-8"))
                mutation["parent"] = parent
                raw = compact(mutation)
                row["files"]["mutation.json"] = raw.decode("utf-8")
                next(e for e in manifest["files"] if e["path"] == "mutation.json").update(byte_length=len(raw), sha256=digest(raw))
            raw = compact(manifest)
            row["manifest_utf8"] = raw.decode("utf-8")
            selector = parse(row["current_utf8"].encode("utf-8"))
            selector["manifest_sha256"] = digest(raw)
            row["current_utf8"] = compact(selector).decode("utf-8")
            parent = {k: selector[k] for k in ("generation_id", "manifest_sha256")}
        cases.append((label, value))
    case("original expected binding replaced", 3, "operations/", lambda r: r.update(expected_binding=r["expected_binding"] | {"manifest_sha256": "0" * 64}))
    case("receipt semantic digest forged", 3, "operations/", lambda r: r.update(request_sha256="0" * 64))
    case("receipt missing atomic assistant", 3, "operations/", lambda r: r["result_refs"].update(assistantTurnId=None))
    case("receipt wrong last-change generation", 2, "operations/", lambda r: r.update(committed_generation_id="gen_" + f"{0x2015:032x}"))
    case("ledger pinned preparation generation", 3, "invocations/", lambda r: r["input_binding"].update(generation_id="gen_" + f"{0x2014:032x}"))
    case("capsule LF included in consumed hash", 3, "invocations/", lambda r: r.update(capsule_sha256=digest(read("mock-continuity-v1.json")["expected"]["capsule_bytes"].encode("utf-8") + b"\n")))
    case("wrong response bytes", 3, "invocations/", lambda r: r["result"].update(response_bytes=r["result"]["response_bytes"] + 1))
    case("assistant text rewritten", 3, "sessions/", lambda r: r["events"][-1]["event"].update(content="Hidden alternative answer"))
    case("source binding substituted", 3, "sessions/", lambda r: r["events"][-1]["event"].update(source_id="src_" + "f" * 32))
    case("changed paths omitted", 3, "mutation", lambda r: r["changed_paths"].pop())
    case("prepared pretends dispatch", 1, "invocations/", lambda r: r.update(dispatch_at="2026-10-03T00:00:18.000Z"))
    for label, value in cases:
        try:
            validate(value)
        except ValueError:
            continue
        raise ValueError("negative accepted: " + label)
    return len(cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cargo", required=True, help="Installed Cargo for offline pure-model prerequisites")
    args = parser.parse_args()
    for script in ("check-model-storage-design.py", "check-mock-continuity-design.py"):
        subprocess.run([sys.executable, str(ROOT / "scripts" / script), "--cargo", args.cargo], cwd=ROOT, check=True)
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    files, refused = validate(fixture), negative_checks(fixture)
    print(f"PASS DESIGN joined Mock: 4 complete synthetic generations; {files} listed files; 11 rehashed semantic contradictions refused ({refused})")
    print("NOT VERIFIED: store/typed ledger handlers, locks, canonical publication, prepare-before-dispatch execution, cancellation or restart")


if __name__ == "__main__":
    main()
