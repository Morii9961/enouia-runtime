"""Selected Core wire/byte DESIGN checks, not a general schema engine or IPC."""
import base64
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "contracts/ipc/backend-read-results-v2.schema.json"
FIXTURE = ROOT / "tests/fixtures/backend/read-results-v2.json"


def require(condition, label):
    if not condition:
        raise ValueError(label)


def shape(value, schema, path=SCHEMA_PATH):
    # Supports only this committed graph's keywords. Unknown keywords fail loudly.
    supported = {"$schema", "$id", "$defs", "title", "description", "$ref", "type", "const", "enum",
                 "required", "properties", "additionalProperties", "items", "minItems", "maxItems",
                 "uniqueItems", "minimum", "maximum", "minLength", "maxLength", "pattern",
                 "oneOf", "anyOf", "allOf", "if", "then", "else"}
    if set(schema) - supported:
        raise RuntimeError("unsupported probe keyword: " + str(set(schema) - supported))
    if "$ref" in schema:
        name, _, pointer = schema["$ref"].partition("#")
        target_path = (path.parent / name).resolve() if name else path
        require(target_path.is_relative_to(ROOT), "schema reference escape")
        target = json.loads(target_path.read_text(encoding="utf-8"))
        for key in pointer.lstrip("/").split("/") if pointer else []:
            target = target[key.replace("~1", "/").replace("~0", "~")]
        shape(value, target, target_path)
    for keyword in ("oneOf", "anyOf"):
        if keyword in schema:
            count = 0
            for option in schema[keyword]:
                try:
                    shape(value, option, path)
                    count += 1
                except ValueError:
                    pass
            require(count == 1 if keyword == "oneOf" else count >= 1, keyword)
    for option in schema.get("allOf", []):
        shape(value, option, path)
    if "if" in schema:
        try:
            shape(value, schema["if"], path)
            branch = "then"
        except ValueError:
            branch = "else"
        if branch in schema:
            shape(value, schema[branch], path)
    if "type" in schema:
        tests = {"object": lambda v: isinstance(v, dict), "array": lambda v: isinstance(v, list),
                 "string": lambda v: isinstance(v, str), "integer": lambda v: type(v) is int,
                 "number": lambda v: type(v) in {int, float} and math.isfinite(v),
                 "boolean": lambda v: type(v) is bool, "null": lambda v: v is None}
        if schema["type"] not in tests:
            raise RuntimeError("unsupported probe type")
        require(tests[schema["type"]](value), "type")
    # Type-aware comparison keeps true distinct from 1 in closed Rust DTO examples.
    if "const" in schema:
        require(type(value) is type(schema["const"]) and value == schema["const"], "const")
    if "enum" in schema:
        require(any(type(value) is type(v) and value == v for v in schema["enum"]), "enum")
    if isinstance(value, dict):
        require(set(schema.get("required", [])) <= set(value), "required")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            require(set(value) <= set(properties), "unknown field")
        for name, child in properties.items():
            if name in value:
                shape(value[name], child, path)
    if isinstance(value, list):
        require(len(value) >= schema.get("minItems", 0) and len(value) <= schema.get("maxItems", len(value)), "array bound")
        if schema.get("uniqueItems"):
            require(len({json.dumps(v, sort_keys=True) for v in value}) == len(value), "duplicate item")
        if "items" in schema:
            for item in value:
                shape(item, schema["items"], path)
    if isinstance(value, str):
        require(len(value) >= schema.get("minLength", 0) and len(value) <= schema.get("maxLength", len(value)), "string bound")
        if "pattern" in schema:
            require(re.search(schema["pattern"], value) is not None, "pattern")
    if type(value) in {int, float}:
        require(value >= schema.get("minimum", value) and value <= schema.get("maximum", value), "number bound")


def capsule_bytes(capsule):
    raw = base64.b64decode(capsule["bytes"], validate=True)
    require(base64.b64encode(raw).decode("ascii") == capsule["bytes"], "noncanonical base64")
    require(len(raw) == capsule["byteLength"], "capsule length")
    require(hashlib.sha256(raw).hexdigest() == capsule["sha256"], "capsule hash")
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate capsule key")
            result[key] = value
        return result
    parsed = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)
    require(parsed["capsule_id"] == capsule["capsuleId"], "capsule identity")
    require(json.dumps(parsed, ensure_ascii=False, separators=(",", ":")).encode("utf-8") == raw, "compact capsule bytes")
    require(len(raw) + 256 <= parsed["budget"]["max_tokens"], "capsule budget")
    return raw


