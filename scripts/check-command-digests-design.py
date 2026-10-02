"""All proposed command-kind byte DESIGN vectors; no handlers or Rust parity."""
from copy import deepcopy
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

# Import only the existing offline design probe; leave no bytecode artifacts.
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("read_design_probe", ROOT / "scripts/check-read-results-design.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
SCHEMA_PATH = ROOT / "contracts/ipc/backend-command-v2.schema.json"
RECIPE_PATH = ROOT / "contracts/ipc/command-digest-v2.json"
FIXTURE_PATH = ROOT / "tests/fixtures/backend/command-digests-v2.json"


def require(condition, label):
    if not condition:
        raise ValueError(label)


def decode(raw):
    require(isinstance(raw, bytes) and len(raw) <= 1048576 and not raw.startswith(b"\xef\xbb\xbf"), "wire limit/BOM")
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate request key")
            result[key] = value
        return result
    def invalid_constant(value):
        raise ValueError("non-finite JSON constant: " + value)
    return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid_constant)


def resolve(reference, path):
    name, _, pointer = reference.partition("#")
    target_path = (path.parent / name).resolve() if name else path
    require(target_path.is_relative_to(ROOT), "schema escape")
    target = json.loads(target_path.read_text(encoding="utf-8"))
    for key in pointer.lstrip("/").split("/") if pointer else []:
        target = target[key.replace("~1", "/").replace("~0", "~")]
    return target, target_path


def normalize(value, schema, path):
    if "$ref" in schema:
        target, target_path = resolve(schema["$ref"], path)
        return normalize(value, target, target_path)
    for union in ("oneOf", "anyOf"):
        if union in schema:
            matches = []
            for branch in schema[union]:
                try:
                    probe.shape(value, branch, path)
                    matches.append(branch)
                except ValueError:
                    pass
            require(bool(matches), "no typed branch")
            return normalize(value, matches[0], path)
    if isinstance(value, dict):
        result = {}
        for field, child in schema["properties"].items():
            if field in value:
                result[field] = normalize(value[field], child, path)
            elif field not in schema.get("required", []):
                # Current shared DTO defaults: Vec => [], Option => None.
                if child.get("type") == "array":
                    result[field] = []
                elif any(b.get("type") == "null" for b in child.get("anyOf", [])):
                    result[field] = None
                else:
                    raise ValueError("unsupported optional default: " + field)
        return result
    if isinstance(value, list):
        return [normalize(item, schema["items"], path) for item in value]
    if schema.get("type") == "number" and value is not None:
        return float(value)  # Shared MemoryDraft uses Option<f64>.
    return value


def text(value, cap):
    require(isinstance(value, str) and bool(value.strip()) and len(value.encode("utf-8")) <= cap, "text byte/nonblank")


def draft_semantics(draft):
    text(draft["content"], 65536)
    for field in ("tags", "decisions", "openLoops"):
        require(len(draft[field]) <= 256, "draft array cap")
        for item in draft[field]:
            text(item, 4096)
    for field in ("state", "lastState"):
        if draft[field] is not None:
            text(draft[field], 65536)
    kind = draft["type"]
    if kind == "project_state":
        require(draft["projectId"] is not None and draft["state"] is not None, "project fields")
        require(all(draft[k] is None for k in ("sessionId", "coveredTurns", "lastState")), "project Session fields")
    elif kind == "session_checkpoint":
        require(draft["state"] is None and not draft["decisions"], "checkpoint project fields")
        require(all(draft[k] is not None for k in ("sessionId", "coveredTurns", "lastState")), "checkpoint fields")
    else:
        require(all(draft[k] is None for k in ("state", "sessionId", "coveredTurns", "lastState")) and not draft["decisions"] and not draft["openLoops"], "ordinary kind fields")
    if draft["validity"] is not None:
        validity = draft["validity"]
        for value in (validity["starts_at"], validity["ends_at"]):
            if value is not None:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(validity["ends_at"] is None or validity["ends_at"] >= validity["starts_at"], "validity order")


