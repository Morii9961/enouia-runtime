"""Closed create-Session/digest DESIGN vector; not IPC or a receipt store."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "contracts/ipc/backend-command-v2.schema.json").read_text(encoding="utf-8"))
RECEIPT = json.loads((ROOT / "contracts/invocation/operation-receipt-v1.schema.json").read_text(encoding="utf-8"))
FIXTURE = json.loads((ROOT / "tests/fixtures/backend/command-v2.json").read_text(encoding="utf-8"))


def digest(request):
    if set(request) != set(SCHEMA["required"]) or type(request["schemaVersion"]) is not int or request["schemaVersion"] != 2:
        raise ValueError("envelope")
    key = request["clientRequestId"]
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", key):
        raise ValueError("action_key")
    binding = request["expectedBinding"]
    if set(binding) != {"schema_version", "vault_id", "generation_id", "manifest_sha256"} or binding["schema_version"] != 1:
        raise ValueError("binding")
    for field, pattern in (("vault_id",r"vlt_[0-9a-f]{32}"),("generation_id",r"gen_[0-9a-f]{32}"),("manifest_sha256",r"[0-9a-f]{64}")):
        if not re.fullmatch(pattern,binding[field]):
            raise ValueError("binding")
    operation=request["operation"]
    if set(operation) != {"kind","title"} or operation["kind"] != "create_session" or not isinstance(operation["title"],str) or not operation["title"].strip() or len(operation["title"])>256:
        raise ValueError("create_session")
    # Freeze declared typed field order rather than incoming object key order.
    normalized_binding={k:binding[k] for k in ("schema_version","vault_id","generation_id","manifest_sha256")}
    semantic={"schemaVersion":2,"expectedBinding":normalized_binding,
              "operation":{"kind":"create_session","title":operation["title"]}}
    return hashlib.sha256(json.dumps(semantic,ensure_ascii=False,separators=(",",":")).encode("utf-8")).hexdigest()


def main():
    request=FIXTURE["request"]
    expected=FIXTURE["expected_request_sha256"]
    assert digest(request)==expected
    reordered={k:request[k] for k in reversed(list(request))}
    assert digest(reordered)==expected
    another=deepcopy(request); another["clientRequestId"]="synthetic_action_0002"
    assert digest(another)==expected
    for change in ("title","expected_generation","original_whitespace"):
        altered=deepcopy(request)
        if change=="title": altered["operation"]["title"]="Different intent"
        elif change=="original_whitespace": altered["operation"]["title"]+=" "
        else: altered["expectedBinding"]["generation_id"]="gen_"+"4"*32
        assert digest(altered)!=expected
    rejected=0
    for change in ({"clientRequestId":"short"},{"rawPath":"outside"},{"schemaVersion":1},{"operation":{"kind":"create_session","title":" ","hiddenApproval":True}}):
        try: digest(request|change)
        except ValueError: rejected+=1
        else: raise AssertionError("invalid envelope accepted")
    assert "committed_generation_id" in RECEIPT["required"]
    assert "committed_binding" not in RECEIPT["properties"] and "manifest_sha256" not in RECEIPT["properties"]
    operations={SCHEMA["$defs"][r["$ref"].split("/")[-1]]["properties"]["kind"]["const"] for r in SCHEMA["properties"]["operation"]["oneOf"]}
    assert operations==set(RECEIPT["properties"]["command_kind"]["enum"])
    assert len(FIXTURE["expected_lookup"])==7
    print(json.dumps({"scope":"create-session shape/digest design only","digest_comparisons":6,
                      "negative_envelopes":rejected,"operation_kinds":len(operations),
                      "declared_retry_outcomes":7,"receipt_self_hash_absent":True}))


if __name__=="__main__": main()