def semantics(value):
    body = value.get("outcome", value.get("result", value.get("query", {})))
    kind = body.get("kind")
    if kind in {"get_snapshot", "list_candidates"}:
        require((body["pageToken"] is None) or (body["processId"] is not None and body["expectedBinding"] is not None), "page identity")
        require(body["pageToken"] is not None or body["processId"] is None, "initial page process")
    if kind in {"snapshot_inventory", "candidate_page"}:
        page = body["page"]
        require((page["nextToken"] is None) == (page["remainingCount"] == 0), "page remainder")
        if kind == "snapshot_inventory":
            prefixes = {"memory": "mem", "source": "src", "session": "ses", "invocation": "inv", "operation": "op"}
            require(all(i["kind"] == body["collection"] and i["id"].startswith(prefixes[i["kind"]] + "_") for i in body["items"]), "inventory identity")
    if kind in {"durable_operation", "operation"}:
        operation = body["operation"]
        binding = body["observedBinding"] if kind == "durable_operation" else body["binding"]
        require(operation["committedBinding"]["vault_id"] == binding["vault_id"], "receipt Vault")
        status, refs = operation["status"], operation["resultRefs"]
        require((operation["errorCode"] is None) == (status in {"accepted", "running", "completed"}), "operation error")
        submission = operation["commandKind"] in {"send_mock_turn", "continue_user_turn", "resume_invocation"}
        if submission:
            require(all(refs[k] is not None for k in ("sessionId", "userTurnId", "userSourceId")), "saved input references")
            require((refs["assistantTurnId"] is not None and refs["assistantSourceId"] is not None) if status == "completed" else (refs["assistantTurnId"] is None and refs["assistantSourceId"] is None), "assistant outcome")
            if status == "completed":
                require(refs["invocationId"] is not None, "completed invocation reference")
        else:
            require(status == "completed", "synchronous status")
        if kind == "durable_operation" and body["job"] is not None:
            require(status in {"accepted", "running"}, "terminal job association")
    if kind in {"recorded_capsule", "preview_capsule"}:
        capsule_bytes(body["capsule"])
        if kind == "recorded_capsule":
            require(body["binding"]["vault_id"] == body["inputBinding"]["vault_id"], "capsule Vault")
    if kind == "memory_search":
        require((body["outcome"] == "no_match") == (not body["hits"]), "no-match outcome")
        require([h["rank"] for h in body["hits"]] == list(range(len(body["hits"]))), "rank order")
        require(len({h["memoryId"] for h in body["hits"]}) == len(body["hits"]), "duplicate hit")
        for hit in body["hits"]:
            if hit["selection"] == "scope":
                require(hit["priority"] in {0, 1} and not hit["matches"] and hit["matchesOmitted"] == 0, "scope hit")
                require(hit["scopeProjectId"] is not None if hit["priority"] == 0 else (hit["scopeSessionId"] is not None and hit["checkpointSequence"] is not None), "scope identity")
            else:
                require(hit["priority"] == 2 and bool(hit["matches"]), "literal hit")
    if kind == "health":
        require(not body["writeAllowed"] or (body["canonical"] == "ready" and body["binding"] is not None), "health write proof")
    if kind in {"job", "job_events"}:
        status = body["status"] if kind == "job" else body["poll"]["status"]
        require(status["total"] is None or status["processed"] <= status["total"], "job progress")
        if status["state"] in {"succeeded", "failed", "cancelled", "interrupted"}:
            require(not status["canCancel"] and status["phase"] == "terminal", "terminal job")
        if status["state"] == "queued":
            require(status["startedAt"] is None and status["processed"] == 0 and status["phase"] == "queued", "queued job")
        if kind == "job_events":
            poll = body["poll"]
            require(all(poll[k] == status[k] for k in ("jobId", "processId")), "poll identity")
            sequences = [e["sequence"] for e in poll["events"]]
            require(sequences == sorted(set(sequences)) and poll["nextCursor"] <= status["eventSequence"], "event ordering")
            if sequences:
                require(poll["nextCursor"] == sequences[-1] and sequences[-1] <= status["eventSequence"], "event cursor")
            for event in poll["events"]:
                require(event["sequence"] == event["status"]["eventSequence"] and all(event["status"][k] == poll[k] for k in ("jobId", "processId")), "event identity")


