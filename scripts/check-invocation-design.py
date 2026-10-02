"""Byte/shape DESIGN checker, not Runtime persistence or a JSON Schema engine."""
from copy import deepcopy
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def wire(value, newline=False):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + (b"\n" if newline else b"")


SCHEMA = load("contracts/invocation/record-v1.schema.json")
FIXTURE = load("tests/fixtures/invocation/bindings-v1.json")
CAPSULE = load("tests/fixtures/context/capsule-v1.json")
RESPONSE = load("tests/fixtures/provider/mock-response-v1.json")


def shape(value, schema):
    """Only the subset of shape keywords used in this local design schema."""
    if "$ref" in schema:
        target = SCHEMA
        for part in schema["$ref"][2:].split("/"):
            target = target[part]
        return shape(value, target)
    if "anyOf" in schema:
        for option in schema["anyOf"]:
            try:
                shape(value, option)
                return
            except ValueError:
                pass
        raise ValueError("shape_union")
    if "const" in schema and (value != schema["const"] or isinstance(value, bool)):
        raise ValueError("shape_const")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError("shape_enum")
    kind = schema.get("type")
    if kind == "object":
        if not isinstance(value, dict) or not set(schema["required"]) <= value.keys() or value.keys() - schema["properties"].keys():
            raise ValueError("shape_object")
        for key, item in value.items():
            shape(item, schema["properties"][key])
    elif kind == "string":
        if not isinstance(value, str) or not re.fullmatch(schema["pattern"], value):
            raise ValueError("shape_string")
    elif kind == "integer":
        if type(value) is not int or not schema["minimum"] <= value <= schema["maximum"]:
            raise ValueError("shape_integer")
    elif kind == "null" and value is not None:
        raise ValueError("shape_null")


def validate(record, capsule_bytes, response_bytes=None):
    shape(record, SCHEMA)
    for key in ("prepared_at", "updated_at", "dispatch_at", "cancel_requested_at", "terminal_at"):
        if record[key] is not None:
            datetime.strptime(record[key], "%Y-%m-%dT%H:%M:%S.%fZ")
            if record[key] < record["prepared_at"] or record[key] > record["updated_at"]:
                raise ValueError("time_order")
    if record["capsule_sha256"] != hashlib.sha256(capsule_bytes).hexdigest() or record["capsule_bytes"] != len(capsule_bytes):
        raise ValueError("capsule_binding")
    if record["capsule_id"] != CAPSULE["capsule_id"]:
        raise ValueError("capsule_identity")
    status = record["status"]
    terminal = status in ("completed", "failed", "cancelled", "interrupted", "stale")
    if (record["terminal_at"] is not None) != terminal:
        raise ValueError("terminal_shape")
    if terminal and record["updated_at"] != record["terminal_at"]:
        raise ValueError("terminal_time")
    if status in ("dispatching", "cancel_requested", "completed", "interrupted") and record["dispatch_at"] is None:
        raise ValueError("missing_dispatch")
    if status == "cancel_requested" and record["cancel_requested_at"] is None:
        raise ValueError("missing_cancel_intent")
    if record["cancel_requested_at"] and record["dispatch_at"] and record["cancel_requested_at"] < record["dispatch_at"]:
        raise ValueError("cancel_time")
    if status == "prepared" and any(record[k] is not None for k in ("dispatch_at", "cancel_requested_at", "terminal_at", "error_code", "result")):
        raise ValueError("prepared_shape")
    if status == "completed":
        result = record["result"]
        if not result or record["error_code"] or record["cancel_requested_at"] or response_bytes is None:
            raise ValueError("completed_shape")
        if result["response_sha256"] != hashlib.sha256(response_bytes).hexdigest() or result["response_bytes"] != len(response_bytes):
            raise ValueError("response_binding")
        if RESPONSE["request_id"] != record["request_id"] or RESPONSE["capsule_id"] != record["capsule_id"]:
            raise ValueError("response_identity")
        if RESPONSE["consumed_capsule_sha256"] != record["capsule_sha256"] or RESPONSE["consumed_bytes"] != record["capsule_bytes"]:
            raise ValueError("response_consumption")
    elif record["result"] is not None or (terminal and record["error_code"] is None):
        raise ValueError("noncompleted_result")


def main():
    capsule_bytes, response_bytes = wire(CAPSULE), wire(RESPONSE, newline=True)
    assert hashlib.sha256(capsule_bytes).hexdigest() == FIXTURE["capsule_sha256"]
    assert len(capsule_bytes) == FIXTURE["capsule_bytes"]
    assert hashlib.sha256(response_bytes).hexdigest() == FIXTURE["response_sha256"]
    assert len(response_bytes) == FIXTURE["response_bytes"]
    prepared = deepcopy(FIXTURE["prepared"])
    completed = prepared | FIXTURE["completed_patch"]
    validate(prepared, capsule_bytes)
    validate(completed, capsule_bytes, response_bytes)
    changes = [
        {"status": "completed"}, {"provider_id": "remote"}, {"dispatch_at": None},
        {"capsule_sha256": "0" * 64}, {"capsule_bytes": 1},
        {"request_id": "req_" + "f" * 32}, {"hidden_messages": []},
        {"prepared_at": "2026-02-30T09:00:00.000Z"},
        {"cancel_requested_at": "2026-10-02T09:00:01.000Z"},
        {"terminal_at": None}, {"updated_at": "2026-10-01T09:00:00.000Z"}
    ]
    rejected = 0
    for change in changes:
        record = (prepared if change == {"status": "completed"} else completed) | change
        try:
            validate(record, capsule_bytes, response_bytes)
        except ValueError:
            rejected += 1
        else:
            raise AssertionError(("invalid example accepted", change))
    for altered_capsule, altered_response in ((capsule_bytes+b"\n", response_bytes), (capsule_bytes, response_bytes.rstrip(b"\n"))):
        try:
            validate(completed, altered_capsule, altered_response)
        except ValueError:
            rejected += 1
        else:
            raise AssertionError("changed stored bytes accepted")
    edges = {tuple(edge) for edge in FIXTURE["legal_edges"]}
    assert len(edges) == 11
    assert not any(a in ("completed","failed","cancelled","interrupted","stale") for a,b in edges)
    assert ("cancel_requested","completed") not in edges
    assert ("prepared","completed") not in edges
    print(json.dumps({"scope":"byte/shape design only", "valid_records":2,"negative_cases":rejected,
                      "declared_legal_edges":len(edges), "capsule_bytes":len(capsule_bytes), "response_bytes":len(response_bytes)}))


if __name__ == "__main__":
    main()
