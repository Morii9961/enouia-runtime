use super::*;
fn packet(query: Value) -> Value {
    json!({"schema_version":2,"capability":"memory-native-read-2","query":query})
}
#[test]
fn registered_launch_requires_explicit_complete_native_arguments_without_fallback() {
    use enouia_memory_contract::{ids::OperationId, ports::IdSource};
    let operation =
        OperationId::from_random(enouia_memory_vault::OsIdSource.random_16()).to_string();
    let parse =
        |args: &[&str]| owner_launch(&args.iter().map(|value| (*value).into()).collect::<Vec<_>>());
    assert!(parse(&["runtime", "--autostart"]).is_none());
    let home = std::env::temp_dir()
        .join("enouia-runtime-owner-unselected")
        .to_str()
        .unwrap()
        .to_owned();
    let valid = [
        "runtime",
        "--memory-owner-readonly",
        "--memory-owner-home",
        &home,
        "--memory-owner-operation",
        &operation,
    ];
    assert!(parse(&valid).unwrap().is_ok());
    for args in [
        vec!["runtime", "--memory-owner-readonly"],
        vec![
            "runtime",
            "--memory-owner-home",
            &home,
            "--memory-owner-operation",
            &operation,
        ],
        vec![
            "runtime",
            "--memory-owner-readonly",
            "--memory-owner-home",
            "relative",
            "--memory-owner-operation",
            &operation,
        ],
        vec![
            "runtime",
            "--memory-owner-readonly",
            "--memory-owner-home",
            &home,
            "--memory-owner-operation",
            "invalid",
            "--memory-owner-operation",
            &operation,
        ],
    ] {
        assert!(parse(&args).unwrap().is_err());
    }
    for extra in [
        "--memory-owner-readonly",
        "--memory-owner-home",
        "--memory-owner-unknown",
        "--memory-synthetic",
        "--memory-catalog-synthetic",
        "--memory-capture-synthetic",
        "--memory-vault",
    ] {
        let mut args = valid.to_vec();
        args.push(extra);
        assert!(parse(&args).unwrap().is_err());
    }
    let native = NativeCatalog::default();
    assert_eq!(
        native.initialize_registered(Err("catalog_owner_launch_invalid")),
        Err("catalog_owner_launch_invalid")
    );
    let status = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    assert_eq!(status["mode"], "registered_owner_readonly");
    assert_eq!(status["state"], "failed");
    assert_eq!(status["reason"], "catalog_owner_launch_invalid");
    assert!(native.0.state.lock().unwrap().library.is_none());
}

#[test]
fn owner_mode_refuses_workspace_writes_picks_and_provider_without_opening_a_root() {
    let host = crate::memory::MemoryHost::new();
    host.catalog().request_owner_mode();
    for command in [
        "remember",
        "vault_create",
        "vault_open",
        "vault_unlock",
        "session_new",
        "persona_export",
    ] {
        assert_eq!(
            host.forward(&json!({"command":command})),
            Err("catalog_owner_readonly".into())
        );
    }
    assert!(!host.catalog().0.withdrawn.load(Ordering::SeqCst));
    assert!(matches!(
        host.provider_update(),
        Err("catalog_owner_readonly")
    ));
    let unselected = std::env::temp_dir().join("enouia-runtime-never-open-this-owner-root");
    assert!(
        host.register_pick(enouia_memory_workspace::PickKind::VaultRoot, &unselected)["token"]
            .is_null()
    );
    host.open_root(&unselected);
    assert_eq!(host.admission_error(), Some("catalog_owner_readonly"));
    let status = host.forward(&json!({"schemaVersion":1,"requestId":"req_00000000-0000-4000-8000-000000000001","command":"workspace_status","idempotencyKey":null,"arguments":{}})).unwrap();
    assert_eq!(status["result"]["vault"]["state"], "none");
    host.shutdown();
}

