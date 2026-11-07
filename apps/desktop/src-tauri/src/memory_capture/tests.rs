use super::*;
use std::time::{Duration, Instant};
fn packet(query: Value) -> Value {
    json!({"schema_version":2,"capability":CAPABILITY,"query":query})
}
fn op(operation: &str, exchange: usize) -> Value {
    packet(json!({"operation":operation,"exchange":exchange}))
}
fn page(native: &NativeCapture) -> Value {
    native
        .call(
            "main",
            &packet(json!({"operation":"page","cursor":null,"limit":32})),
        )
        .unwrap()
}
fn wait_formed(native: &NativeCapture, exchange: usize) -> Value {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let jobs = native.call("main", &op("jobs", exchange)).unwrap();
        let list = jobs["jobs"].as_array().unwrap();
        if !list.is_empty()
            && list.iter().all(|job| {
                !["queued", "dispatched", "forming"].contains(&job["state"].as_str().unwrap())
            })
        {
            let mut states: Vec<_> = list
                .iter()
                .map(|job| job["state"].as_str().unwrap())
                .collect();
            states.sort();
            assert_eq!(states, ["formed", "no_memory"], "{jobs}");
            return jobs;
        }
        assert!(Instant::now() < deadline, "formation deadline: {jobs}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn closed_boundary_refuses_window_version_and_page_owned_authority_before_roots() {
    let native = NativeCapture::default();
    let status = packet(json!({"operation":"status"}));
    assert_eq!(native.call("overlay", &status), Err("permission_denied"));
    assert_eq!(
        native.call(
            "main",
            &json!({"schema_version":1,"capability":CAPABILITY,"query":{"operation":"status"}})
        ),
        Err("capture_version_unsupported")
    );
    assert_eq!(
        native.call("main", &json!({"schema_version":2,"capability":"memory-native-read-2","query":{"operation":"status"}})),
        Err("capture_version_unsupported")
    );
    for field in ["root", "producer", "pid", "scope", "turns"] {
        let mut injected = status.clone();
        injected[field] = json!("page-owned");
        assert_eq!(
            native.call("main", &injected),
            Err("capture_invalid_request")
        );
    }
    let mut text = op("write", 0);
    text["query"]["text"] = json!("page-supplied turn");
    assert_eq!(native.call("main", &text), Err("capture_invalid_request"));
    assert_eq!(native.call("main", &status).unwrap()["state"], "disabled");
    assert_eq!(
        native.call("main", &op("write", 0)),
        Err("capture_not_enabled")
    );
}

#[test]
fn fixed_turns_capture_queue_and_form_in_background_then_replay_by_key() {
    let native = NativeCapture::default();
    native.initialize_synthetic().unwrap();
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "open"
    );
    let status = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    assert_eq!(status["conversations"][1]["user"], fixture::EXCHANGES[1].0);
    assert_eq!(status["conversations"][1]["content_lang"], "zh-Hans");
    assert_eq!(page(&native)["matched_in_scope"], 0);
    let preview = native.call("main", &op("preflight", 0)).unwrap();
    assert_eq!(preview["capture"]["captured"], false);
    assert_eq!(page(&native)["matched_in_scope"], 0);
    assert_eq!(
        native.call("main", &op("write", 99)),
        Err("capture_invalid_request")
    );
    for exchange in 0..fixture::EXCHANGES.len() {
        let written = native.call("main", &op("write", exchange)).unwrap();
        assert_eq!(written["capture"]["captured"], true, "{written}");
        assert_eq!(written["capture"]["formation_scheduled"], false);
        assert_eq!(written["queue"]["state"], "queued", "{written}");
        assert!(written["queue_error"].is_null());
    }
    let mut receipts = 0;
    for exchange in 0..fixture::EXCHANGES.len() {
        let jobs = wait_formed(&native, exchange);
        assert!(!jobs.to_string().contains(fixture::EXCHANGES[exchange].0));
        receipts += jobs["jobs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|job| job["receipts"].as_u64().unwrap())
            .sum::<u64>();
    }
    // Only the fixed user turns form; assistant turns form nothing.
    assert_eq!(receipts, fixture::EXCHANGES.len() as u64);
    let formed = page(&native);
    assert_eq!(formed["matched_in_scope"], fixture::EXCHANGES.len());
    let mut titles: Vec<_> = formed["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["title"].as_str().unwrap().to_owned())
        .collect();
    titles.sort();
    let mut expected: Vec<_> = fixture::EXCHANGES.iter().map(|e| e.3.to_owned()).collect();
    expected.sort();
    assert_eq!(titles, expected);
    let replay = native.call("main", &op("write", 0)).unwrap();
    assert_eq!(replay["capture"]["replayed"], true, "{replay}");
    assert_eq!(page(&native)["matched_in_scope"], fixture::EXCHANGES.len());
    native.shutdown();
}

#[test]
fn lock_revokes_enrollment_and_worker_and_status_stays_locked() {
    let native = NativeCapture::default();
    native.initialize_synthetic().unwrap();
    let locked = native
        .call("main", &packet(json!({"operation":"lock"})))
        .unwrap();
    assert_eq!(locked["state"], "locked");
    assert_eq!(locked["effect"], "native_control");
    for request in [op("write", 0), op("preflight", 0), op("jobs", 0)] {
        assert_eq!(native.call("main", &request), Err("capture_locked"));
    }
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"page","cursor":null,"limit":1}))
        ),
        Err("capture_locked")
    );
    {
        let state = native.0.state.lock().unwrap();
        let fixture = state.fixture.as_ref().unwrap();
        assert!(fixture.host.preflight(&fixture.requests[0]).is_err());
    }
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "locked"
    );
    native.shutdown();
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "closing"
    );
    assert_eq!(native.initialize_synthetic(), Err("runtime_closing"));
}

