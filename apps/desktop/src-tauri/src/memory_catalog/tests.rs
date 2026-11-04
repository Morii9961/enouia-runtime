use super::*;
fn packet(query: Value) -> Value {
    json!({"schema_version":2,"capability":"memory-native-read-2","query":query})
}
#[test]
fn status_reauthorizes_when_policy_expires_without_a_new_commit() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone()))
        .unwrap();
    let before = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    let first = native
        .call("main", &page(CatalogFilter::default(), Value::Null))
        .unwrap();
    clock.set(NOW + 3_600_001);
    let after = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    assert_eq!(
        before["selection"]["snapshot"],
        after["selection"]["snapshot"]
    );
    assert_ne!(
        before["selection"]["scope_hash"],
        after["selection"]["scope_hash"]
    );
    assert_eq!(
        native
            .call("main", &page(CatalogFilter::default(), Value::Null))
            .unwrap()["matched_in_scope"],
        0
    );
    assert!(native.call("main", &packet(json!({"operation":"stats","filter":CatalogFilter::default(),"selection":first["selection"]}))).is_err());
    native.shutdown();
}
fn page(filter: CatalogFilter, cursor: Value) -> Value {
    packet(json!({"operation":"page","filter":filter,"cursor":cursor,"limit":1}))
}
#[test]
fn closed_boundary_refuses_window_version_and_page_owned_authority_before_roots() {
    let native = NativeCatalog::default();
    let status = packet(json!({"operation":"status"}));
    assert_eq!(native.call("overlay", &status), Err("permission_denied"));
    assert_eq!(native.call("main", &json!({"schema_version":99,"capability":"memory-native-read-2","query":{"operation":"malformed"}})), Err("catalog_version_unsupported"));
    assert_eq!(native.call("main", &json!({"schema_version":2,"capability":"memory-native-read-1","query":{"operation":"status"}})), Err("catalog_version_unsupported"));
    for field in ["root", "system_actor", "profile", "max_sensitivity"] {
        let mut injected = status.clone();
        injected[field] = json!("page-owned");
        assert_eq!(
            native.call("main", &injected),
            Err("catalog_invalid_request")
        );
    }
    assert_eq!(native.call("main", &status).unwrap()["state"], "disabled");
    assert_eq!(
        native.call("main", &page(CatalogFilter::default(), Value::Null)),
        Err("catalog_not_enabled")
    );
}
#[test]
fn segmented_pages_and_stats_share_selection_without_advancing_current_then_lock_and_release() {
    let native = NativeCatalog::default();
    native.initialize_synthetic().unwrap();
    let root = native
        .0
        .state
        .lock()
        .unwrap()
        .fixture
        .as_ref()
        .unwrap()
        ._root
        .clone();
    let before = std::fs::read(root.join("vault/CURRENT")).unwrap();
    let filter = CatalogFilter::default();
    let first = native
        .call("main", &page(filter.clone(), Value::Null))
        .unwrap();
    let parsed: CatalogMemoryPage = parse_document(&canonical_bytes(&first).unwrap()).unwrap();
    assert_eq!(parsed.matched_in_scope, 3);
    assert_eq!(first["selection"]["algorithm"], "owner-qualified-catalog-4");
    assert_eq!(first["selection"]["version"], 4);
    let mut result = first.clone();
    let mut ids = std::collections::BTreeSet::new();
    loop {
        assert_eq!(result["selection"], first["selection"]);
        let row = &result["items"][0];
        assert!(
            ids.insert(
                row["base"]["memory"]["memory_id"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            )
        );
        assert!(row["title"].as_str().unwrap().chars().count() <= 60);
        assert_eq!(row["base"]["system_actor"]["actor_type"], "system");
        assert!(!row["base"]["receipt"].is_null());
        let cursor = result["next"].clone();
        if cursor.is_null() {
            assert_eq!(result["complete_in_scope"], true);
            break;
        }
        result = native.call("main", &page(filter.clone(), cursor)).unwrap();
    }
    assert_eq!(ids.len(), 3);
    let stats = native
        .call(
            "main",
            &packet(json!({"operation":"stats","filter":filter,"selection":first["selection"]})),
        )
        .unwrap();
    let parsed: CatalogMemoryStats = parse_document(&canonical_bytes(&stats).unwrap()).unwrap();
    assert_eq!(parsed.matched_in_scope, 3);
    assert_eq!(stats["selection"], first["selection"]);
    let different = CatalogFilter {
        text: "调试".into(),
        ..Default::default()
    };
    assert!(
        native
            .call("main", &page(different.clone(), first["next"].clone()))
            .is_err()
    );
    assert!(
        native
            .call(
                "main",
                &packet(
                    json!({"operation":"stats","filter":different,"selection":first["selection"]})
                )
            )
            .is_err()
    );
    let selected = native.call("main", &page(different, Value::Null)).unwrap();
    assert_eq!(selected["matched_in_scope"], 1);
    assert_eq!(selected["items"][0]["title"], "调试偏好");
    let mut over_limit = page(filter.clone(), Value::Null);
    over_limit["query"]["limit"] = json!(101);
    assert!(native.call("main", &over_limit).is_err());
    assert_eq!(std::fs::read(root.join("vault/CURRENT")).unwrap(), before);
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"lock"})))
            .unwrap()["effect"],
        "native_control"
    );
    assert_eq!(
        native.call("main", &page(filter.clone(), Value::Null)),
        Err("catalog_locked")
    );
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "locked"
    );
    native
        .call("main", &packet(json!({"operation":"unlock"})))
        .unwrap();
    assert_eq!(
        native.call("main", &page(filter, Value::Null)).unwrap()["matched_in_scope"],
        3
    );
    native.shutdown();
    assert!(native.0.state.lock().unwrap().fixture.is_none());
    assert_eq!(
        native
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "closing"
    );
}
#[test]
fn lock_or_exit_discards_an_initialized_but_unpublished_segmented_root() {
    for exiting in [false, true] {
        let native = NativeCatalog::default();
        let worker = native.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (continue_tx, continue_rx) = std::sync::mpsc::channel();
        let task = std::thread::spawn(move || {
            worker.initialize_with(|stop| {
                let fixture = fixture::create(stop)?;
                ready_tx.send(()).unwrap();
                continue_rx.recv().unwrap();
                Ok(fixture)
            })
        });
        ready_rx.recv().unwrap();
        if exiting {
            native.begin_close();
        } else {
            native.lock();
        }
        continue_tx.send(()).unwrap();
        assert_eq!(
            task.join().unwrap(),
            Err(if exiting {
                "runtime_closing"
            } else {
                "catalog_locked"
            })
        );
        assert!(native.0.state.lock().unwrap().fixture.is_none());
    }
}
#[test]
fn startup_provider_and_shutdown_use_the_same_catalog_lifecycle() {
    let host = crate::memory::MemoryHost::new();
    host.catalog().request_synthetic_mode();
    assert!(matches!(
        host.provider_update(),
        Err("automation_synthetic_mode")
    ));
    host.catalog().initialize_synthetic().unwrap();
    let root = host
        .catalog()
        .0
        .state
        .lock()
        .unwrap()
        .fixture
        .as_ref()
        .unwrap()
        ._root
        .clone();
    let second = NativeCatalog::default();
    second.initialize_synthetic().unwrap();
    assert_ne!(
        second
            .0
            .state
            .lock()
            .unwrap()
            .fixture
            .as_ref()
            .unwrap()
            ._root,
        root
    );
    let _ = host.lock_vault();
    assert_eq!(
        host.catalog()
            .call("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "locked"
    );
    host.begin_close();
    host.close_failed();
    assert_eq!(
        host.catalog()
            .call("main", &page(CatalogFilter::default(), Value::Null)),
        Err("catalog_read_refused")
    );
    host.shutdown();
    second.shutdown();
    assert!(host.catalog().0.state.lock().unwrap().fixture.is_none());
}