def semantic_bytes(request):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    probe.shape(request, schema, SCHEMA_PATH)
    require(re.fullmatch(r"[A-Za-z0-9_-]{16,64}", request["clientRequestId"]) is not None, "client token")
    normalized = normalize(request, schema, SCHEMA_PATH)
    probe.shape(normalized, schema, SCHEMA_PATH)
    def opaque_ids(value):
        patterns = {"vault_id": "vlt", "generation_id": "gen", "projectId": "prj", "sessionId": "ses",
                    "memoryId": "mem", "candidateId": "cand", "invocationId": "inv", "operationId": "op",
                    "userTurnId": "turn", "first_turn_id": "turn", "last_turn_id": "turn", "supersedes": "mem"}
        if isinstance(value, dict):
            for name, child in value.items():
                if name in patterns and child is not None:
                    require(re.fullmatch(patterns[name] + r"_[0-9a-f]{32}", child) is not None, "opaque ID")
                opaque_ids(child)
        elif isinstance(value, list):
            for child in value:
                opaque_ids(child)
    opaque_ids(normalized)
    operation = normalized["operation"]
    kind = operation["kind"]
    if kind == "save_memory":
        require(operation["draft"]["type"] != "session_checkpoint", "checkpoint dedicated command")
        draft_semantics(operation["draft"])
    if kind == "review_candidate":
        review = operation["review"]
        if review["action"] == "approve" and review["edited"] is not None:
            draft_semantics(review["edited"])
        elif review["action"] == "reject":
            text(review["reason"], 65536)
    if kind == "create_session":
        text(operation["title"], 1024)
    if kind in {"append_user_turn", "update_identity", "send_mock_turn"}:
        text(operation["content"], 1024 if kind == "send_mock_turn" else 65536)
    if kind == "create_checkpoint":
        text(operation["lastState"], 65536)
        for item in operation["openLoops"]:
            text(item, 4096)
    # Client token affects lookup, not the semantic command digest.
    normalized.pop("clientRequestId")
    raw = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    require(len(raw) <= 1048576, "semantic limit")
    return raw


def reverse_objects(value):
    if isinstance(value, dict):
        return {key: reverse_objects(value[key]) for key in reversed(value)}
    if isinstance(value, list):
        return [reverse_objects(item) for item in value]
    return value