#[test]
fn enrollment_expiry_is_reported_and_refuses_capture_without_renewal() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCapture::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone()))
        .unwrap();
    let status = packet(json!({"operation":"status"}));
    assert_eq!(native.call("main", &status).unwrap()["state"], "open");
    clock.set(NOW + 300_000);
    assert_eq!(native.call("main", &status).unwrap()["state"], "expired");
    assert_eq!(native.call("main", &status).unwrap()["available"], false);
    for request in [op("write", 0), op("preflight", 0), op("jobs", 0)] {
        assert_eq!(native.call("main", &request), Err("capture_expired"));
    }
    {
        let state = native.0.state.lock().unwrap();
        let fixture = state.fixture.as_ref().unwrap();
        assert!(fixture.host.preflight(&fixture.requests[0]).is_err());
    }
    native.shutdown();
}

#[test]
fn failed_initialization_reports_its_fault_code_and_opens_nothing() {
    let native = NativeCapture::default();
    assert_eq!(
        native.initialize_with(|_| Err("capture_fixture_enroll")),
        Err("capture_fixture_enroll")
    );
    let status = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    assert_eq!(status["state"], "failed");
    assert_eq!(status["reason"], "capture_fixture_enroll");
    assert_eq!(status["available"], false);
    assert_eq!(
        native.call("main", &op("write", 0)),
        Err("capture_not_enabled")
    );
    assert_eq!(native.initialize_synthetic(), Err("capture_busy"));
}

#[test]
fn explicit_renewal_after_expiry_reenrolls_the_same_producer_and_replays_keys() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCapture::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone()))
        .unwrap();
    let written = native.call("main", &op("write", 0)).unwrap();
    assert_eq!(written["capture"]["captured"], true);
    clock.set(NOW + 300_000);
    let status = packet(json!({"operation":"status"}));
    assert_eq!(native.call("main", &status).unwrap()["state"], "expired");
    assert_eq!(native.call("main", &op("write", 1)), Err("capture_expired"));
    let renewed = native
        .call("main", &packet(json!({"operation":"renew"})))
        .unwrap();
    assert_eq!(renewed["state"], "open");
    assert_eq!(renewed["effect"], "native_control");
    assert_eq!(native.call("main", &status).unwrap()["state"], "open");
    let replay = native.call("main", &op("write", 0)).unwrap();
    assert_eq!(replay["capture"]["replayed"], true, "{replay}");
    assert_eq!(
        native.call("main", &op("write", 1)).unwrap()["capture"]["captured"],
        true
    );
    native
        .call("main", &packet(json!({"operation":"lock"})))
        .unwrap();
    assert_eq!(
        native.call("main", &packet(json!({"operation":"renew"}))),
        Err("capture_locked")
    );
    native.shutdown();
}