def check(value):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    shape(value, schema)
    semantics(value)


if __name__ == "__main__":
    examples = json.loads(FIXTURE.read_text(encoding="utf-8"))["examples"]
    for value in examples:
        check(value)
    definitions = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))["$defs"]
    query_kinds = {v["query"]["kind"] for v in examples if v["kind"] == "core_read"}
    require(query_kinds == set(definitions["capabilities"]["properties"]["readKinds"]["items"]["enum"]), "read query fixture coverage")
    result_kinds = {v["result"]["kind"] for v in examples if v["kind"] == "core_read_result"}
    expected_results = {definitions[r["$ref"].rsplit("/", 1)[1]]["properties"]["kind"]["const"] for r in definitions["readResponse"]["properties"]["result"]["oneOf"]}
    require(result_kinds == expected_results, "read result fixture coverage")
    def find(kind):
        return next(v for v in examples if v.get("result", v.get("outcome", v.get("query", {}))).get("kind") == kind)
    cases = []
    def case(label, original, change):
        value = deepcopy(original)
        change(value)
        cases.append((label, value))
    case("unknown field", examples[0], lambda v: v.update(path="private"))
    case("wrong version", examples[0], lambda v: v.update(schemaVersion=1))
    case("boolean version", examples[0], lambda v: v.update(schemaVersion=True))
    case("raw client path", find("get_memory"), lambda v: v["query"].update(path="private"))
    case("unbound page", find("get_snapshot"), lambda v: v["query"].update(pageToken="synthetic_page_01"))
    case("bad poll limit", find("poll_job_events"), lambda v: v["query"].update(limit=129))
    case("lost remaining count", find("snapshot_inventory"), lambda v: v["result"]["page"].update(remainingCount=1))
    case("false empty match", find("memory_search"), lambda v: v["result"].update(outcome="matched"))
    case("private key exposure", find("operation"), lambda v: v["result"]["operation"].update(client_key_sha256="1" * 64))
    case("accepted assistant", find("durable_operation"), lambda v: v["outcome"]["operation"]["resultRefs"].update(assistantTurnId="turn_" + "1" * 32))
    case("wrong Vault", find("operation"), lambda v: v["result"]["operation"]["committedBinding"].update(vault_id="vlt_" + "9" * 32))
    case("unsafe unknown", find("commit_unknown"), lambda v: v["outcome"].update(writesBlocked=False))
    case("hash mismatch", find("recorded_capsule"), lambda v: v["result"]["capsule"].update(sha256="0" * 64))
    case("length mismatch", find("recorded_capsule"), lambda v: v["result"]["capsule"].update(byteLength=1))
    case("persisted preview", find("preview_capsule"), lambda v: v["result"].update(persisted=True))
    case("blocked writes", find("health"), lambda v: v["result"].update(writeAllowed=True))
    case("canonical background", find("job_accepted"), lambda v: v["outcome"].update(canonicalChanged=True))
    case("missing assistant proof", find("operation"), lambda v: v["result"]["operation"]["resultRefs"].update(assistantSourceId=None))
    case("diagnostic path", find("read_rejected"), lambda v: v["result"]["error"].update(path="private"))
    case("event wrong process", find("job_events"), lambda v: v["result"]["poll"].update(processId="run_" + "9" * 32))
    case("event cursor mismatch", find("job_events"), lambda v: v["result"]["poll"].update(nextCursor=0))
    case("unknown total as exceeded zero", find("job"), lambda v: v["result"]["status"].update(total=0, processed=1))
    case("terminal cancellable job", find("job"), lambda v: v["result"]["status"].update(state="succeeded", phase="terminal"))
    for label, value in cases:
        try:
            check(value)
        except ValueError:
            continue
        raise ValueError("negative accepted: " + label)
    expected = json.loads((ROOT / "tests/fixtures/context/capsule-v1.json").read_text(encoding="utf-8"))
    actual = capsule_bytes(find("recorded_capsule")["result"]["capsule"])
    require(actual == json.dumps(expected, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), "frozen capsule bytes")
    print(f"PASS DESIGN examples: {len(examples)} wire shapes; {len(cases)} negative examples; exact frozen {len(actual)}-byte capsule")
    print("NOT VERIFIED: IPC, generation lineage, complete semantic model validation, pagination store, canonical retries or actual jobs")
