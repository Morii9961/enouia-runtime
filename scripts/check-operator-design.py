"""Selected operator report/export-plan DESIGN; no filesystem export or repair."""
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
SCHEMA = ROOT / "contracts/operator/inspection-export-v1.schema.json"
FIXTURE = ROOT / "tests/fixtures/backend/operator-export-v1.json"
spec = importlib.util.spec_from_file_location("operator_shape", ROOT / "scripts/check-read-results-design.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
require = probe.require


def compact(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def oracle():
    # This previously checked synthetic corpus supplies metadata byte oracles;
    # it is not a current live Vault inspection or a physical file-tree scan.
    source = json.loads((ROOT / "tests/fixtures/backend/model-storage-v1.json").read_text(encoding="utf-8"))
    objects = {o["name"]: base64.b64decode(o["base64"], validate=True) for o in source["objects"]}
    items = {}
    for row in source["generations"]:
        raw = objects[row["manifest"]]
        manifest = json.loads(raw)
        binding = {"schema_version": 1, "vault_id": manifest["vault_id"], "generation_id": manifest["generation_id"], "manifest_sha256": hashlib.sha256(raw).hexdigest()}
        files = [{"generation_id": manifest["generation_id"], **entry} for entry in manifest["files"]]
        files.append({"generation_id": manifest["generation_id"], "path": "manifest.json", "byte_length": len(raw), "sha256": binding["manifest_sha256"]})
        items[manifest["generation_id"]] = {"binding": binding, "parent": manifest["parent"], "files": files, "raw": manifest["raw_objects"]}
    selector = objects[source["selectors"][-1]]
    return items, {"kind": "valid", "byte_length": len(selector), "sha256": hashlib.sha256(selector).hexdigest(), "binding": json.loads(selector)}


def validate(value, items):
    require(set(value) == {"report", "plan", "request", "plan_sha256"}, "example envelope")
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    report, plan, request = (value[k] for k in ("report", "plan", "request"))
    for key, obj in (("report", report), ("plan", plan), ("exportRequest", request)):
        probe.shape(obj, schema["$defs"][key], SCHEMA)
    datetime.fromisoformat(report["observed_at"].replace("Z", "+00:00"))
    datetime.fromisoformat(plan["created_at"].replace("Z", "+00:00"))
    require(len(compact(report)) <= 1024 * 1024, "report byte bound")
    observation = report["selector"]
    if observation["kind"] == "valid":
        require(observation["binding"] is not None and observation["byte_length"] is not None and observation["sha256"] is not None, "valid selector observation")
    elif observation["kind"] in {"absent", "unreadable"}:
        require(all(observation[k] is None for k in ("binding", "byte_length", "sha256")), "unknown/absent selector bytes")
    else:
        require(observation["binding"] is None, "invalid selector binding")
    require(observation["kind"] != "unreadable", "unreadable selector cannot support exact export observation")
    if observation["kind"] == "invalid":
        require(observation["byte_length"] is not None and observation["sha256"] is not None, "invalid selector bytes must be exactly observed for export")
    require(report["root_verified"] and report["scan_complete"], "complete checked root premise")
    for key in ("inspection_id", "process_id", "root_observation_id"):
        require(plan[key] == report[key], "plan/report identity")
    for key in ("inspection_id", "process_id", "plan_id", "destination_id"):
        require(request[key] == plan[key], "reviewed request identity")
    require(plan["selector_observation"] == observation, "selector exact observation")
    require(report["observed_at"] <= plan["created_at"], "plan observation order")
    candidates = report["candidates"]
    require(len({c["binding"]["generation_id"] for c in candidates}) == len(candidates), "candidate duplicates")
    require(any(c["binding"] == plan["target_binding"] and c["model_valid"] and c["lineage_complete"] for c in candidates), "named verified candidate")
    if plan["purpose"] == "selected_history":
        require(observation["kind"] == "valid" and report["canonical_binding"] == observation["binding"] == plan["target_binding"], "selected canonical claim")
    elif report["canonical_binding"] is not None:
        require(observation["kind"] == "valid" and report["canonical_binding"] == observation["binding"], "canonical report binding")
    target = plan["target_binding"]
    current = target["generation_id"]
    lineage, files, raw = [], [], {}
    seen = set()
    while current is not None:
        require(current in items and current not in seen and len(seen) < 256, "named retained lineage")
        seen.add(current)
        row = items[current]
        require(row["binding"]["vault_id"] == target["vault_id"], "export Vault continuity")
        if len(seen) == 1:
            require(row["binding"] == target, "target exact hash")
        lineage.append({"binding": row["binding"], "parent": row["parent"]})
        files.extend(row["files"])
        for obj in row["raw"]:
            require(obj["sha256"] not in raw or raw[obj["sha256"]] == obj, "raw collision")
            raw[obj["sha256"]] = obj
        parent = row["parent"]
        if parent:
            require(parent["generation_id"] in items and items[parent["generation_id"]]["binding"]["manifest_sha256"] == parent["manifest_sha256"], "ancestor exact hash")
        current = parent["generation_id"] if parent else None
    files.sort(key=lambda e: (e["generation_id"], e["path"]))
    raw = sorted(raw.values(), key=lambda r: r["sha256"])
    require(plan["lineage"] == lineage and plan["files"] == files and plan["raw_objects"] == raw, "complete named history copy inventory")
    require(plan["entry_count"] == len(files) + len(raw) <= 100000, "entry total")
    require(plan["total_bytes"] == sum(e["byte_length"] for e in files + raw) <= 512 * 1024 * 1024, "export byte total")
    encoded = compact(plan)
    require(len(encoded) <= 4 * 1024 * 1024, "plan byte bound")
    sha = hashlib.sha256(encoded).hexdigest()
    require(value["plan_sha256"] == request["expected_plan_sha256"] == sha, "review exact plan bytes")
    return len(lineage), len(files), len(encoded)


def rehash(value):
    sha = hashlib.sha256(compact(value["plan"])).hexdigest()
    value["plan_sha256"] = value["request"]["expected_plan_sha256"] = sha


def negatives(example, items):
    cases = []
    def case(label, change, recompute=False):
        value = deepcopy(example)
        change(value)
        if recompute:
            rehash(value)
        cases.append((label, value))
    case("root unverified", lambda v: v["report"].update(root_verified=False))
    case("scan incomplete", lambda v: v["report"].update(scan_complete=False))
    case("candidate invalid", lambda v: v["report"]["candidates"][0].update(model_valid=False))
    case("lineage not proved", lambda v: v["report"]["candidates"][0].update(lineage_complete=False))
    case("replaced process", lambda v: v["request"].update(process_id="run_" + "f" * 32))
    case("replaced root observation", lambda v: v["plan"].update(root_observation_id="obs_" + "f" * 32), True)
    case("wrong destination", lambda v: v["request"].update(destination_id="dst_" + "f" * 32))
    case("review hash mismatch", lambda v: v["request"].update(expected_plan_sha256="0" * 64))
    case("mutable selector observation", lambda v: v["plan"]["selector_observation"].update(sha256="0" * 64), True)
    case("ancestor omitted", lambda v: v["plan"]["lineage"].pop(), True)
    case("entry omitted", lambda v: v["plan"]["files"].pop(), True)
    case("entry duplicated", lambda v: v["plan"]["files"].append(deepcopy(v["plan"]["files"][0])), True)
    case("copy inventory reordered", lambda v: v["plan"]["files"].reverse(), True)
    case("file byte hash rewritten", lambda v: v["plan"]["files"][0].update(sha256="0" * 64), True)
    case("file total rewritten", lambda v: v["plan"].update(total_bytes=0), True)
    case("canonical activation", lambda v: v["plan"].update(canonical_changes=True), True)
    case("source path traversal", lambda v: v["plan"]["files"][0].update(path="../CURRENT"), True)
    case("caller raw destination", lambda v: v["request"].update(destination_path="C:/private"))
    case("invented repair action", lambda v: v["request"].update(kind="restore_selector"))
    case("fake raw object", lambda v: v["plan"]["raw_objects"].append({"sha256": "a" * 64, "byte_length": 1}), True)
    def unknown_selector(value, kind):
        observation = {"kind": kind, "byte_length": None, "sha256": None, "binding": None}
        value["report"].update(selector=observation, canonical_binding=None)
        value["plan"].update(purpose="named_history", selector_observation=observation)
    case("unreadable selector export", lambda v: unknown_selector(v, "unreadable"), True)
    case("invalid selector without exact bytes", lambda v: unknown_selector(v, "invalid"), True)
    case("invalid calendar observation", lambda v: v["report"].update(observed_at="2026-02-30T00:01:00.000Z"))
    for label, value in cases:
        try:
            validate(value, items)
        except ValueError:
            continue
        raise ValueError("negative accepted: " + label)
    return len(cases)


if __name__ == "__main__":
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    require(set(fixture) == {"schema_version", "evidence", "examples"} and type(fixture["schema_version"]) is int and fixture["schema_version"] == 1, "fixture fields/version")
    require(fixture["evidence"] == "synthetic_operator_plan_only", "fixture evidence")
    items, selector = oracle()
    for example in fixture["examples"]:
        count, entries, byte_length = validate(example, items)
        if example["plan"]["purpose"] == "selected_history":
            require(example["report"]["selector"] == selector, "known synthetic selector bytes")
    refused = negatives(fixture["examples"][0], items)
    print(f"PASS DESIGN operator plans: {len(fixture['examples'])} reviewed metadata examples; {count} generations/{entries} complete copy entries; {refused} refusal cases")
    print("NOT VERIFIED: actual inspection/authorization, expiry, source/destination ports, copying, export publication or selector recovery")