def main():
    recipe = json.loads(RECIPE_PATH.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    operations = {schema["$defs"][r["$ref"].rsplit("/", 1)[1]]["properties"]["kind"]["const"]: schema["$defs"][r["$ref"].rsplit("/", 1)[1]] for r in schema["properties"]["operation"]["oneOf"]}
    require(recipe["operationFields"] == {k: list(v["properties"]) for k, v in operations.items()}, "operation order recipe")
    require(recipe["topFields"] == [k for k in schema["properties"] if k != "clientRequestId"], "top field recipe")
    binding, _ = resolve(schema["properties"]["expectedBinding"]["$ref"], SCHEMA_PATH)
    require(recipe["bindingFields"] == list(binding["properties"]), "binding field recipe")
    require(recipe["draftFields"] == list(json.loads((ROOT / "contracts/memory/draft-v1.schema.json").read_text(encoding="utf-8"))["properties"]), "draft order recipe")
    models = json.loads((ROOT / "contracts/memory/models-v1.schema.json").read_text(encoding="utf-8"))["$defs"]
    require(recipe["turnRangeFields"] == list(models["turnRange"]["properties"]) and recipe["validityFields"] == list(models["validity"]["properties"]), "nested field recipe")
    reviews = json.loads((ROOT / "contracts/ipc/core-v1.schema.json").read_text(encoding="utf-8"))["$defs"]["candidateReview"]["oneOf"]
    require(recipe["reviewFields"] == {r["properties"]["action"]["const"]: list(r["properties"]) for r in reviews}, "review field recipe")
    require(recipe["wireAndSemanticByteLimit"] == 1048576, "byte limit recipe")
    require(recipe["optionalDraftDefaults"] == {"projectId": None, "tags": [], "validity": None, "confidence": None, "supersedes": None, "state": None, "decisions": [], "openLoops": [], "sessionId": None, "coveredTurns": None, "lastState": None}, "default recipe")
    require({v["request"]["operation"]["kind"] for v in fixture["vectors"]} == set(operations), "all command kinds")
    comparisons = 0
    for vector in fixture["vectors"]:
        request = vector["request"]
        raw = semantic_bytes(request)
        require(raw.decode("utf-8") == vector["semanticUtf8"] and len(raw) == vector["byteLength"] and hashlib.sha256(raw).hexdigest() == vector["sha256"], "golden bytes: " + vector["name"])
        require(semantic_bytes(reverse_objects(request)) == raw, "recursive key order")
        altered = deepcopy(request); altered["clientRequestId"] = "another_synthetic_0001"
        require(semantic_bytes(altered) == raw, "token exclusion")
        normalized_wire = {"schemaVersion": 2, "clientRequestId": request["clientRequestId"], **json.loads(raw)}
        require(semantic_bytes(normalized_wire) == raw, "explicit defaults")
        incoming = json.dumps(request, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
        require(semantic_bytes(decode(incoming)) == raw, "wire whitespace versus typed bytes")
        changed = deepcopy(request); changed["expectedBinding"]["generation_id"] = "gen_" + "9" * 32
        require(semantic_bytes(changed) != raw, "expected binding intent")
        comparisons += 6
    legacy = json.loads((ROOT / "tests/fixtures/backend/command-v2.json").read_text(encoding="utf-8"))
    require(hashlib.sha256(semantic_bytes(legacy["request"])).hexdigest() == legacy["expected_request_sha256"], "legacy frozen digest")
    sample = deepcopy(fixture["vectors"][0]["request"])
    cases = []
    def case(label, change):
        value = deepcopy(sample); change(value); cases.append((label, value))
    case("extra envelope", lambda v: v.update(rawPath="outside"))
    case("boolean binding version", lambda v: v["expectedBinding"].update(schema_version=True))
    case("short token", lambda v: v.update(clientRequestId="short"))
    case("hidden approval", lambda v: v["operation"].update(approved=True))
    case("missing required", lambda v: v["operation"].pop("draft"))
    case("duplicate tags", lambda v: v["operation"]["draft"].update(tags=["x", "x"]))
    case("blank content", lambda v: v["operation"]["draft"].update(content=" \t"))
    case("private source override", lambda v: v["operation"]["draft"].update(sourceId="src_" + "1" * 32))
    case("nonfinite confidence", lambda v: v["operation"]["draft"].update(confidence=float("nan")))
    case("wrong kind fields", lambda v: v["operation"]["draft"].update(state="unrelated state"))
    case("trailing ID newline", lambda v: v["expectedBinding"].update(vault_id="vlt_" + "1" * 32 + "\n"))
    case("invalid calendar", lambda v: v["operation"]["draft"].update(validity={"starts_at":"2026-02-30T00:00:00.000Z"}))
    case("UTF8 content cap", lambda v: v["operation"]["draft"].update(content="汉" * 21846))
    case("tag cap", lambda v: v["operation"]["draft"].update(tags=[str(i) for i in range(257)]))
    case("lone surrogate", lambda v: v["operation"]["draft"].update(content="\ud800"))
    for label, value in cases:
        try:
            semantic_bytes(value)
        except ValueError:
            continue
        raise ValueError("negative accepted: " + label)
    wire_negatives = [b'{"schemaVersion":2,"schemaVersion":2}', b'{"draft":{"content":"a","content":"b"}}',
                      b'{"confidence":NaN}', b'{"confidence":Infinity}', b"\xff", b"\xef\xbb\xbf{}", b" " * 1048577]
    for raw in wire_negatives:
        try:
            decode(raw)
        except ValueError:
            continue
        raise ValueError("wire negative accepted")
    original = semantic_bytes(sample)
    whitespace = deepcopy(sample); whitespace["operation"]["draft"]["content"] += " "
    require(semantic_bytes(whitespace) != original, "text whitespace intent")
    tagged = deepcopy(sample); tagged["operation"]["draft"]["tags"] = ["x", "y"]
    reordered = deepcopy(tagged); reordered["operation"]["draft"]["tags"].reverse()
    require(semantic_bytes(tagged) != semantic_bytes(reordered), "tag array intent")
    number = deepcopy(sample); number["operation"]["draft"]["confidence"] = 1
    floating = deepcopy(number); floating["operation"]["draft"]["confidence"] = 1.0
    require(semantic_bytes(number) == semantic_bytes(floating), "typed numeric equivalence")
    positive = deepcopy(number); positive["operation"]["draft"]["confidence"] = 0.0
    negative = deepcopy(number); negative["operation"]["draft"]["confidence"] = -0.0
    require(semantic_bytes(positive) != semantic_bytes(negative), "signed-zero typed representation")
    print(f"PASS DESIGN digests: {len(fixture['vectors'])} byte vectors across 12 kinds; {comparisons} comparisons; 4 text/array/numeric distinctions; {len(cases)+len(wire_negatives)} negative examples; legacy create-Session hash preserved")
    print("NOT VERIFIED: Rust/f64 byte parity, complete canonical references, actual human authorization, handlers or receipt storage")


if __name__ == "__main__":
    main()
