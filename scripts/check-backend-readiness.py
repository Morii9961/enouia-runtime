"""Backend DESIGN artifact/plan integrity only; no handlers or durable acceptance."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "docs/backend/implementation-slices-v1.json"
DEPENDENCIES = {
    "P01": [], "P02": ["P01"], "P03": ["P02"], "P04": ["P03"],
    "P05": ["P03", "P04"], "P06": ["P05"], "P07": ["P03", "P04"],
    "P08": ["P06", "P07"], "P09": ["P05", "P07", "P08"],
    "P10": ["P04", "P06", "P08", "P09"],
}
ARTIFACTS = {
    "docs/VAULT_STORAGE_v1.md", "docs/VAULT_RECOVERY_MATRIX_v1.md",
    "docs/MEMORY_INDEX_v1.md", "docs/MEMORY_RETRIEVAL_v1.md",
    "docs/INVOCATION_LEDGER_v1.md", "docs/CORE_COMMANDS_v2_DESIGN.md",
    "docs/CORE_JOBS_v1.md", "docs/WINDOWS_VAULT_PORTS_v1.md",
    "docs/BACKEND_IMPLEMENTATION_SEQUENCE_v1.md",
    "contracts/vault/storage-v1.schema.json", "contracts/vault/memory-index-v1.sql",
    "contracts/invocation/record-v1.schema.json",
    "contracts/invocation/operation-receipt-v1.schema.json",
    "contracts/ipc/backend-command-v2.schema.json",
    "contracts/ipc/backend-jobs-v1.schema.json",
    "docs/adr/020-core-vault-generations.md", "docs/adr/021-index-and-retrieval.md",
    "docs/adr/022-invocation-and-session.md", "docs/adr/023-command-receipts-and-jobs.md",
    "scripts/check-backend-readiness.py",
    "docs/CORE_READ_RESULTS_v2_DESIGN.md",
    "contracts/ipc/backend-read-results-v2.schema.json",
    "scripts/check-read-results-design.py",
    "tests/fixtures/backend/read-results-v2.json",
    "docs/COMMAND_DIGEST_VECTORS_v2_DESIGN.md",
    "contracts/ipc/command-digest-v2.json",
    "scripts/check-command-digests-design.py",
    "tests/fixtures/backend/command-digests-v2.json",
    "docs/ORCHESTRATION_TRACES_v1_DESIGN.md",
    "scripts/check-orchestration-traces-design.py",
    "tests/fixtures/backend/orchestration-traces-v1.json",
    "tests/fixtures/invocation/bindings-v1.json",
    "docs/STORAGE_BYTES_v1_DESIGN.md",
    "scripts/check-storage-bytes-design.py",
    "tests/fixtures/backend/storage-bytes-v1.json",
    "docs/DISPOSABLE_LIFECYCLE_v1_DESIGN.md",
    "contracts/ipc/disposable-lifecycle-v1.json",
    "scripts/check-disposable-lifecycle-design.py",
    "tests/fixtures/backend/disposable-lifecycle-v1.json",
    "docs/BACKEND_ADMISSION_v2_DESIGN.md",
    "docs/CANONICAL_HISTORY_v1_DESIGN.md",
    "scripts/design/canonical-history-v1.rs",
    "scripts/check-canonical-history-design.py",
    "tests/fixtures/backend/canonical-history-v1.json",
    "docs/MODEL_STORAGE_BYTES_v1_DESIGN.md",
    "scripts/check-model-storage-design.py",
    "tests/fixtures/backend/model-storage-v1.json",
    "docs/PURE_MOCK_CONTINUITY_v1_DESIGN.md",
    "scripts/design/mock-continuity-v1.rs",
    "scripts/check-mock-continuity-design.py",
    "tests/fixtures/backend/mock-continuity-v1.json",
    "tests/fixtures/backend/mock-continuity-bytes-v1.json",
    "docs/VAULT_OPERATOR_v1_DESIGN.md",
    "docs/adr/024-read-only-operator-inspection-export.md",
    "contracts/operator/inspection-export-v1.schema.json",
    "scripts/check-operator-design.py",
    "tests/fixtures/backend/operator-export-v1.json",
    "docs/JOINED_MOCK_GENERATIONS_v1_DESIGN.md",
    "scripts/check-joined-mock-design.py",
    "tests/fixtures/backend/joined-mock-v1.json",
}
SCOPE = {
    "backendDesignOnly": True, "runtimePersistenceImplemented": False,
    "v2HandlersEnabled": False, "jobsImplemented": False,
    "frontendChanged": False, "productionActivated": False,
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(plan):
    require(set(plan) == {"schemaVersion", "baseline", "scope", "artifacts", "slices", "acceptance"}, "plan fields")
    require(type(plan["schemaVersion"]) is int and plan["schemaVersion"] == 1, "plan version")
    require(plan["baseline"] == "d58ab4a", "design baseline")
    require(plan["scope"] == SCOPE and all(type(v) is bool for v in plan["scope"].values()), "scope claims")
    require(isinstance(plan["artifacts"], list), "artifact list")
    paths = set()
    for item in plan["artifacts"]:
        require(set(item) == {"path", "sha256"}, "artifact fields")
        name = item["path"]
        require(isinstance(name, str) and name and "\\" not in name and ":" not in name, "artifact path")
        parts = PurePosixPath(name)
        require(not parts.is_absolute() and all(p not in {".", ".."} for p in name.split("/")), "artifact traversal")
        target = (ROOT / name).resolve()
        require(target.is_relative_to(ROOT) and target.is_file(), "artifact missing or escaped")
        require(name not in paths, "duplicate artifact")
        paths.add(name)
        require(isinstance(item["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", item["sha256"]), "hash format")
        require(hashlib.sha256(target.read_bytes()).hexdigest() == item["sha256"], "artifact hash: " + name)
    require(paths == ARTIFACTS, "artifact coverage")
    require(isinstance(plan["slices"], list), "slice list")
    graph = {}
    for item in plan["slices"]:
        require(set(item) == {"id", "dependsOn", "state"}, "slice fields")
        require(item["id"] in DEPENDENCIES and item["id"] not in graph, "slice identity")
        require(item["state"] == "not_implemented", "implementation claim")
        require(isinstance(item["dependsOn"], list) and all(isinstance(d, str) for d in item["dependsOn"]), "dependencies")
        require(len(set(item["dependsOn"])) == len(item["dependsOn"]), "duplicate dependency")
        graph[item["id"]] = item["dependsOn"]
    require(set(graph) == set(DEPENDENCIES), "slice coverage")
    visiting, visited = set(), set()

    def visit(node):
        require(node in graph, "unknown dependency")
        require(node not in visiting, "dependency cycle")
        if node in visited:
            return
        visiting.add(node)
        for dependency in graph[node]:
            visit(dependency)
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)
    require(graph == DEPENDENCIES, "dependency plan differs from reviewed sequence")
    require(plan["acceptance"] == [{"id": f"O{i:02d}", "state": "not_accepted"} for i in range(1, 15)], "acceptance claims")


def check_changed_scope(baseline):
    # Source-diff evidence only: this does not inspect a live Activity data tree.
    result = subprocess.check_output(["git", "diff", "--name-only", baseline, "--"], cwd=ROOT, text=True)
    untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, text=True)
    names = set(result.splitlines() + untracked.splitlines())
    allowed_exact = {"AGENTS.md", "README.md"} | {p for p in ARTIFACTS if p.startswith("contracts/")}
    for name in names:
        require(name in allowed_exact or name.startswith("docs/") or name in {
            "scripts/check-invocation-design.py", "scripts/check-command-design.py",
            "scripts/check-backend-readiness.py", "tests/fixtures/invocation/bindings-v1.json",
            "tests/fixtures/backend/command-v2.json",
            "scripts/check-read-results-design.py", "tests/fixtures/backend/read-results-v2.json",
            "scripts/check-command-digests-design.py", "tests/fixtures/backend/command-digests-v2.json",
            "scripts/check-orchestration-traces-design.py", "tests/fixtures/backend/orchestration-traces-v1.json",
            "scripts/check-storage-bytes-design.py", "tests/fixtures/backend/storage-bytes-v1.json",
            "scripts/check-disposable-lifecycle-design.py", "tests/fixtures/backend/disposable-lifecycle-v1.json",
            "scripts/design/canonical-history-v1.rs", "scripts/check-canonical-history-design.py",
            "tests/fixtures/backend/canonical-history-v1.json",
            "scripts/check-model-storage-design.py", "tests/fixtures/backend/model-storage-v1.json",
            "scripts/design/mock-continuity-v1.rs", "scripts/check-mock-continuity-design.py",
            "tests/fixtures/backend/mock-continuity-v1.json", "tests/fixtures/backend/mock-continuity-bytes-v1.json",
            "scripts/check-operator-design.py", "tests/fixtures/backend/operator-export-v1.json",
            "scripts/check-joined-mock-design.py", "tests/fixtures/backend/joined-mock-v1.json",
        }, "non-design change: " + name)
    return len(names)


def negative_checks(plan):
    cases = []
    def case(label, change):
        value = deepcopy(plan)
        change(value)
        cases.append((label, value))
    case("wrong hash", lambda p: p["artifacts"][0].update(sha256="0" * 64))
    case("missing artifact", lambda p: p["artifacts"][0].update(path="docs/not-present-readiness.md"))
    case("traversal", lambda p: p["artifacts"][0].update(path="../outside.md"))
    case("duplicate artifact", lambda p: p["artifacts"].append(deepcopy(p["artifacts"][0])))
    case("missing coverage", lambda p: p["artifacts"].pop())
    case("duplicate slice", lambda p: p["slices"].append(deepcopy(p["slices"][0])))
    case("unknown dependency", lambda p: p["slices"][0].update(dependsOn=["P99"]))
    case("cycle", lambda p: p["slices"][0].update(dependsOn=["P10"]))
    case("wrong dependency order", lambda p: p["slices"][1].update(dependsOn=[]))
    case("claimed implementation", lambda p: p["slices"][0].update(state="implemented"))
    case("claimed acceptance", lambda p: p["acceptance"][0].update(state="accepted"))
    case("claimed activation", lambda p: p["scope"].update(productionActivated=True))
    case("numeric boolean", lambda p: p["scope"].update(frontendChanged=0))
    case("unknown field", lambda p: p.update(handlersEnabled=True))
    for label, value in cases:
        try:
            validate(value)
        except ValueError:
            continue
        raise ValueError("negative not refused: " + label)
    return len(cases)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    validate(plan)
    changed = check_changed_scope(plan["baseline"])
    negatives = negative_checks(plan) if args.self_test else 0
    print(f"PASS DESIGN integrity: {len(ARTIFACTS)} hashes; 10 planned slices; 14 unaccepted boundaries; {changed} design-only changed paths; {negatives} negative checks")
    print("NOT VERIFIED: semantic storage DTOs, Windows ports, persistence, handlers, workers, live Activity bytes, frontend or production")
