//! The pinned Memory Core as Runtime's Memory surfaces use it (ADR-025).
//!
//! Workspace IPC v1 constrains requests and the command-to-kind pairing,
//! but not result fields. This test drives the embedded Core with the
//! envelopes `src/memory/client.ts` sends and checks every result field the
//! Memory, Sessions and Context surfaces render. A pin bump that renames or
//! drops one of them fails here before the UI shows blanks.
//!
//! The data is synthetic and lives in a temporary root that is removed
//! afterwards. No default or personal Vault is touched.

use enouia_memory_contract::workspace::{is_write, validate_response};
use enouia_memory_workspace::{Config, PickKind, Workspace};
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

struct Page {
    ws: Workspace,
    base: PathBuf,
    n: AtomicU64,
}

impl Drop for Page {
    fn drop(&mut self) {
        self.ws.shutdown();
        let _ = std::fs::remove_dir_all(&self.base);
    }
}

impl Page {
    /// A fresh synthetic Vault created through the picker-token path.
    fn new(name: &str) -> Self {
        let tmp = std::env::temp_dir().join("enouia-runtime-memory-tests");
        std::fs::create_dir_all(&tmp).unwrap();
        let tmp = std::fs::canonicalize(&tmp).unwrap();
        let tmp = PathBuf::from(tmp.to_string_lossy().trim_start_matches(r"\\?\"));
        let base = tmp.join(format!("{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("vault")).unwrap();
        let page = Self {
            ws: Workspace::new(Config::default()),
            base,
            n: AtomicU64::new(1),
        };
        let token = page.pick(PickKind::VaultRoot, "vault");
        let status = page.ok(
            "vault_create",
            json!({"rootToken": token, "confirmPhrase": "create new vault"}),
        );
        assert_eq!(status["vault"]["state"], "open");
        page
    }

    fn pick(&self, kind: PickKind, relative: &str) -> String {
        let picked = self
            .ws
            .register_pick(kind, &self.base.join(relative))
            .unwrap();
        assert!(
            !picked.display_name.contains('\\'),
            "a pick names a base name only"
        );
        picked.token
    }

    /// One request exactly as the page client builds it.
    fn send(&self, command: &str, arguments: Value) -> Value {
        let n = self.n.fetch_add(1, Ordering::SeqCst);
        let request = json!({
            "schemaVersion": 1,
            "requestId": format!("req_00000000-0000-4000-8000-{n:012x}"),
            "command": command,
            "idempotencyKey": is_write(command).then(|| format!("ui-runtime-test-{n:016}")),
            "arguments": arguments,
        });
        let response = self.ws.call(&request);
        validate_response(command, &response)
            .unwrap_or_else(|e| panic!("{command}: {e}: {response}"));
        let root = self.base.to_string_lossy().replace('\\', "\\\\");
        assert!(
            !response.to_string().contains(&root),
            "{command} leaked a path"
        );
        response
    }

    fn ok(&self, command: &str, arguments: Value) -> Value {
        let response = self.send(command, arguments);
        assert_eq!(response["error"], Value::Null, "{command}: {response}");
        response["result"].clone()
    }

    fn err(&self, command: &str, arguments: Value) -> Value {
        let response = self.send(command, arguments);
        assert_eq!(response["kind"], "memory_error", "{command}: {response}");
        response["error"].clone()
    }

    /// Poll an operation as the page does until it leaves queued/running.
    fn finish(&self, started: &Value) -> Value {
        let id = started["operationId"].as_str().unwrap().to_owned();
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            let status = self.ok("operation_get", json!({"operationId": id}));
            for field in ["operationId", "kind", "state", "cancelRequested"] {
                assert!(status.get(field).is_some(), "operation_get.{field}");
            }
            assert!(status["progress"]["done"].is_number());
            let state = status["state"].as_str().unwrap();
            if state != "queued" && state != "running" {
                return status;
            }
            assert!(Instant::now() < deadline, "operation did not finish");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    /// Plan one decision and confirm the exact diff, as the plan dialog does.
    fn decide(&self, candidate: &Value, action: &str, edited: Option<&str>) -> Value {
        let plan = self.ok(
            "review_plan",
            json!({"decisions": [{
                "candidateId": candidate["candidateId"], "revision": candidate["revision"],
                "action": action, "editedContent": edited, "mergeTarget": null,
            }]}),
        );
        for field in [
            "planId",
            "diffHash",
            "expiresAt",
            "operationKind",
            "records",
        ] {
            assert!(plan.get(field).is_some(), "review_plan.{field}");
        }
        assert_eq!(plan["confirmCode"].as_str().unwrap().len(), 8);
        assert_eq!(plan["purge"], false);
        let done = self.ok(
            "review_confirm",
            json!({"planId": plan["planId"], "diffHash": plan["diffHash"]}),
        );
        assert!(done["commitId"].is_string());
        done
    }
}

fn strings(value: &Value, fields: &[&str], what: &str) {
    for field in fields {
        assert!(value[*field].is_string(), "{what}.{field}: {value}");
    }
}

#[test]
fn status_and_vault_lifecycle_fields_the_surfaces_render() {
    let page = Page::new("status");
    let status = page.ok("workspace_status", json!({}));
    let vault = &status["vault"];
    strings(
        vault,
        &["state", "rootName", "health", "lastCommitAt"],
        "vault",
    );
    assert!(vault["headSequence"].is_number());
    assert!(vault.get("freeBytes").is_some() && vault.get("ownerOnlyAcl").is_some());
    let components = status["components"].as_array().unwrap();
    for c in components {
        strings(c, &["component", "state"], "component");
        // The Vault row reports its error code; every other row its mode.
        if c["component"] == "vault" {
            assert!(c.get("errorCode").is_some(), "vault.errorCode: {c}");
        } else {
            strings(c, &["mode"], "component");
        }
    }
    let names: Vec<&str> = components
        .iter()
        .map(|c| c["component"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"activity"), "the host replaces this row");
    assert_eq!(status["pendingCandidates"], 0);
    assert!(status["operationsRunning"].is_number());
    assert!(status["companion"].is_object());

    let locked = page.ok("vault_lock", json!({}));
    assert_eq!(locked["vault"]["state"], "locked");
    assert!(locked["vault"]["rootName"].is_string());
    let refused = page.err(
        "memory_list",
        json!({"includeInactive": false, "cursor": null, "limit": 25}),
    );
    assert_eq!(refused["code"], "vault_locked");
    assert_eq!(refused["retryable"], true);
    let open = page.ok("vault_unlock", json!({}));
    assert_eq!(open["vault"]["state"], "open");

    // The page can only name tokens, never a path.
    let path = page.base.join("vault").to_string_lossy().into_owned();
    let error = page.err("vault_open", json!({"rootToken": path}));
    assert_eq!(error["code"], "invalid_request");
    assert!(
        error["rules"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r == "workspace.token")
    );
}

#[test]
fn review_explorer_and_source_fields_the_memory_surface_renders() {
    let page = Page::new("memory");
    let proposed = page.ok(
        "remember",
        json!({"text": "Synthetic owner: prefers paper notebooks for sketching.", "claimKey": "preference.sketching"}),
    );
    strings(&proposed, &["candidateId", "state", "sourceId"], "remember");
    assert_eq!(proposed["state"], "pending");

    let page_of = page.ok("candidate_list", json!({"cursor": null, "limit": 50}));
    assert_eq!(page_of["total"], 1);
    let candidate = &page_of["items"][0];
    strings(
        candidate,
        &[
            "candidateId",
            "content",
            "proposalKind",
            "proposedType",
            "sensitivity",
            "originKind",
            "createdAt",
        ],
        "candidate",
    );
    assert!(candidate["revision"].is_number());
    strings(
        &candidate["evidence"][0],
        &["sourceId"],
        "candidate.evidence",
    );
    assert!(candidate["evidence"][0]["sourceRevision"].is_number());
    assert!(candidate["conflicts"].is_array() && candidate["target"].is_null());

    page.decide(
        candidate,
        "edit_accept",
        Some("Synthetic owner prefers paper notebooks for sketching."),
    );
    assert_eq!(
        page.ok("workspace_status", json!({}))["pendingCandidates"],
        0
    );

    let list = page.ok(
        "memory_list",
        json!({"includeInactive": false, "cursor": null, "limit": 25}),
    );
    assert_eq!(list["total"], 1);
    assert!(list["nextCursor"].is_null());
    let row = &list["items"][0];
    strings(
        row,
        &["memoryId", "type", "status", "snippet", "updatedAt"],
        "memory_row",
    );
    assert_eq!(
        row["snippet"],
        "Synthetic owner prefers paper notebooks for sketching."
    );
    for flag in ["expired", "conflicted", "sourceMissing"] {
        assert_eq!(row[flag], false, "{flag}");
    }
    let memory_id = row["memoryId"].as_str().unwrap().to_owned();

    let detail = page.ok("memory_read", json!({"memoryId": memory_id}));
    let record = &detail["record"];
    strings(record, &["memory_id", "content", "approved_at"], "record");
    assert!(record["revision"].is_number() && record["supersedes"].is_array());
    strings(&detail["summary"], &["type", "status"], "summary");
    assert!(detail["supersededBy"].is_array());
    let evidence = &detail["evidence"][0];
    strings(evidence, &["sourceId", "supports"], "evidence");
    assert!(evidence["sourceRevision"].is_number());
    assert_eq!(evidence["available"], true);

    let excerpt = page.ok(
        "source_excerpt",
        json!({"sourceId": evidence["sourceId"], "sourceRevision": evidence["sourceRevision"], "startByte": null, "maxBytes": 4096}),
    );
    assert!(
        excerpt["excerpt"]
            .as_str()
            .unwrap()
            .contains("paper notebooks")
    );
    strings(&excerpt, &["sourceKind", "speakerRole"], "excerpt");
    for field in ["byteStart", "byteEnd", "totalBytes"] {
        assert!(excerpt[field].is_number(), "excerpt.{field}");
    }
    assert_eq!(excerpt["untrusted"], true);

    let found = page.ok(
        "memory_search",
        json!({"query": "notebooks", "includeHistorical": false, "cursor": null, "limit": 25}),
    );
    strings(
        &found["items"][0],
        &["memoryId", "type", "snippet"],
        "search row",
    );
    assert!(found.get("nextCursor").is_some());

    // A correction is a candidate that shows the old fact, never an edit.
    let correction = page.ok(
        "correction_propose",
        json!({"memoryId": memory_id, "revision": record["revision"], "text": "Synthetic owner sketches on a tablet now."}),
    );
    assert_eq!(correction["state"], "pending");
    let pending = page.ok("candidate_list", json!({"cursor": null, "limit": 50}));
    let revise = &pending["items"][0];
    assert_eq!(
        revise["target"]["content"],
        "Synthetic owner prefers paper notebooks for sketching."
    );
    page.decide(revise, "reject", None);

    let impact = page.ok(
        "delete_preview",
        json!({"memoryId": memory_id, "withDependents": false}),
    );
    assert!(impact["targets"].is_array() && impact["objectCount"].is_number());
    assert!(impact["losingProvenance"].is_array());
    let forget = page.ok(
        "forget_plan",
        json!({"memoryId": memory_id, "mode": "forget", "withDependents": false}),
    );
    strings(
        &forget,
        &["planId", "diffHash", "confirmCode", "expiresAt"],
        "forget plan",
    );
    let discarded = page.ok("review_discard", json!({"planId": forget["planId"]}));
    assert_eq!(discarded["discarded"], true);

    let rebuild = page.send("index_rebuild", json!({}));
    assert!(rebuild["operationId"].is_string());
    assert_eq!(page.finish(&rebuild["result"])["state"], "succeeded");
    assert!(page.ok("import_list", json!({}))["items"].is_array());
    assert!(page.ok("operation_list", json!({}))["items"].is_array());
}

#[test]
fn session_and_context_fields_the_surfaces_render() {
    let page = Page::new("session");
    let proposed = page.ok(
        "remember",
        json!({"text": "Synthetic project Lantern ships its first build on Friday.", "claimKey": "project.lantern"}),
    );
    let pending = page.ok("candidate_list", json!({"cursor": null, "limit": 50}));
    assert_eq!(pending["items"][0]["candidateId"], proposed["candidateId"]);
    page.decide(&pending["items"][0], "accept", None);

    let created = page.ok("session_new", json!({}));
    strings(&created, &["sessionId", "branchId"], "session_new");
    let branch = json!({"sessionId": created["sessionId"], "branchId": created["branchId"]});

    let answer = page.ok(
        "session_ask",
        json!({"sessionId": created["sessionId"], "branchId": created["branchId"], "text": "When does Lantern ship?"}),
    );
    strings(&answer, &["status", "capsuleId"], "session_ask");
    assert!(answer["statements"].is_array() && answer["sources"].is_array());
    for source in answer["sources"].as_array().unwrap() {
        assert!(source["source_id"].is_string(), "sources[].source_id");
    }

    let detail = page.ok("session_detail", branch.clone());
    assert!(detail.get("lastSavedEventId").is_some());
    let transcript = detail["transcript"].as_array().unwrap();
    assert!(!transcript.is_empty());
    for event in transcript {
        strings(event, &["eventId", "kind", "deliveryState"], "transcript");
        assert!(event.get("text").is_some());
    }
    assert!(detail["turns"].is_array() && detail["checkpoints"].is_array());

    let checkpoint = page.ok(
        "session_checkpoint",
        json!({"sessionId": created["sessionId"], "branchId": created["branchId"], "summary": "Asked about the Lantern release."}),
    );
    assert!(checkpoint["checkpointId"].is_string());
    let after = page.ok("session_detail", branch);
    for c in after["checkpoints"].as_array().unwrap() {
        strings(c, &["checkpoint_id", "status"], "checkpoint");
    }

    let sessions = page.ok("session_list", json!({}));
    let listed = &sessions["items"][0];
    strings(listed, &["sessionId", "updatedAt"], "session row");
    let branches = listed["branches"].as_array().unwrap();
    strings(&branches[0], &["branchId"], "branch");
    assert!(branches[0]["lastEventSeq"].is_number());

    let inspected = page.ok("context_inspect", json!({"capsuleId": answer["capsuleId"]}));
    assert!(["preview_not_sent", "dispatched"].contains(&inspected["delivery"].as_str().unwrap()));
    assert!(inspected["capsule"]["destination"]["kind"].is_string());
    assert!(inspected["capsule"]["budget"].is_object());
    assert_eq!(inspected["capsule"]["query"], "When does Lantern ship?");
    for d in inspected["inspection"]["decisions"].as_array().unwrap() {
        strings(
            d,
            &["record_kind", "record_id", "decision", "reason"],
            "decision",
        );
        assert!(d.get("revision").is_some() && d.get("source_reachable").is_some());
    }
    let dispatches = inspected["dispatches"].as_array().unwrap();
    assert!(
        !dispatches.is_empty(),
        "an answered turn records its dispatch"
    );
    strings(
        &dispatches[0],
        &["dispatchId", "state", "preparedAt"],
        "dispatch",
    );
    let request = page.ok(
        "dispatch_inspect",
        json!({"dispatchId": dispatches[0]["dispatchId"]}),
    );
    assert!(request["verified"].is_boolean() && request["tools"].is_number());
    assert!(request["destination"]["kind"].is_string());
    for m in request["messages"].as_array().unwrap() {
        strings(m, &["role", "text"], "message");
    }

    let preview = page.ok(
        "context_preview",
        json!({"query": "Lantern", "sessionId": null, "branchId": null}),
    );
    assert!(preview["capsuleId"].is_string());
    let previewed = page.ok(
        "context_inspect",
        json!({"capsuleId": preview["capsuleId"]}),
    );
    assert_eq!(previewed["delivery"], "preview_not_sent");
    assert_eq!(previewed["capsule"]["query"], "Lantern");
}
