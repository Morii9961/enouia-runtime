"""Symbolic SELECTED history oracle; no Vault, provider, process or job runner."""
from copy import deepcopy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests/fixtures/backend/orchestration-traces-v1.json"
SUBMISSIONS = {"send_mock_turn", "continue_user_turn", "resume_invocation"}
ACTIVE = {"accepted", "running"}
INV_ACTIVE = {"prepared", "dispatching", "cancel_requested"}
INV_EDGES = {tuple(e) for e in json.loads((ROOT / "tests/fixtures/invocation/bindings-v1.json").read_text(encoding="utf-8"))["legal_edges"]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def initial():
    return {"generation": 0, "selection": "known", "writesBlocked": False, "ownerAbsent": False,
            "identityVersion": 0, "sessionEvents": [], "inputSources": [], "assistantSources": [],
            "responses": [], "checkpoints": [], "operations": {}, "invocations": {}}


def busy(state):
    return any(o["kind"] in SUBMISSIONS and o["status"] in ACTIVE for o in state["operations"].values()) or any(i["status"] in INV_ACTIVE for i in state["invocations"].values())


def receipt(state, alias, kind, action, input_alias=None, input_generation=None, invocation=None):
    require(alias not in state["operations"], "operation alias collision")
    state["operations"][alias] = {"kind": kind, "token": action["token"], "digest": action["digest"],
        "status": "accepted" if kind in SUBMISSIONS else "completed", "input": input_alias,
        "inputGeneration": input_generation, "invocation": invocation, "committedGeneration": 0}


def lookup(state, action):
    match = next((o for o in state["operations"].values() if o["token"] == action["token"]), None)
    if match is None:
        return None
    if match["digest"] != action["digest"]:
        return "request_conflict"
    return "replay_completed" if match["status"] == "completed" else "observe_live" if match["status"] in ACTIVE else "observe_terminal"


def owner(state, invocation):
    owners = [o for o in state["operations"].values() if o["kind"] in SUBMISSIONS and o["status"] in ACTIVE and o["invocation"] == invocation]
    require(len(owners) == 1, "one active owning receipt")
    return owners[0]


def perform(state, action):
    kind = action["action"]
    if state["selection"] == "unknown":
        return "commit_unknown"
    if state["writesBlocked"]:
        return "recovery_blocked"
    if kind in {"submit", "continue", "resume", "cancel", "cancel_invocation", "checkpoint"}:
        observed = lookup(state, action)
        if observed is not None:
            return observed  # Retry lookup precedes stale-parent validation.
        if action["expectedGeneration"] != state["generation"]:
            return "stale_generation"
    if kind in {"submit", "continue"}:
        if busy(state):
            return "session_busy"
        input_alias = action["input"]
        if kind == "submit":
            require(input_alias not in state["inputSources"], "new input collision")
            state["sessionEvents"].append("user:" + input_alias)
            state["inputSources"].append(input_alias)
            input_generation = state["generation"] + 1
        else:
            require(state["sessionEvents"] and state["sessionEvents"][-1] == "user:" + input_alias, "retained latest user turn")
            input_generation = state["generation"] + 1  # New acceptance bundle, same original input.
        receipt(state, action["operation"], "send_mock_turn" if kind == "submit" else "continue_user_turn", action, input_alias, input_generation)
        return "input_accepted" if kind == "submit" else "retained_input_accepted"
    if kind == "prepare":
        operation = state["operations"][action["operation"]]
        require(operation["status"] == "accepted" and operation["invocation"] is None, "accepted preparation gap")
        require(action["invocation"] not in state["invocations"], "invocation collision")
        require(state["sessionEvents"][-1] == "user:" + operation["input"], "prepared Session prefix")
        state["invocations"][action["invocation"]] = {"status": "prepared", "input": operation["input"],
            "inputGeneration": operation["inputGeneration"], "identityVersion": state["identityVersion"],
            "capsuleToken": action["capsule"], "calls": 0}
        operation["invocation"] = action["invocation"]; operation["status"] = "running"
        return "prepared"
    if kind == "dispatch":
        invocation = state["invocations"][action["invocation"]]
        if invocation["status"] != "prepared":
            return "invalid_transition"
        operation = owner(state, action["invocation"])
        if invocation["identityVersion"] != state["identityVersion"]:
            invocation["status"] = "stale"; operation["status"] = "failed"
            return "stale_identity"
        invocation["status"] = "dispatching"
        return "dispatch_intent_saved"
    if kind == "call":
        invocation = state["invocations"][action["invocation"]]
        require(invocation["status"] == "dispatching" and invocation["calls"] == 0 and not state["ownerAbsent"], "recorded intent and live owner")
        owner(state, action["invocation"])
        invocation["calls"] = 1
        return "symbolic_provider_call"
    if kind in {"complete", "provider_refused", "confirm_cancel"}:
        alias = action["invocation"]; invocation = state["invocations"][alias]
        if kind == "complete" and invocation["status"] != "dispatching":
            return "late_result_ignored"
        operation = owner(state, alias)
        if kind == "confirm_cancel":
            require(invocation["status"] == "cancel_requested", "cancel intent")
            invocation["status"] = "cancelled"; operation["status"] = "cancelled"
            return "cancelled"
        require(invocation["status"] == "dispatching" and invocation["calls"] == 1, "symbolic dispatched response")
        if kind == "provider_refused":
            invocation["status"] = "failed"; operation["status"] = "failed"
            return "provider_refused"
        invocation["status"] = "completed"; operation["status"] = "completed"
        state["sessionEvents"].append("assistant:" + alias)
        state["assistantSources"].append(alias); state["responses"].append(alias)
        return "answer_committed"
    if kind == "cancel":
        target = state["operations"][action["targetOperation"]]
        invocation_alias = target["invocation"]
        receipt(state, action["operation"], "cancel_submission", action, invocation=invocation_alias)
        if target["status"] not in ACTIVE:
            return "terminal_target_observed"
        if invocation_alias is None:
            target["status"] = "cancelled"
            return "queued_input_cancelled"
        invocation = state["invocations"][invocation_alias]
        if invocation["status"] == "prepared":
            invocation["status"] = "cancelled"; target["status"] = "cancelled"
            return "prepared_cancelled"
        require(invocation["status"] in {"dispatching", "cancel_requested"}, "active cancellation")
        invocation["status"] = "cancel_requested"
        return "cancel_intent_saved"
    if kind == "cancel_invocation":
        alias = action["invocation"]; invocation = state["invocations"][alias]
        receipt(state, action["operation"], "cancel_invocation", action, invocation=alias)
        if invocation["status"] not in INV_ACTIVE:
            return "terminal_target_observed"
        if invocation["status"] == "prepared":
            invocation["status"] = "cancelled"
            for operation in state["operations"].values():
                if operation["kind"] in SUBMISSIONS and operation["status"] in ACTIVE and operation["invocation"] == alias:
                    operation["status"] = "cancelled"
            return "prepared_cancelled"
        owner(state, alias)
        invocation["status"] = "cancel_requested"
        return "cancel_intent_saved"
    if kind == "compile_refused":
        operation = state["operations"][action["operation"]]
        require(operation["status"] == "accepted" and operation["invocation"] is None, "compile before preparation")
        operation["status"] = "failed"
        return "compile_refused_input_retained"
    if kind == "owner_excluded":
        state["ownerAbsent"] = True
        return "symbolic_owner_exclusion"
    if kind == "restart":
        if not state["ownerAbsent"]:
            return "owner_live"
        for operation in state["operations"].values():
            if operation["kind"] in SUBMISSIONS and operation["status"] in ACTIVE:
                operation["status"] = "interrupted"
        for invocation in state["invocations"].values():
            if invocation["status"] in {"dispatching", "cancel_requested"}:
                invocation["status"] = "interrupted"
        state["ownerAbsent"] = False
        return "recovery_observed_no_automatic_call"
    if kind == "resume":
        alias = action["invocation"]; invocation = state["invocations"][alias]
        if invocation["status"] != "prepared":
            return "resume_requires_prepared"
        if any(o["kind"] in SUBMISSIONS and o["status"] in ACTIVE for o in state["operations"].values()):
            return "session_busy"
        if invocation["identityVersion"] != state["identityVersion"]:
            return "stale_identity"
        receipt(state, action["operation"], "resume_invocation", action, invocation["input"], invocation["inputGeneration"], alias)
        state["operations"][action["operation"]]["status"] = "running"
        return "prepared_explicitly_resumed"
    if kind == "checkpoint":
        if busy(state):
            return "session_busy"
        covered = action["covered"]
        require(covered and all(e in state["sessionEvents"] for e in covered), "explicit retained range")
        positions = [state["sessionEvents"].index(e) for e in covered]
        require(positions == sorted(positions) and len(set(positions)) == len(positions), "ordered covered events")
        receipt(state, action["operation"], "create_checkpoint", action)
        require(action["checkpoint"] not in state["checkpoints"], "checkpoint collision")
        state["checkpoints"].append(action["checkpoint"]); state["sessionEvents"].append("checkpoint:" + action["checkpoint"])
        return "explicit_checkpoint_committed"
    if kind == "mutate_same_session":
        return "session_busy" if busy(state) else "outside_selected_trace_scope"
    if kind == "transient_cancel_mock":
        return "not_supported_use_canonical_control"
    if kind == "unrelated_memory":
        return "unrelated_commit"
    if kind == "identity_change":
        state["identityVersion"] += 1
        return "identity_commit"
    if kind == "unknown_completion":
        invocation = state["invocations"][action["invocation"]]
        require(invocation["status"] == "dispatching" and invocation["calls"] == 1, "unknown attempted completion")
        state["selection"] = "unknown"; state["writesBlocked"] = True
        return "commit_unknown"
    raise ValueError("unknown trace action")


def invariants(before, state):
    for field in ("sessionEvents", "inputSources", "assistantSources", "responses", "checkpoints"):
        require(state[field][:len(before[field])] == before[field] and len(state[field]) == len(set(state[field])), "retained prefix/identity: " + field)
    require([e.split(":", 1)[1] for e in state["sessionEvents"] if e.startswith("user:")] == state["inputSources"], "input/source atomics")
    require([e.split(":", 1)[1] for e in state["sessionEvents"] if e.startswith("assistant:")] == state["assistantSources"] == state["responses"], "assistant/source/response atomics")
    require([e.split(":", 1)[1] for e in state["sessionEvents"] if e.startswith("checkpoint:")] == state["checkpoints"], "explicit checkpoint event")
    for alias, invocation in state["invocations"].items():
        require(invocation["input"] in state["inputSources"] and invocation["inputGeneration"] <= state["generation"], "retained invocation input")
        require(invocation["calls"] in {0, 1}, "one symbolic call per attempt")
        require((invocation["status"] == "completed") == (alias in state["responses"]), "completed response equivalence")
        previous = before["invocations"].get(alias)
        if previous:
            for field in ("input", "inputGeneration", "identityVersion", "capsuleToken"):
                require(previous[field] == invocation[field], "frozen invocation input")
            if previous["status"] != invocation["status"]:
                require((previous["status"], invocation["status"]) in INV_EDGES, "legal ledger transition")
        owners = [o for o in state["operations"].values() if o["kind"] in SUBMISSIONS and o["status"] in ACTIVE and o["invocation"] == alias]
        require(len(owners) <= 1 and (invocation["status"] in INV_ACTIVE or not owners), "canonical active ownership")
    require(len({o["token"] for o in state["operations"].values()}) == len(state["operations"]), "retry-key uniqueness")
    for alias, operation in state["operations"].items():
        require(0 < operation["committedGeneration"] <= state["generation"], "receipt last-changed generation")
        previous = before["operations"].get(alias)
        if previous:
            for field in ("kind", "token", "digest", "input", "inputGeneration"):
                require(previous[field] == operation[field], "retained receipt intent")
            if previous["status"] not in ACTIVE:
                require(previous == operation, "terminal receipt never reopens")
        if operation["kind"] in SUBMISSIONS:
            require(operation["input"] in state["inputSources"], "submission source retained")
            if operation["status"] == "completed":
                require(operation["invocation"] in state["responses"], "submission completion result")


def step(state, action):
    before = deepcopy(state)
    proposed = deepcopy(state)
    reply = perform(proposed, action)
    canonical_fields = ("sessionEvents", "inputSources", "assistantSources", "responses", "checkpoints", "operations", "invocations", "identityVersion")
    changed = any(proposed[k] != before[k] for k in canonical_fields)
    # Symbolic calls and OS-owner observations are not canonical mutations.
    if action["action"] in {"call", "owner_excluded"}:
        changed = False
    if action["action"] == "unrelated_memory" and reply == "unrelated_commit":
        changed = True
    if changed:
        proposed["generation"] += 1
        for alias, operation in proposed["operations"].items():
            if operation != before["operations"].get(alias):
                operation["committedGeneration"] = proposed["generation"]
    invariants(before, proposed)
    state.clear(); state.update(proposed)
    return reply


def summarize(state):
    return {"generation": state["generation"], "selection": state["selection"], "writesBlocked": state["writesBlocked"],
        "events": state["sessionEvents"], "inputs": len(state["inputSources"]), "answers": len(state["responses"]), "checkpoints": len(state["checkpoints"]),
        "operationStates": {k: o["status"] for k, o in state["operations"].items()},
        "receiptGenerations": {k: o["committedGeneration"] for k, o in state["operations"].items()},
        "invocationStates": {k: i["status"] for k, i in state["invocations"].items()},
        "inputGenerations": {k: i["inputGeneration"] for k, i in state["invocations"].items()},
        "symbolicCalls": {k: i["calls"] for k, i in state["invocations"].items()}}


def verify(trace):
    state = initial()
    for item in trace["steps"]:
        reply = step(state, item["action"])
        require(reply == item["reply"] and summarize(state) == item["expected"], trace["id"] + " frozen observation")
    return len(trace["steps"])


if __name__ == "__main__":
    expected_edges = {("prepared", s) for s in ("dispatching", "cancelled", "failed", "stale")} | {("dispatching", s) for s in ("completed", "cancel_requested", "failed", "stale", "interrupted")} | {("cancel_requested", s) for s in ("cancelled", "interrupted")}
    require(INV_EDGES == expected_edges, "reviewed eleven-edge ledger policy")
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    require(len({t["id"] for t in fixture["traces"]}) == len(fixture["traces"]), "unique history IDs")
    observations = sum(verify(trace) for trace in fixture["traces"])
    negatives = 0
    for trace in fixture["traces"]:
        altered = deepcopy(trace); altered["steps"][-1]["expected"]["answers"] += 1
        try:
            verify(altered)
        except ValueError:
            negatives += 1
        else:
            raise ValueError("false completion observation accepted")
    prepared = initial()
    for item in fixture["traces"][0]["steps"][:2]:
        step(prepared, item["action"])
    saved = deepcopy(prepared)
    try:
        step(prepared, {"action": "call", "invocation": "inv1"})
    except ValueError:
        require(prepared == saved, "refused symbolic step is intact")
    else:
        raise ValueError("unprepared call accepted")
    completed = initial()
    for item in fixture["traces"][0]["steps"][:5]:
        step(completed, item["action"])
    corruptions = []
    value = deepcopy(completed); value["assistantSources"].clear(); corruptions.append((initial(), value))
    value = deepcopy(completed); value["operations"]["op1"]["status"] = "running"; corruptions.append((completed, value))
    value = deepcopy(completed); value["invocations"]["inv1"]["status"] = "dispatching"; corruptions.append((completed, value))
    value = deepcopy(saved); value["invocations"]["inv1"]["capsuleToken"] = "different"; corruptions.append((saved, value))
    value = deepcopy(completed); value["sessionEvents"].pop(0); corruptions.append((completed, value))
    for before, value in corruptions:
        try:
            invariants(before, value)
        except ValueError:
            continue
        raise ValueError("corrupt symbolic invariant accepted")
    print(f"PASS SYMBOLIC DESIGN: {len(fixture['traces'])} histories; {observations} frozen observations; {negatives} false-completion negative fixtures; {len(corruptions)} invariant corruptions; 1 refused-call intactness check")
    print("NOT VERIFIED: real Session/source bytes, manifest selection, provider calls, OS ownership, actual processes, handlers, jobs or restart durability")