#[test]
#[ignore = "requires explicit ENOUIA_SYNTHETIC_DURABLE_PARENT; retains a protected synthetic home"]
fn registered_native_owner_opens_same_root_reads_closes_and_reauthenticates() {
    use enouia_memory_contract::{foundation::Clock, ports::IdSource};
    use enouia_memory_host::owner_bootstrap::{registered_owner_root, run_cli};
    use enouia_memory_vault::{OsIdSource, SystemClock, platform};
    let parent = PathBuf::from(
        std::env::var_os("ENOUIA_SYNTHETIC_DURABLE_PARENT").expect("explicit synthetic parent"),
    );
    assert!(parent.is_absolute() && parent.is_dir());
    let home = parent.join(format!(
        "enouia-runtime-owner-synthetic-{}",
        enouia_memory_contract::ids::format_uuid_v4(OsIdSource.random_16())
    ));
    std::fs::create_dir(&home).unwrap();
    platform::restrict_to_owner(&home).unwrap();
    std::fs::write(
        home.join("DO_NOT_DELETE.USER_DATA"),
        b"Synthetic Runtime native registration validation. Retain; no real owner content.",
    )
    .unwrap();
    std::fs::write(home.join(".enouia-owner-data.json"), serde_json::to_vec(&json!({"format":"enouia-owner-data-home/1","storage_class":"owner_data","allow_development_cleanup":false,"allow_git_upload":false,"production_vault_created":false,"active_vault":null,"synthetic_validation_only":true})).unwrap()).unwrap();
    let home_arg = home.to_str().unwrap().to_owned();
    let prepared = run_cli(&[
        "prepare".into(),
        home_arg.clone(),
        "--bind-current-owner-self".into(),
    ])
    .unwrap();
    let operation: OperationId = serde_json::from_value(prepared["operation_id"].clone()).unwrap();
    run_cli(&[
        "commit".into(),
        home_arg.clone(),
        operation.to_string(),
        "--bind-current-owner-self".into(),
    ])
    .unwrap();
    let (root, descriptor) = registered_owner_root(&home, &operation).unwrap();
    {
        let vault = Arc::new(
            enouia_memory_vault::automation::segmented::SegmentedAutomationVault::open(
                &root,
                descriptor.host_id.clone(),
                Arc::new(SystemClock),
                Arc::new(OsIdSource),
                enouia_memory_vault::fault::Faults::none(),
            )
            .unwrap(),
        );
        fixture::seed(
            &vault,
            &descriptor,
            SystemClock.now_unix_ms(),
            &AtomicBool::new(false),
        )
        .unwrap();
    }
    let current = std::fs::read(root.path().join("vault/CURRENT")).unwrap();
    let metadata = std::fs::read(home.join(".enouia-owner-data.json")).unwrap();
    let launch = || {
        Ok(OwnerLaunch {
            home: home.clone(),
            operation: operation.clone(),
        })
    };
    for _ in 0..2 {
        let native = NativeCatalog::default();
        native.initialize_registered(launch()).unwrap();
        let page = native
            .call_waiting("main", &page(CatalogFilter::default(), Value::Null))
            .unwrap();
        assert_eq!(page["matched_in_scope"], 3);
        assert_eq!(
            page["selection"]["snapshot"]["vault_id"],
            serde_json::to_value(&descriptor.vault_id).unwrap()
        );
        let detail = native.call_waiting("main", &packet(json!({"operation":"detail","filter":CatalogFilter::default(),"memory_id":page["items"][0]["base"]["memory"]["memory_id"]}))).unwrap();
        let quote = &detail["fields"]["evidence"][0];
        let source_request = packet(
            json!({"operation":"source","source":{"source_id":quote["reference"]["source_id"],"source_revision":quote["reference"]["source_revision"]},"start":quote["start"],"limit":quote["end"].as_u64().unwrap()-quote["start"].as_u64().unwrap()}),
        );
        let excerpt = native.call_waiting("main", &source_request).unwrap();
        assert_eq!(excerpt["excerpt"], quote["quote"]);
        let second = NativeCatalog::default();
        assert_eq!(second.initialize_registered(launch()), Err("root_in_use"));
        native.lock();
        assert!(native.0.state.lock().unwrap().library.is_none());
        assert_eq!(native.call("main", &source_request), Err("catalog_locked"));
        assert_eq!(
            native.call("main", &packet(json!({"operation":"unlock"}))),
            Err("catalog_owner_reopen_required")
        );
        assert_eq!(
            std::fs::read(root.path().join("vault/CURRENT")).unwrap(),
            current
        );
    }
    let refused = NativeCatalog::default();
    assert_eq!(
        refused.initialize_registered(Ok(OwnerLaunch {
            home: home.clone(),
            operation: OperationId::from_random(OsIdSource.random_16())
        })),
        Err("catalog_owner_authentication_failed")
    );
    assert_eq!(
        std::fs::read(home.join(".enouia-owner-data.json")).unwrap(),
        metadata
    );
    if let Some(output) = std::env::var_os("ENOUIA_SYNTHETIC_LAUNCH_MANIFEST") {
        std::fs::write(output, serde_json::to_vec_pretty(&json!({"synthetic_validation_only":true,"home":home,"operation":operation,"root":root.path(),"vault_id":descriptor.vault_id})).unwrap()).unwrap();
    }
}
#[test]
fn observation_contention_is_bounded_and_close_is_rechecked_without_replaying_controls() {
    let native = NativeCatalog::default();
    native.initialize_synthetic().unwrap();
    let guard = native.0.state.lock().unwrap();
    let worker = native.clone();
    let task = std::thread::spawn(move || {
        worker.call_waiting("main", &page(CatalogFilter::default(), Value::Null))
    });
    native.begin_close();
    drop(guard);
    assert_eq!(task.join().unwrap(), Err("runtime_closing"));
    let native = NativeCatalog::default();
    let guard = native.0.state.lock().unwrap();
    let start = std::time::Instant::now();
    assert_eq!(
        native.call_waiting("main", &packet(json!({"operation":"unlock"}))),
        Err("catalog_busy")
    );
    assert!(start.elapsed() < std::time::Duration::from_secs(1));
    assert_eq!(
        native.call_waiting("main", &packet(json!({"operation":"status"}))),
        Err("catalog_busy")
    );
    assert!(start.elapsed() < std::time::Duration::from_secs(4));
    drop(guard);
    assert_eq!(
        native
            .call_waiting("main", &packet(json!({"operation":"status"})))
            .unwrap()["state"],
        "disabled"
    );
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
        .library
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
    let detail_request = packet(
        json!({"operation":"detail","filter":CatalogFilter::default(),
        "memory_id":selected["items"][0]["base"]["memory"]["memory_id"]}),
    );
    let detail = native.call("main", &detail_request).unwrap();
    let parsed: NativeMemoryDetail = parse_document(&canonical_bytes(&detail).unwrap()).unwrap();
    assert_eq!(parsed.header.version.get(), 2);
    assert_eq!(parsed.fields.as_ref().unwrap().title, "调试偏好");
    let quote = &parsed.fields.as_ref().unwrap().evidence[0];
    let source = SourceRevisionRef {
        source_id: quote.reference.source_id.clone(),
        source_revision: quote.reference.source_revision,
    };
    let source_request = packet(json!({"operation":"source","source":source,"start":0,"limit":3}));
    let mut recovered = String::new();
    let mut start = 0;
    loop {
        let result = native
            .call(
                "main",
                &packet(json!({"operation":"source","source":source,"start":start,"limit":3})),
            )
            .unwrap();
        let excerpt: NativeSourceExcerpt =
            parse_document(&canonical_bytes(&result).unwrap()).unwrap();
        assert_eq!(excerpt.source.as_ref(), Some(&source));
        assert_eq!(excerpt.start, start);
        recovered.push_str(excerpt.excerpt.as_ref().unwrap());
        if excerpt.complete_in_scope {
            break;
        }
        assert!(excerpt.end > start);
        start = excerpt.end;
    }
    assert_eq!(
        recovered,
        selected["items"][0]["base"]["content"].as_str().unwrap()
    );
    assert_eq!(
        recovered
            .chars()
            .skip(quote.start as usize)
            .take((quote.end - quote.start) as usize)
            .collect::<String>(),
        quote.quote
    );
    let missing_revision = packet(
        json!({"operation":"source","source":{"source_id":source.source_id,"source_revision":999},"start":0,"limit":3}),
    );
    assert!(native.call("main", &missing_revision).unwrap()["source"].is_null());
    for limit in [0, 4097] {
        assert!(
            native
                .call(
                    "main",
                    &packet(json!({"operation":"source","source":source,"start":0,"limit":limit}))
                )
                .is_err()
        );
    }
    assert_eq!(
        native.call("overlay", &source_request),
        Err("permission_denied")
    );
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
    assert_eq!(native.call("main", &detail_request), Err("catalog_locked"));
    assert_eq!(native.call("main", &source_request), Err("catalog_locked"));
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
    assert!(native.0.state.lock().unwrap().library.is_none());
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
        assert!(native.0.state.lock().unwrap().library.is_none());
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
        .library
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
            .library
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
    assert!(host.catalog().0.state.lock().unwrap().library.is_none());
}
