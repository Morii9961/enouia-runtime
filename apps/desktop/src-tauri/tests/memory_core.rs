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

    /// Release the embedded Core and reopen only this test's existing Vault.
    fn reopen(&mut self) {
        self.ws.shutdown();
        self.ws = Workspace::new(Config::default());
        let token = self.pick(PickKind::VaultRoot, "vault");
        let status = self.ok("vault_open", json!({"rootToken": token}));
        assert_eq!(status["vault"]["state"], "open");
    }

    /// One request exactly as the page client builds it.
    fn send(&self, command: &str, arguments: Value) -> Value {
        self.send_keyed(command, arguments, None)
    }

    fn send_keyed(&self, command: &str, arguments: Value, key: Option<&str>) -> Value {
        let n = self.n.fetch_add(1, Ordering::SeqCst);
        let request = json!({
            "schemaVersion": 1,
            "requestId": format!("req_00000000-0000-4000-8000-{n:012x}"),
            "command": command,
            "idempotencyKey": is_write(command).then(|| key.map(str::to_owned).unwrap_or_else(|| format!("ui-runtime-test-{n:016}"))),
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
            assert_eq!(status["operationId"], id);
            assert!(status["kind"].as_str().is_some_and(|kind| !kind.is_empty()));
            if let Some(kind) = started["kind"].as_str() {
                assert_eq!(status["kind"], kind);
            }
            assert!(status["cancelRequested"].is_boolean());
            assert!(status["progress"]["done"].as_u64().is_some());
            assert!(
                status["progress"]["total"].is_null()
                    || status["progress"]["total"].as_u64().is_some()
            );
            let state = status["state"].as_str().unwrap();
            assert!(["queued", "running", "succeeded", "failed", "cancelled"].contains(&state));
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
fn provider_suggestion_fields_follow_saved_cursor_and_current_review() {
    use enouia_memory_contract::MemoryError;
    use enouia_memory_contract::foundation::Cancellation;
    use enouia_memory_contract::json::SchemaVersion;
    use enouia_memory_contract::ports::{SecretBytes, SecretStore};
    use enouia_memory_contract::provider::{Capability, ProviderCapabilities, TokenCounting};
    use enouia_memory_contract::time::Timestamp;
    use enouia_memory_provider::client::Limits;
    use enouia_memory_provider::codec::{Api, WireRequest};
    use enouia_memory_provider::transport::Transport;
    use enouia_memory_provider::vault::Quota;
    use enouia_memory_workspace::{NativeDestination, NativeProvider};
    use std::sync::Arc;

    struct Secrets;
    impl SecretStore for Secrets {
        fn read(&self, _: &str) -> Result<SecretBytes, MemoryError> {
            Ok(SecretBytes::new(b"synthetic-secret".to_vec()))
        }
    }
    struct Reply(AtomicU64);
    impl Transport for Reply {
        fn exchange(
            &self,
            request: &WireRequest,
            _: &SecretBytes,
            _: &dyn Cancellation,
            _: Duration,
            sink: &mut dyn FnMut(&[u8]) -> Result<(), MemoryError>,
        ) -> Result<(), MemoryError> {
            self.0.fetch_add(1, Ordering::SeqCst);
            assert_eq!(request.binding().provider.as_str(), "anthropic");
            let text = json!({"candidates": [
                {"kind":"fact", "content":"Synthetic Monday meeting", "quote":"Monday meeting", "source_index":0, "claim_key":"synthetic_monday"},
                {"kind":"fact", "content":"Synthetic Friday review", "quote":"Friday review", "source_index":0, "claim_key":"synthetic_friday"}
            ]}).to_string();
            let response = json!({"type":"message", "role":"assistant",
                "content":[{"type":"text", "text":text}], "stop_reason":"end_turn",
                "usage":{"input_tokens":90, "output_tokens":6}});
            for chunk in serde_json::to_vec(&response).unwrap().chunks(19) {
                sink(chunk)?;
            }
            Ok(())
        }
    }

    let mut page = Page::new("provider-suggestion-fields");
    let verified_at: Timestamp = serde_json::from_value(
        page.ok("workspace_status", json!({}))["vault"]["lastCommitAt"].clone(),
    )
    .unwrap();
    let destination = |api: Api| NativeDestination {
        api,
        capabilities: ProviderCapabilities {
            schema_version: SchemaVersion,
            binding: api.binding("synthetic-model").unwrap(),
            text_input: Capability::Supported,
            image_input: Capability::Unsupported,
            streaming: Capability::Unsupported,
            tool_calling: Capability::Unsupported,
            cancellation: Capability::Supported,
            token_counting: TokenCounting::Estimated,
            context_window_tokens: Some(128_000),
            max_output_tokens: Some(4096),
            verified_at: Some(verified_at.clone()),
        },
    };
    let transport = Arc::new(Reply(AtomicU64::new(0)));
    page.ws
        .set_native_provider(Some(NativeProvider {
            transport: transport.clone(),
            secrets: Arc::new(Secrets),
            destinations: vec![
                destination(Api::OpenAiResponses),
                destination(Api::AnthropicMessages),
            ],
            quota: Quota::default(),
            limits: Limits::default(),
        }))
        .unwrap();
    let plan = page.ok(
        "egress_grant_plan",
        json!({"apis":["anthropic"], "maxSensitivity":"private", "extraction":true}),
    );
    strings(&plan, &["planId", "diffHash", "inspection"], "egress_plan");
    let confirmed = page.ok(
        "provider_confirm",
        json!({"planId":plan["planId"], "diffHash":plan["diffHash"]}),
    );
    let status = page.ok("provider_status", json!({}));
    assert_eq!(status["configured"], true);
    assert_eq!(status["destinations"].as_array().unwrap().len(), 2);
    assert!(
        status["grants"][0]["purposes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "extraction")
    );

    let statement = "Synthetic schedule: Monday meeting, Friday review.";
    let source = page.ok(
        "remember",
        json!({"text":statement, "claimKey":"synthetic.schedule"}),
    );
    let prepare_args = json!({"sourceId":source["sourceId"], "sourceRevision":1,
        "startByte":0, "endByte":statement.len(), "api":"anthropic", "policyId":confirmed["policyId"], "maxCandidates":2});
    let prepare_reply = page.send_keyed(
        "extraction_prepare",
        prepare_args.clone(),
        Some("ui-runtime-synthetic-preparation-recovery"),
    );
    assert_eq!(prepare_reply["error"], Value::Null);
    let prepared = prepare_reply["result"].clone();
    let prepare_replay = page.send_keyed(
        "extraction_prepare",
        prepare_args,
        Some("ui-runtime-synthetic-preparation-recovery"),
    );
    assert_eq!(prepare_replay["error"], Value::Null);
    for field in ["sessionId", "runId", "inputEventId"] {
        assert_eq!(prepare_replay["result"][field], prepared[field]);
    }
    let conversation = page.ok("session_new", json!({}));
    let question = "Synthetic preparation recovery question";
    let external_args = json!({"sessionId":conversation["sessionId"], "branchId":conversation["branchId"],
        "text":question, "api":"anthropic", "policyId":confirmed["policyId"], "streaming":false, "outputTokens":128});
    let external_first = page.send_keyed(
        "external_prepare",
        external_args.clone(),
        Some("ui-runtime-synthetic-question-preparation"),
    );
    assert_eq!(external_first["error"], Value::Null);
    let external_replay = page.send_keyed(
        "external_prepare",
        external_args,
        Some("ui-runtime-synthetic-question-preparation"),
    );
    assert_eq!(external_replay["error"], Value::Null);
    assert_eq!(
        external_replay["result"]["inputEventId"],
        external_first["result"]["inputEventId"]
    );
    let conversation_detail = page.ok(
        "session_detail",
        json!({"sessionId":conversation["sessionId"], "branchId":conversation["branchId"]}),
    );
    let inputs: Vec<_> = conversation_detail["transcript"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|event| event["text"] == question)
        .collect();
    assert_eq!(inputs.len(), 1);
    assert_eq!(
        inputs[0]["eventId"],
        external_first["result"]["inputEventId"]
    );
    assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    strings(
        &prepared,
        &[
            "callId",
            "wireHash",
            "body",
            "model",
            "endpoint",
            "sessionId",
            "runId",
        ],
        "extraction_prepare",
    );
    assert!(prepared["body"].as_str().unwrap().contains(statement));
    assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    let send_args = json!({"callId":prepared["callId"], "wireHash":prepared["wireHash"]});
    let start_reply = page.send_keyed(
        "external_send",
        send_args.clone(),
        Some("ui-runtime-synthetic-send-recovery"),
    );
    assert_eq!(start_reply["error"], Value::Null);
    let started = start_reply["result"].clone();
    assert_eq!(started["kind"], "external_send");
    let replay = page.send_keyed(
        "external_send",
        send_args.clone(),
        Some("ui-runtime-synthetic-send-recovery"),
    );
    assert_eq!(replay["error"], Value::Null);
    assert_eq!(replay["result"], started);
    assert_eq!(page.finish(&started)["state"], "succeeded");
    let terminal_replay = page.send_keyed(
        "external_send",
        send_args.clone(),
        Some("ui-runtime-synthetic-send-recovery"),
    );
    assert_eq!(terminal_replay["error"], Value::Null);
    assert_eq!(terminal_replay["result"], started);
    // A new UI key cannot recover the consumed prepared call. This was the
    // old fresh-button path after an admitted reply failed to reach the UI.
    assert_eq!(page.err("external_send", send_args)["code"], "not_found");
    assert_eq!(transport.0.load(Ordering::SeqCst), 1);
    let job = json!({"sessionId":prepared["sessionId"], "runId":prepared["runId"]});
    let shown = page.ok("extraction_preview", job.clone());
    assert_eq!(shown["job"]["run_id"], job["runId"]);
    assert_eq!(shown["items"].as_array().unwrap().len(), 2);
    for item in shown["items"].as_array().unwrap() {
        strings(
            item,
            &[
                "proposedType",
                "content",
                "quote",
                "selectedText",
                "application",
            ],
            "suggestion",
        );
        assert_eq!(item["selectedText"], statement);
        assert_eq!(item["application"], "awaiting_cursor");
        assert_eq!(item["candidate"], Value::Null);
    }

    // One acknowledged step, then a fresh read of the real saved cursor.
    let applied = page.ok("extraction_apply", job.clone());
    assert_eq!(applied["job"]["run_id"], job["runId"]);
    let partial = page.ok("extraction_preview", job.clone());
    assert_eq!(partial["job"]["run_id"], job["runId"]);
    assert_eq!(partial["job"]["cursor"], 1);
    let candidate = &partial["items"][0]["candidate"];
    strings(
        candidate,
        &["candidateId", "status", "content"],
        "current_candidate",
    );
    assert!(candidate["revision"].is_number());
    assert_eq!(candidate["status"], "pending");
    assert_eq!(partial["items"][1]["candidate"], Value::Null);
    // Remaining application consumes the saved response locally, even when
    // native sending is disabled. It does not need a new model request.
    page.ws.set_native_provider(None).unwrap();
    assert_eq!(page.ok("provider_status", json!({}))["configured"], false);
    let pause =
        json!({"sessionId":prepared["sessionId"], "runId":prepared["runId"], "paused":true});
    let paused = page.ok("extraction_pause", pause);
    assert_eq!(paused["job"]["state"], "paused");
    assert_eq!(paused["job"]["run_id"], job["runId"]);
    assert_eq!(
        page.ok("extraction_preview", job.clone())["job"]["cursor"],
        1
    );
    assert_eq!(
        page.err("extraction_apply", job.clone())["code"],
        "cancelled"
    );
    page.reopen();
    let paused_sessions = page.ok("session_list", json!({}));
    let paused_session = paused_sessions["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["sessionId"] == prepared["sessionId"])
        .unwrap();
    let paused_detail = page.ok(
        "session_detail",
        json!({"sessionId":paused_session["sessionId"], "branchId":paused_session["branches"][0]["branchId"]}),
    );
    let paused_job = &paused_detail["extractionJobs"][0];
    assert_eq!(paused_job["run_id"], prepared["runId"]);
    assert_eq!(paused_job["state"], "paused");
    assert_eq!(paused_job["cursor"], 1);
    assert_eq!(page.ok("provider_status", json!({}))["configured"], false);
    let paused_preview = page.ok(
        "extraction_preview",
        json!({"sessionId":paused_session["sessionId"], "runId":paused_job["run_id"]}),
    );
    assert_eq!(paused_preview["items"], partial["items"]);
    assert_eq!(paused_preview["job"]["state"], "paused");
    assert_eq!(paused_preview["job"]["cursor"], 1);
    let recovered_partial_job =
        json!({"sessionId":paused_session["sessionId"], "runId":paused_job["run_id"]});
    assert_eq!(
        page.err("extraction_apply", recovered_partial_job.clone())["code"],
        "cancelled"
    );
    assert_eq!(
        page.ok("extraction_preview", recovered_partial_job)["job"]["cursor"],
        1
    );
    let resume = json!({"sessionId":paused_session["sessionId"], "runId":paused_job["run_id"], "paused":false});
    let resumed = page.ok("extraction_pause", resume);
    assert_eq!(resumed["job"]["state"], "ready");
    assert_eq!(resumed["job"]["run_id"], job["runId"]);
    assert_eq!(
        page.ok("extraction_preview", job.clone())["job"]["cursor"],
        1
    );
    assert_eq!(transport.0.load(Ordering::SeqCst), 1);
    for _ in 0..3 {
        if page.ok("extraction_apply", job.clone())["job"]["state"] == "completed" {
            break;
        }
    }
    let complete = page.ok("extraction_preview", job.clone());
    assert_eq!(complete["job"]["state"], "completed");
    assert_eq!(
        page.ok(
            "memory_list",
            json!({"includeInactive":false, "cursor":null, "limit":25})
        )["total"],
        0
    );
    let pending = page.ok("candidate_list", json!({"cursor":null, "limit":50}));
    let target = pending["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["candidateId"] == candidate["candidateId"])
        .unwrap();
    page.decide(
        target,
        "edit_accept",
        Some("Edited synthetic Monday meeting."),
    );
    let after = page.ok("extraction_preview", job);
    let current = &after["items"][0]["candidate"];
    assert_eq!(current["status"], "accepted");
    assert_eq!(current["candidateId"], candidate["candidateId"]);
    assert!(current["revision"].as_u64().unwrap() > candidate["revision"].as_u64().unwrap());
    assert_eq!(after["items"][0]["content"], shown["items"][0]["content"]);
    assert_eq!(current["content"], shown["items"][0]["content"]);
    assert_eq!(after["items"][0]["selectedText"], statement);
    let memories = page.ok(
        "memory_list",
        json!({"includeInactive":false, "cursor":null, "limit":25}),
    );
    assert_eq!(memories["total"], 1);
    assert_eq!(
        memories["items"][0]["snippet"],
        "Edited synthetic Monday meeting."
    );
    // The saved session carries recovery IDs; no page-local job cache is needed.
    let sessions = page.ok("session_list", json!({}));
    let session = sessions["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["sessionId"] == prepared["sessionId"])
        .unwrap();
    let saved = page.ok(
        "session_detail",
        json!({"sessionId":prepared["sessionId"], "branchId":session["branches"][0]["branchId"]}),
    );
    let restored = &saved["extractionJobs"][0];
    strings(
        restored,
        &["run_id", "input_event_id", "state"],
        "extraction_job",
    );
    assert_eq!(restored["run_id"], prepared["runId"]);
    assert_eq!(restored["state"], "completed");
    assert_eq!(restored["cursor"], 2);
    assert!(restored["candidates"].is_array());
    page.ws.set_native_provider(None).unwrap();
    assert_eq!(page.ok("provider_status", json!({}))["configured"], false);
    let offline = page.ok(
        "extraction_preview",
        json!({"sessionId":prepared["sessionId"], "runId":prepared["runId"]}),
    );
    assert_eq!(offline["items"], after["items"]);
    // A new Core has no in-memory external operation/setup. Session headers,
    // job cursor and reviewed candidate records must recover from the Vault.
    page.reopen();
    assert_eq!(page.ok("provider_status", json!({}))["configured"], false);
    assert_eq!(page.ok("operation_list", json!({}))["items"], json!([]));
    let recovered_sessions = page.ok("session_list", json!({}));
    let recovered_session = recovered_sessions["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["sessionId"] == prepared["sessionId"])
        .unwrap();
    let recovered = page.ok(
        "session_detail",
        json!({"sessionId":recovered_session["sessionId"], "branchId":recovered_session["branches"][0]["branchId"]}),
    );
    assert_eq!(recovered["extractionJobs"], saved["extractionJobs"]);
    let recovered_preview = page.ok(
        "extraction_preview",
        json!({"sessionId":prepared["sessionId"], "runId":prepared["runId"]}),
    );
    assert_eq!(recovered_preview["items"], after["items"]);
    assert_eq!(recovered_preview["job"]["cursor"], 2);
    let recovered_memories = page.ok(
        "memory_list",
        json!({"includeInactive":false, "cursor":null, "limit":25}),
    );
    assert_eq!(recovered_memories["total"], 1);
    assert_eq!(
        recovered_memories["items"][0]["snippet"],
        "Edited synthetic Monday meeting."
    );
    assert_eq!(
        transport.0.load(Ordering::SeqCst),
        1,
        "reads/application/review never resend"
    );
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
fn candidate_pages_are_bounded_and_require_a_fresh_cursor_after_a_commit() {
    let page = Page::new("candidate-pages");
    for n in 0..3 {
        page.ok(
            "remember",
            json!({"text": format!("Synthetic candidate paging statement {n}."), "claimKey": format!("fixture.paging.{n}")}),
        );
    }
    let first = page.ok("candidate_list", json!({"cursor": null, "limit": 2}));
    assert_eq!(first["items"].as_array().unwrap().len(), 2);
    assert_eq!(first["total"], 3);
    assert!(first["nextCursor"].is_string());
    let last = page.ok(
        "candidate_list",
        json!({"cursor": first["nextCursor"], "limit": 2}),
    );
    assert_eq!(last["items"].as_array().unwrap().len(), 1);
    assert_eq!(last["nextCursor"], Value::Null);
    let mut ids: Vec<&str> = first["items"]
        .as_array()
        .unwrap()
        .iter()
        .chain(last["items"].as_array().unwrap())
        .map(|c| c["candidateId"].as_str().unwrap())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), 3);

    page.ok(
        "remember",
        json!({"text": "Synthetic newer candidate changes the canonical head.", "claimKey": "fixture.paging.newer"}),
    );
    let stale = page.err(
        "candidate_list",
        json!({"cursor": first["nextCursor"], "limit": 2}),
    );
    assert_eq!(stale["code"], "revision_conflict");
    assert!(
        stale["rules"]
            .as_array()
            .unwrap()
            .iter()
            .any(|rule| rule == "workspace.cursor_stale")
    );
    let fresh = page.ok("candidate_list", json!({"cursor": null, "limit": 2}));
    assert_eq!(fresh["total"], 4);
    assert_ne!(fresh["nextCursor"], first["nextCursor"]);
    assert_eq!(
        page.ok(
            "memory_list",
            json!({"includeInactive": false, "cursor": null, "limit": 25})
        )["total"],
        0,
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
            "reason",
            "sensitivity",
            "originKind",
            "createdAt",
        ],
        "candidate",
    );
    assert!(candidate["revision"].is_number());
    strings(
        &candidate["evidence"][0],
        &["sourceId", "supports"],
        "candidate.evidence",
    );
    assert!(candidate["evidence"][0]["sourceRevision"].is_number());
    assert!(candidate["evidence"][0]["locator"].is_object());
    assert!(candidate["conflicts"].is_array() && candidate["target"].is_null());
    // Review can observe cited source bytes while the candidate is still
    // pending, without approving it or preparing a model request.
    let citation = &candidate["evidence"][0];
    let pending_source = page.ok(
        "source_excerpt",
        json!({"sourceId": citation["sourceId"], "sourceRevision": citation["sourceRevision"], "startByte": null, "maxBytes": 4096}),
    );
    assert_eq!(pending_source["sourceId"], citation["sourceId"]);
    assert_eq!(pending_source["sourceRevision"], citation["sourceRevision"]);
    assert!(
        pending_source["excerpt"]
            .as_str()
            .unwrap()
            .contains("paper notebooks")
    );
    assert_eq!(pending_source["untrusted"], true);
    assert_eq!(
        page.ok("workspace_status", json!({}))["pendingCandidates"],
        1
    );

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
    assert_eq!(detail["summary"]["memoryId"], memory_id);
    assert_eq!(record["memory_id"], memory_id);
    assert!(record["revision"].is_number() && record["supersedes"].is_array());
    let conflicting = page.ok(
        "remember",
        json!({"text": "Synthetic owner prefers digital tablets for sketching.", "claimKey": "preference.sketching"}),
    );
    let pending_conflicts = page.ok("candidate_list", json!({"cursor": null, "limit": 50}));
    let conflict_candidate = pending_conflicts["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["candidateId"] == conflicting["candidateId"])
        .unwrap();
    let references = conflict_candidate["conflicts"].as_array().unwrap();
    assert_eq!(references.len(), 1);
    let reference = &references[0];
    assert_eq!(reference["memory_id"], memory_id);
    assert_eq!(reference["revision"], record["revision"]);
    assert!(reference.get("conflict_group_id").is_some());
    let conflict_observation = page.ok("memory_read", json!({"memoryId": reference["memory_id"]}));
    assert_eq!(conflict_observation["record"]["content"], record["content"]);
    assert_eq!(
        conflict_observation["record"]["revision"],
        reference["revision"]
    );
    page.decide(conflict_candidate, "reject", None);
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
    assert_eq!(detail["sessionId"], branch["sessionId"]);
    assert_eq!(detail["branchId"], branch["branchId"]);
    assert!(detail.get("lastSavedEventId").is_some());
    let transcript = detail["transcript"].as_array().unwrap();
    assert!(!transcript.is_empty());
    assert!(
        transcript
            .iter()
            .any(|event| event["kind"] == "assistant_completed")
    );
    for event in transcript {
        strings(
            event,
            &["eventId", "kind", "deliveryState", "occurredAt"],
            "transcript",
        );
        assert!(event.get("text").is_some());
        if event["kind"] == "assistant_completed" {
            let saved: Value = serde_json::from_str(event["text"].as_str().unwrap()).unwrap();
            assert_eq!(saved["status"], answer["status"]);
            assert_eq!(saved["statements"], answer["statements"]);
            assert_eq!(saved["sources"], answer["sources"]);
            assert_eq!(saved["memories"], answer["memories"]);
            assert_eq!(saved["dispatch_id"], answer["dispatchId"]);
            assert_eq!(saved["request_hash"], answer["requestHash"]);
            for reference in saved["sources"].as_array().unwrap() {
                assert!(reference["source_revision"].as_u64().unwrap() > 0);
            }
        }
    }
    assert!(detail["turns"].is_array() && detail["checkpoints"].is_array());

    let checkpoint = page.ok(
        "session_checkpoint",
        json!({"sessionId": created["sessionId"], "branchId": created["branchId"], "summary": "Asked about the Lantern release."}),
    );
    assert!(checkpoint["checkpointId"].is_string());
    let after = page.ok("session_detail", branch.clone());
    assert_eq!(after["sessionId"], branch["sessionId"]);
    assert_eq!(after["branchId"], branch["branchId"]);
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
    assert_eq!(inspected["capsule"]["capsule_id"], answer["capsuleId"]);
    assert_eq!(inspected["inspection"]["capsule_id"], answer["capsuleId"]);
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
    assert_eq!(request["dispatchId"], dispatches[0]["dispatchId"]);
    assert_eq!(request["capsuleId"], answer["capsuleId"]);
    assert_eq!(request["requestHash"], dispatches[0]["requestHash"]);
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
