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
    let launch = parse(&valid).unwrap().unwrap();
    // The remembered entry round-trips; a missing or unreadable file selects
    // nothing and a malformed selection fails like a malformed launch.
    let dir = std::env::temp_dir().join(format!("enouia-runtime-owner-entry-{operation}"));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("owner-entry.json");
    assert!(remembered_owner_launch(&file).is_none());
    std::fs::write(&file, launch.entry().unwrap()).unwrap();
    let remembered = remembered_owner_launch(&file).unwrap().unwrap();
    assert_eq!(remembered.home, launch.home);
    assert_eq!(remembered.operation, launch.operation);
    std::fs::write(&file, "not json").unwrap();
    assert!(remembered_owner_launch(&file).is_none());
    for entry in [
        json!({"home": "relative", "operation": operation}),
        json!({"home": home, "operation": "invalid"}),
    ] {
        std::fs::write(&file, entry.to_string()).unwrap();
        assert!(remembered_owner_launch(&file).unwrap().is_err());
    }
    std::fs::remove_dir_all(&dir).unwrap();
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
    // Quick Search reads the registered catalog, never the closed Workspace.
    assert_eq!(
        host.forward(&json!({"command":"memory_search","arguments":{"query":"x"}})),
        Err("catalog_not_enabled".into())
    );
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

/// R4 read probe: open an explicitly named registered home read-only and call
/// every catalog operation once. Prints only kinds, counts and refusal codes,
/// never titles, content, quotes or identifiers, and asserts CURRENT is unchanged.
#[test]
#[ignore = "requires explicit ENOUIA_REGISTERED_PROBE_HOME and ENOUIA_REGISTERED_PROBE_OPERATION"]
fn registered_read_probe_reports_every_operation_without_content() {
    let home = PathBuf::from(std::env::var_os("ENOUIA_REGISTERED_PROBE_HOME").expect("home"));
    let operation =
        OperationId::parse(&std::env::var("ENOUIA_REGISTERED_PROBE_OPERATION").expect("operation"))
            .unwrap();
    let (root, _) =
        enouia_memory_host::owner_bootstrap::registered_owner_root(&home, &operation).unwrap();
    let current_path = root.path().join("vault/CURRENT");
    let current = std::fs::read(&current_path).unwrap();
    let sequence = |bytes: &[u8]| {
        serde_json::from_slice::<Value>(bytes)
            .ok()
            .and_then(|v| v.get("sequence").cloned())
            .unwrap_or(Value::Null)
    };
    println!("CURRENT sequence before: {}", sequence(&current));
    let native = NativeCatalog::default();
    native
        .initialize_registered(Ok(OwnerLaunch { home, operation }))
        .unwrap();
    let all = CatalogFilter::default();
    let report = |name: &str, query: Value| -> Option<Value> {
        let started = std::time::Instant::now();
        match native.call_waiting("main", &packet(query)) {
            Ok(value) => {
                let counts: Vec<String> = [
                    "matched_in_scope",
                    "unknown_time_in_scope",
                    "complete_in_scope",
                    "visible_captured_turns",
                    "visible_captured_sources",
                ]
                .iter()
                .filter_map(|key| value.get(*key).map(|v| format!("{key}={v}")))
                .chain(
                    [
                        "items",
                        "buckets",
                        "nodes",
                        "edges",
                        "events",
                        "members",
                        "groups",
                        "facets",
                        "conversations",
                        "turns",
                        "neighbors",
                        "revisions",
                        "history",
                        "fields_changed",
                        "changed",
                        "members_in_scope",
                    ]
                    .iter()
                    .filter_map(|key| {
                        value
                            .get(*key)
                            .and_then(Value::as_array)
                            .map(|a| format!("{key}[{}]", a.len()))
                    }),
                )
                .collect();
                println!(
                    "{name}: ok kind={} {} ({} ms)",
                    value["kind"],
                    counts.join(" "),
                    started.elapsed().as_millis()
                );
                Some(value)
            }
            Err(code) => {
                println!("{name}: refused {code}");
                None
            }
        }
    };
    let page = report(
        "page",
        json!({"operation":"page","filter":all,"cursor":null,"limit":100,"facets":true}),
    )
    .unwrap();
    for group in page["facets"].as_array().unwrap() {
        println!(
            "  facet {} values={} total={}",
            group["axis"],
            group["values"].as_array().unwrap().len(),
            group["total_values"]
        );
    }
    let selection = page["selection"].clone();
    if let Some(stats) = report(
        "stats",
        json!({"operation":"stats","filter":all,"selection":selection}),
    ) {
        for group in stats["groups"].as_array().unwrap() {
            let counts: Vec<String> = group["values"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|_| !matches!(group["axis"].as_str(), Some("entity" | "project" | "theme")))
                .map(|v| format!("{}={}", v["value"], v["count"]))
                .collect();
            println!(
                "  stats {} total_values={} {}",
                group["axis"],
                group["total_values"],
                counts.join(" ")
            );
        }
    }
    let items = page["items"].as_array().unwrap();
    let entities = items
        .iter()
        .filter(|i| !i["entities"].as_array().unwrap().is_empty())
        .count();
    let projects = items
        .iter()
        .filter(|i| !i["base"]["project_id"].is_null())
        .count();
    let reasons = items
        .iter()
        .filter(|i| !i["formation_reason"].is_null())
        .count();
    let unknown = items
        .iter()
        .filter(|i| i["event_time"]["precision"] == "unknown" || i["event_time"].is_null())
        .count();
    println!(
        "  first page rows with entities={entities} project={projects} reason={reasons} unknown_event={unknown}"
    );
    report(
        "facets.form",
        json!({"operation":"facets","filter":all,"axis":"form","count_scope":"matched","cursor":null,"selection":selection,"limit":100}),
    );
    for (axis, granularity, from, until) in [
        ("event", "month", "2000-01-01", "2027-01-01"),
        ("learned", "day", "2026-10-01", "2026-12-01"),
        ("source_captured", "month", "2000-01-01", "2027-01-01"),
    ] {
        report(
            &format!("time_buckets.{axis}.{granularity}"),
            json!({"operation":"time_buckets","filter":all,"query":{"axis":axis,"timezone":"Asia/Shanghai","granularity":granularity,"from_date":from,"until_date":until},"selection":null}),
        );
    }
    report(
        "graph",
        json!({"operation":"graph","filter":all,"query":{"node_limit":5000,"edge_limit_per_kind":20000},"cursor":null}),
    );
    report(
        "activity",
        json!({"operation":"activity","filter":all,"query":{"memory":null,"event_kind":null,"include_sources":false},"cursor":null,"limit":100}),
    );
    report("changes", json!({"operation":"changes","anchor":null}));
    report(
        "conversations",
        json!({"operation":"conversations","cursor":null,"limit":100}),
    );
    if let Some(first) = items.first() {
        let id = &first["base"]["memory"]["memory_id"];
        let detail = report(
            "detail",
            json!({"operation":"detail","filter":all,"memory_id":id}),
        );
        report(
            "neighbors",
            json!({"operation":"neighbors","filter":all,"memory_id":id,"include_suggestions":true,"cursor":null,"limit":32}),
        );
        report(
            "conflicts",
            json!({"operation":"conflicts","filter":all,"memory_id":id,"cursor":null,"limit":32}),
        );
        if let Some(quote) = detail.as_ref().and_then(|d| d["fields"]["evidence"].get(0)) {
            report(
                "source",
                json!({"operation":"source","source":{"source_id":quote["reference"]["source_id"],"source_revision":quote["reference"]["source_revision"]},"start":quote["start"],"limit":quote["end"].as_u64().unwrap()-quote["start"].as_u64().unwrap()}),
            );
        }
    }
    if let Some(theme) = items
        .iter()
        .find(|i| i["base"]["dimensions"]["kind"] == "theme")
    {
        report(
            "theme_members",
            json!({"operation":"theme_members","filter":all,"theme":theme["base"]["memory"]["memory_id"],"cursor":null,"limit":100}),
        );
    } else {
        println!("theme_members: no theme record on the first page");
    }
    // Every record in one graph selection, as the Connections view reads it.
    if let Some(graph) = report(
        "graph.all",
        json!({"operation":"graph","filter":all,"query":{"node_limit":5000,"edge_limit_per_kind":20000},"cursor":null}),
    ) {
        for c in graph["edge_coverage"].as_array().into_iter().flatten() {
            println!(
                "  edges {} candidates={} retained={}",
                c["relation"], c["candidates"], c["retained"]
            );
        }
    }
    let now =
        enouia_memory_contract::foundation::Clock::now_unix_ms(&enouia_memory_vault::SystemClock);
    let at = |ms: i64| enouia_memory_contract::time::Timestamp::from_unix_ms(ms).unwrap();
    if let Some(v) = report(
        "review_suggestions.30d",
        json!({"operation":"review_suggestions","filter":all,"query":{"horizon_days":30},"limit":50}),
    ) {
        println!("  total_in_horizon={}", v["total_in_horizon"]);
    }
    if let Some(v) = report(
        "attention_schedule.90d",
        json!({"operation":"attention_schedule","filter":all,"query":{"from":at(now),"until":at(now + 90 * 86_400_000)},"cursor":null,"limit":50}),
    ) {
        println!(
            "  fade={} archive={} protected={} next={}",
            v["fade_after_days"],
            v["archive_after_days"],
            v["protected_in_scope"],
            !v["next"].is_null()
        );
    }
    native.lock();
    let after = std::fs::read(&current_path).unwrap();
    println!("CURRENT sequence after: {}", sequence(&after));
    assert_eq!(after, current, "read-only probe must not change CURRENT");
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
            true,
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
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone(), false))
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
#[test]
fn full_history_reader_keeps_records_after_their_policy_window_ends() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone(), true))
        .unwrap();
    let all = CatalogFilter::default();
    assert_eq!(
        native
            .call("main", &page(all.clone(), Value::Null))
            .unwrap()["matched_in_scope"],
        3
    );
    clock.set(NOW + 3_600_001);
    let after = native
        .call("main", &page(all.clone(), Value::Null))
        .unwrap();
    assert_eq!(after["matched_in_scope"], 3);
    let recall = native
        .call("main", &packet(json!({"operation":"recall_preview","query":{"text":"","conditions":[],"event_window":null,"at":after["authorized_at"],"intent":"browse","limit":8,"max_bytes":16384}})))
        .unwrap();
    assert_eq!(recall["trace"]["considered"], 3);
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
#[test]
fn projection_and_process_reads_forward_core_documents_without_writing() {
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
    let all = CatalogFilter::default();
    let first = native
        .call(
            "main",
            &packet(
                json!({"operation":"page","filter":all,"cursor":null,"limit":100,"facets":true}),
            ),
        )
        .unwrap();
    assert_eq!(first["facets"].as_array().unwrap().len(), 9);
    let id = first["items"][0]["base"]["memory"]["memory_id"].clone();
    for (query, kind) in [
        (
            json!({"operation":"time_buckets","filter":all,"query":{"axis":"learned","timezone":"Asia/Shanghai","granularity":"month","from_date":"2020-01-01","until_date":"2030-01-01"},"selection":null}),
            "memory_time_buckets",
        ),
        (
            json!({"operation":"graph","filter":all,"query":{"node_limit":5000,"edge_limit_per_kind":20000},"cursor":null}),
            "memory_graph_page",
        ),
        (
            json!({"operation":"activity","filter":all,"query":{"memory":null,"event_kind":null,"include_sources":false},"cursor":null,"limit":50}),
            "memory_activity_page",
        ),
        (
            json!({"operation":"changes","anchor":null}),
            "memory_changes",
        ),
        (
            json!({"operation":"conversations","cursor":null,"limit":50}),
            "native_conversation_page",
        ),
        (
            json!({"operation":"neighbors","filter":all,"memory_id":id,"include_suggestions":true,"cursor":null,"limit":32}),
            "native_memory_neighbors",
        ),
        (
            json!({"operation":"conflicts","filter":all,"memory_id":id,"cursor":null,"limit":16}),
            "memory_conflict_group",
        ),
        (
            json!({"operation":"facets","filter":all,"axis":"form","count_scope":"matched","cursor":null,"selection":null,"limit":16}),
            "catalog_memory_facets",
        ),
    ] {
        let value = native.call("main", &packet(query)).unwrap();
        assert_eq!(value["kind"], kind);
        assert_eq!(value["effect"], "native_read");
    }
    let at = first["authorized_at"].clone();
    let status = native
        .call("main", &packet(json!({"operation":"status"})))
        .unwrap();
    assert_eq!(
        status["recall_limits"],
        json!({"max_items":8,"max_bytes":16384})
    );
    let recall = native
        .call("main", &packet(json!({"operation":"recall_preview","query":{"text":"","conditions":[],"event_window":null,"at":at,"intent":"browse","limit":8,"max_bytes":16384}})))
        .unwrap();
    assert_eq!(recall["kind"], "native_recall_preview");
    assert_eq!(recall["effect"], "native_read");
    assert!(
        recall["trace"]["selected"].is_array()
            && recall["trace_coverage"]["reason_counts"].is_object()
    );
    if std::env::var_os("ENOUIA_PRINT_RECALL_SHAPE").is_some() {
        println!("{}", serde_json::to_string_pretty(&recall).unwrap());
    }
    // A profile-exceeding limit is Core's refusal, not a clamp.
    assert_eq!(
        native.call("main", &packet(json!({"operation":"recall_preview","query":{"text":"","conditions":[],"event_window":null,"at":at,"intent":"browse","limit":9,"max_bytes":16384}}))),
        Err("catalog_read_refused")
    );
    // Page-owned limits outside Core's bounds are refused, not clamped.
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"conversations","cursor":null,"limit":0}))
        ),
        Err("catalog_read_refused")
    );
    let search = native.search("合成").unwrap();
    assert_eq!(search["result"]["kind"], "registered_catalog_search");
    assert!(search["result"]["items"].as_array().unwrap().len() <= 8);
    native.lock();
    assert_eq!(
        native.call("main", &packet(json!({"operation":"graph","filter":all,"query":{"node_limit":10,"edge_limit_per_kind":10},"cursor":null}))),
        Err("catalog_locked")
    );
    assert_eq!(std::fs::read(root.join("vault/CURRENT")).unwrap(), before);
}
#[test]
fn native_corrections_plan_confirm_once_and_commit_through_core() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone(), true))
        .unwrap();
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
    let all = CatalogFilter::default();
    let target = |native: &NativeCatalog, index: usize| {
        let page = native
            .call(
                "main",
                &packet(json!({"operation":"page","filter":all,"cursor":null,"limit":100})),
            )
            .unwrap();
        let id = page["items"][index]["base"]["memory"]["memory_id"].clone();
        let detail = native
            .call(
                "main",
                &packet(json!({"operation":"detail","filter":all,"memory_id":id})),
            )
            .unwrap();
        detail["history"][0]["memory"].clone()
    };
    let current = || std::fs::read(root.join("vault/CURRENT")).unwrap();
    // Withdraw: the plan writes nothing; one confirm commits; a replay is refused.
    let before = current();
    let withdraw = target(&native, 0);
    let plan = native
        .call("main", &packet(json!({"operation":"plan_action","action":{"action":"withdraw","target":withdraw,"reason":null},"correction":null})))
        .unwrap();
    assert_eq!(plan["kind"], "native_owner_preview");
    assert_eq!(plan["affected_count_in_scope"], 1);
    assert_eq!(plan["physical_purge"], false);
    assert_eq!(current(), before, "planning must not write");
    let confirm = json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]});
    let outcome = native.call("main", &packet(confirm.clone())).unwrap();
    assert_eq!(outcome["kind"], "native_owner_outcome");
    assert_eq!(outcome["action"], "withdraw");
    assert_eq!(outcome["actor"]["actor_type"], "owner");
    assert_ne!(current(), before);
    assert!(
        native.call("main", &packet(confirm)).is_err(),
        "consent is one-use"
    );
    let after = native
        .call("main", &page(all.clone(), Value::Null))
        .unwrap();
    assert_eq!(after["matched_in_scope"], 2);
    let lookup = native
        .call(
            "main",
            &packet(json!({"operation":"action_outcome","operation_id":outcome["operation_id"]})),
        )
        .unwrap();
    assert_eq!(lookup["outcome"]["committed_in"], outcome["committed_in"]);
    // Correct: Morii's literal text becomes the next revision of the record.
    let fix = target(&native, 0);
    let plan = native
        .call("main", &packet(json!({"operation":"plan_action",
            "action":{"action":"correct","target":fix,"source_id":"src_00000000-0000-4000-8000-000000000999","assertion_text":"合成纠正：我更喜欢早上散步。"},
            "correction":{"title":"合成纠正","content_lang":"zh-Hans","sensitivity":"private","interpretation":"clear_self_report"}})))
        .unwrap();
    assert!(plan["proposed_correction"].is_object());
    let outcome = native
        .call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]})))
        .unwrap();
    assert_eq!(outcome["action"], "correct");
    assert_eq!(outcome["memory_result"]["revision"], 2);
    let corrected = native
        .call("main", &packet(json!({"operation":"detail","filter":all,"memory_id":outcome["memory_result"]["memory_id"]})))
        .unwrap();
    assert_eq!(
        corrected["item"]["base"]["content"],
        "合成纠正：我更喜欢早上散步。"
    );
    assert_eq!(corrected["item"]["title"], "合成纠正");
    // A tampered plan hash is Core's refusal, not a commit.
    let protect = target(&native, 1);
    let plan = native
        .call("main", &packet(json!({"operation":"plan_action","action":{"action":"attention","target":protect,"annotation":"protect","until":null},"correction":null})))
        .unwrap();
    assert!(native.call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":"0".repeat(64),"effects_hash":plan["effects_hash"]}))).is_err());
    // Lock discards pending plans with the library.
    native.lock();
    assert_eq!(
        native.call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]}))),
        Err("catalog_locked")
    );
    native.shutdown();
}
#[test]
fn ordinary_segmented_entry_offers_no_corrections() {
    let native = NativeCatalog::default();
    native.initialize_synthetic().unwrap();
    let all = CatalogFilter::default();
    let page = native
        .call("main", &page(all.clone(), Value::Null))
        .unwrap();
    let id = page["items"][0]["base"]["memory"]["memory_id"].clone();
    let detail = native
        .call(
            "main",
            &packet(json!({"operation":"detail","filter":all,"memory_id":id})),
        )
        .unwrap();
    assert_eq!(
        native.call("main", &packet(json!({"operation":"plan_action","action":{"action":"withdraw","target":detail["history"][0]["memory"],"reason":null},"correction":null}))),
        Err("correction_unavailable")
    );
    native.shutdown();
}
#[test]
fn corrections_still_reach_records_after_their_policy_window_ends() {
    const NOW: i64 = 1_793_664_000_000;
    let clock = Arc::new(enouia_memory_contract::foundation::FakeClock::new(NOW));
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| fixture::create_with_clock(stop, clock.clone(), true))
        .unwrap();
    clock.set(NOW + 3_600_001);
    let all = CatalogFilter::default();
    let page = native
        .call(
            "main",
            &packet(json!({"operation":"page","filter":all,"cursor":null,"limit":100})),
        )
        .unwrap();
    assert_eq!(page["matched_in_scope"], 3);
    let id = page["items"][0]["base"]["memory"]["memory_id"].clone();
    let detail = native
        .call(
            "main",
            &packet(json!({"operation":"detail","filter":all,"memory_id":id})),
        )
        .unwrap();
    let plan = native
        .call("main", &packet(json!({"operation":"plan_action","action":{"action":"attention","target":detail["history"][0]["memory"],"annotation":"protect","until":null},"correction":null})))
        .unwrap();
    let outcome = native
        .call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]})))
        .unwrap();
    assert_eq!(outcome["action"], "attention");
    native.shutdown();
}
/// ADR-MEM-157 seeding: a synthetic ChatGPT submission formed by Memory's own
/// connector path, read back through the registered catalog Runtime displays.
#[test]
fn chatgpt_extracted_memory_carries_its_analyst_model_and_note() {
    use enouia_memory_contract::common::SpeakerRole;
    use enouia_memory_contract::{foundation::Clock, ports::IdSource};
    use enouia_memory_host::automation::connector_formation::{
        self, ConnectorConfig, ConnectorStatement, ConnectorSubmission, ConnectorWriter,
    };
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let vault = {
        let state = native.0.state.lock().unwrap();
        state.library.as_ref().unwrap().vault.clone().unwrap()
    };
    let created_by = vault.descriptor().created_by.clone();
    let writer = ConnectorWriter::new(
        vault,
        created_by,
        ActorRef {
            actor_type: enouia_memory_contract::common::ActorType::Client,
            actor_id: enouia_memory_contract::ids::PrincipalId::from_random(
                enouia_memory_vault::OsIdSource.random_16(),
            ),
        },
        ConnectorConfig {
            account_scope: "chatgpt-connector-synthetic".into(),
            default_timezone: "Asia/Shanghai".into(),
            max_sensitivity: Sensitivity::Private,
            allowed_forms: vec![FormationKind::Preference],
            window_days: 30,
        },
    )
    .unwrap();
    let user = "Synthetic ChatGPT turn: I prefer green tea in the afternoon.";
    let unknown = RecordTime {
        from: None,
        until: None,
        precision: RecordPrecision::Unknown,
        bound: TimeBound::Within,
        tz: None,
        basis: TimeBasis::Unknown,
    };
    let turn = |n: u32, speaker, text: &str| RuntimeCaptureTurn {
        message_id: format!("m{n}"),
        parent_message_id: (n > 1).then(|| format!("m{}", n - 1)),
        branch_id: "main".into(),
        sequence: n,
        speaker,
        text: text.into(),
        original_time: None,
        original_timezone: None,
        occurred_at: None,
        content_lang: "en".into(),
        assistant_model: None,
        attachments: vec![],
    };
    let submission = ConnectorSubmission {
        request: RuntimeCaptureRequest {
            schema_version: NextVersion,
            kind: RuntimeCaptureKind::Capture,
            capability: RuntimeCaptureCapability::OwnerV1,
            request_id: enouia_memory_contract::ids::RequestId::from_random(
                enouia_memory_vault::OsIdSource.random_16(),
            ),
            conversation_id: "chatgpt-synthetic-1".into(),
            title: None,
            turns: vec![
                turn(1, SpeakerRole::User, user),
                turn(2, SpeakerRole::Assistant, "Synthetic assistant reply."),
            ],
        },
        analyst_model: "gpt-synthetic-1".into(),
        statements: vec![ConnectorStatement {
            entities: vec![],
            message_id: "m1".into(),
            quote: "I prefer green tea in the afternoon.".into(),
            title: "green tea in the afternoon".into(),
            interpretation: Interpretation::ClearSelfReport,
            kind: FormationKind::Preference,
            event_time: unknown.clone(),
            valid_time: unknown,
            note: Some("Synthetic ChatGPT note.".into()),
        }],
    };
    let before = native
        .call("main", &packet(json!({"operation":"connector_status"})))
        .unwrap();
    assert_eq!(
        before["windows"].as_array().unwrap().len(),
        0,
        "not connected yet"
    );
    writer
        .submit(
            &submission,
            false,
            enouia_memory_vault::SystemClock.now_unix_ms(),
        )
        .unwrap();
    let after = native
        .call_waiting("main", &packet(json!({"operation":"connector_status"})))
        .unwrap();
    let window = &after["windows"][0];
    assert_eq!(window["max_sensitivity"], "private");
    assert_eq!(window["allowed_forms"], json!(["preference"]));
    assert_eq!(
        window["unused_sources"].as_u64().unwrap() + 2,
        window["reserved_sources"].as_u64().unwrap()
    );
    let all = CatalogFilter::default();
    let mut formed = Value::Null;
    for _ in 0..200 {
        let Ok(page) = native.call_waiting(
            "main",
            &packet(json!({"operation":"page","filter":all,"cursor":null,"limit":100})),
        ) else {
            continue;
        };
        if let Some(item) = page["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["base"]["content"] == "I prefer green tea in the afternoon.")
        {
            formed = item.clone();
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert_eq!(
        formed["formation_reason"]["prompt_version"],
        connector_formation::PROMPT_VERSION,
        "{formed}"
    );
    assert_eq!(
        formed["formation_reason"]["model_version"],
        "gpt-synthetic-1"
    );
    assert_eq!(
        formed["formation_reason"]["note"],
        "Synthetic ChatGPT note."
    );
    let conversations = native
        .call_waiting(
            "main",
            &packet(json!({"operation":"conversations","cursor":null,"limit":50})),
        )
        .unwrap();
    assert!(
        conversations["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["conversation"]["account_scope"] == "chatgpt-connector-synthetic")
    );
    native.shutdown();
}
#[test]
fn agent_grants_plan_then_commit_and_keep_names_local() {
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
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
    let current = || std::fs::read(root.join("vault/CURRENT")).unwrap();
    let status = native
        .call("main", &packet(json!({"operation":"agent_status"})))
        .unwrap();
    assert_eq!(status["agents"][0]["key"], "claude_code");
    assert_eq!(status["agents"][0]["registered"], false);
    let before = current();
    let plan = native
        .call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"register"})),
        )
        .unwrap();
    assert_eq!(plan["max_sensitivity"], "private");
    assert_eq!(plan["allow_requests"], true);
    assert!(plan["sources"].as_u64().unwrap() > 0);
    assert_eq!(current(), before, "planning writes nothing");
    let committed = native
        .call(
            "main",
            &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]})),
        )
        .unwrap();
    assert_ne!(current(), before);
    let claude = &committed["agents"][0];
    assert_eq!(claude["registered"], true);
    assert_eq!(claude["grant"]["active"], true);
    assert_eq!(claude["grant"]["revision"], 1);
    assert_eq!(committed["agents"][1]["registered"], false);
    let local: Value =
        serde_json::from_slice(&std::fs::read(root.join("registered-agents.json")).unwrap())
            .unwrap();
    assert!(
        local.as_object().unwrap().values().next().unwrap()["claude_code"]["principal"].is_string()
    );
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]}))
        ),
        Err("grant_stale"),
        "a plan is committed once"
    );
    // ADR-MEM-168: a grant that already covers everything has nothing to add.
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"refresh"}))
        ),
        Err("grant_up_to_date")
    );
    let vault = native
        .0
        .state
        .lock()
        .unwrap()
        .library
        .as_ref()
        .unwrap()
        .vault
        .clone()
        .unwrap();
    connector_capture(
        &vault,
        "chatgpt-synthetic-later",
        &[("oolong", "m1"), ("night trains", "m3")],
    );
    let behind = native
        .call_waiting("main", &packet(json!({"operation":"agent_status"})))
        .unwrap();
    // ADR-MEM-170: the grant follows new windows, so nothing is left uncovered.
    assert_eq!(behind["agents"][0]["grant"]["follow_new_sources"], true);
    let coverage = &behind["agents"][0]["coverage"];
    assert_eq!(coverage["policies"], 0, "{coverage}");
    assert_eq!(coverage["sources"], 0, "{coverage}");
    assert_eq!(coverage["refreshable"], false);
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"refresh"}))
        ),
        Err("grant_up_to_date")
    );
    for (action, revision, active) in [("renew", 2, true), ("revoke", 3, false)] {
        let plan = native
            .call(
                "main",
                &packet(json!({"operation":"agent_plan","agent":"claude_code","action":action})),
            )
            .unwrap();
        let status = native
            .call(
                "main",
                &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]})),
            )
            .unwrap();
        assert_eq!(
            status["agents"][0]["grant"]["revision"], revision,
            "{action}"
        );
        assert_eq!(status["agents"][0]["grant"]["active"], active, "{action}");
        assert_eq!(
            status["agents"][0]["grant"]["follow_new_sources"], true,
            "{action} keeps following"
        );
    }
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"codex","action":"revoke"}))
        ),
        Err("catalog_invalid_request"),
        "an unregistered Agent has nothing to revoke"
    );
    native.shutdown();
}

#[test]
fn agent_requests_queue_names_ignores_locally_and_resolves_through_owner_actions() {
    use enouia_memory_contract::{
        common::{ActorRef, ActorType},
        ids::{PolicyId, RequestId},
    };
    use enouia_memory_host::automation::qualified_agent::QualifiedAgentHost;
    use enouia_memory_vault::automation::segmented::{
        AgentCorrectionRequest, AgentForgetRequest, SegmentedAgentScope,
    };
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let (root, vault) = {
        let state = native.0.state.lock().unwrap();
        let library = state.library.as_ref().unwrap();
        (library._root.clone(), library.vault.clone().unwrap())
    };
    let current = || std::fs::read(root.join("vault/CURRENT")).unwrap();
    // Agents may only cite Runtime-captured user statements: capture two
    // synthetic ChatGPT turns through the connector first.
    connector_capture(
        &vault,
        "chatgpt-synthetic-requests",
        &[("green tea", "m1"), ("quiet trains", "m3")],
    );
    let empty = native
        .call_waiting("main", &packet(json!({"operation":"agent_requests"})))
        .unwrap();
    assert_eq!(empty["items"], json!([]));
    let plan = native
        .call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"register"})),
        )
        .unwrap();
    native
        .call(
            "main",
            &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]})),
        )
        .unwrap();
    let local: Value =
        serde_json::from_slice(&std::fs::read(root.join("registered-agents.json")).unwrap())
            .unwrap();
    let claude = &local.as_object().unwrap().values().next().unwrap()["claude_code"];
    let principal = ActorRef {
        actor_type: ActorType::Agent,
        actor_id: serde_json::from_value(claude["principal"].clone()).unwrap(),
    };
    let grant_id: PolicyId = serde_json::from_value(claude["grant_id"].clone()).unwrap();
    let owner = vault.descriptor().created_by.clone();
    let grant = vault
        .owner_read_status(&owner)
        .unwrap()
        .grants
        .into_iter()
        .find(|g| g.grant_id == grant_id)
        .unwrap();
    let now =
        enouia_memory_contract::foundation::Clock::now_unix_ms(&enouia_memory_vault::SystemClock);
    let scope = SegmentedAgentScope {
        subject_id: grant.subject_id.clone(),
        project_id: None,
        policy_ids: grant.policies.iter().map(|r| r.policy_id.clone()).collect(),
        source_ids: grant.source_ids.clone(),
        max_sensitivity: Sensitivity::Private,
        source_read: true,
        valid_until: enouia_memory_contract::time::Timestamp::from_unix_ms(now + 120_000).unwrap(),
    };
    // ADR-MEM-170: a window captured after registration is covered at once.
    connector_capture(
        &vault,
        "chatgpt-synthetic-after-grant",
        &[("hot cocoa", "m1"), ("slow trains", "m3")],
    );
    let all = CatalogFilter::default();
    let mut page = Value::Null;
    for _ in 0..200 {
        if let Ok(next) = native.call_waiting(
            "main",
            &packet(json!({"operation":"page","filter":all,"cursor":null,"limit":100})),
        ) && next["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|i| {
                i["base"]["content"].as_str().is_some_and(|c| {
                    c.ends_with("prefer slow trains.") || c.ends_with("prefer green tea.")
                })
            })
            .count()
            == 2
        {
            page = next;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let cited = |content: &str| {
        let id = page["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["base"]["content"] == content)
            .unwrap_or_else(|| panic!("{content} not formed"))["base"]["memory"]["memory_id"]
            .clone();
        let detail = native
            .call(
                "main",
                &packet(json!({"operation":"detail","filter":all,"memory_id":id})),
            )
            .unwrap();
        let evidence = &detail["fields"]["evidence"][0];
        (
            serde_json::from_value::<TargetRef>(detail["history"][0]["memory"].clone()).unwrap(),
            enouia_memory_contract::common::SourceRevisionRef {
                source_id: serde_json::from_value(evidence["reference"]["source_id"].clone())
                    .unwrap(),
                source_revision: serde_json::from_value(
                    evidence["reference"]["source_revision"].clone(),
                )
                .unwrap(),
            },
            evidence["quote"].as_str().unwrap().to_owned(),
        )
    };
    let request_id = || {
        RequestId::from_random(enouia_memory_contract::ports::IdSource::random_16(
            &enouia_memory_vault::OsIdSource,
        ))
    };
    let host =
        QualifiedAgentHost::from_authenticated_initialized_owner(vault.clone(), owner.clone())
            .unwrap();
    let (target, source, quote_hint) = cited("I prefer green tea.");
    host.correction_reporter_with_owner_grant(&owner, principal.clone(), &grant_id, scope.clone())
        .unwrap()
        .submit(&AgentCorrectionRequest {
            request_id: request_id(),
            target,
            source,
            quote_hint,
            correction: "Synthetic proposed correction.".into(),
        })
        .unwrap();
    let (forget_target, source, quote_hint) = cited("I prefer slow trains.");
    host.forget_requester_with_owner_grant(&owner, principal, &grant_id, scope)
        .unwrap()
        .submit(&AgentForgetRequest {
            request_id: request_id(),
            target: forget_target.clone(),
            source,
            quote_hint,
            forget: "Synthetic forget reason.".into(),
        })
        .unwrap();
    drop(host);
    let queue = native
        .call("main", &packet(json!({"operation":"agent_requests"})))
        .unwrap();
    assert_eq!(queue["effect"], "native_read");
    let items = queue["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["kind"], "correction");
    assert_eq!(items[0]["agent"], "Claude Code");
    assert_eq!(items[0]["text"], "Synthetic proposed correction.");
    assert_eq!(items[1]["kind"], "forget");
    assert!(
        items
            .iter()
            .all(|i| i["pending"] == true && i["ignored"] == false)
    );
    // Ignoring is a local mark: the library does not change.
    let before = current();
    let ignored = native
        .call(
            "main",
            &packet(
                json!({"operation":"agent_request_ignore","key":items[0]["key"],"ignored":true}),
            ),
        )
        .unwrap();
    assert_eq!(ignored["effect"], "local_write");
    assert_eq!(ignored["items"][0]["ignored"], true);
    assert_eq!(current(), before);
    assert!(root.join("ignored-agent-requests.json").exists());
    // Acting on the forget request is an ordinary planned, confirmed forget.
    let plan = native
        .call("main", &packet(json!({"operation":"plan_action","action":{"action":"forget","target":forget_target,"impact_preview_hash":"0".repeat(64)},"correction":null})))
        .unwrap();
    native
        .call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]})))
        .unwrap();
    let after = native
        .call("main", &packet(json!({"operation":"agent_requests"})))
        .unwrap();
    assert_eq!(after["items"][1]["pending"], false);
    assert_eq!(after["items"][0]["pending"], true);
    // Memory ADR-MEM-184: a request under the ChatGPT connector's grant (its
    // purpose tag, no local registration) is named ChatGPT in the queue.
    let mut connector = grant.clone();
    connector.grant_id = PolicyId::from_random(enouia_memory_contract::ports::IdSource::random_16(
        &enouia_memory_vault::OsIdSource,
    ));
    connector.revision = enouia_memory_contract::json::Revision::new(1).unwrap();
    connector.principal.actor_id = enouia_memory_contract::ids::PrincipalId::from_random(
        enouia_memory_contract::ports::IdSource::random_16(&enouia_memory_vault::OsIdSource),
    );
    connector.purpose = Some("chatgpt_connector".into());
    let planned = vault
        .plan_owner_read_grant(&owner, connector.clone())
        .unwrap();
    vault.commit_owner_read_grant(&owner, &planned).unwrap();
    let (target, source, quote_hint) = cited("I prefer green tea.");
    let host =
        QualifiedAgentHost::from_authenticated_initialized_owner(vault.clone(), owner.clone())
            .unwrap();
    host.correction_reporter_with_owner_grant(
        &owner,
        connector.principal.clone(),
        &connector.grant_id,
        SegmentedAgentScope {
            subject_id: connector.subject_id.clone(),
            project_id: None,
            policy_ids: connector
                .policies
                .iter()
                .map(|r| r.policy_id.clone())
                .collect(),
            source_ids: connector.source_ids.clone(),
            max_sensitivity: Sensitivity::Private,
            source_read: true,
            valid_until: enouia_memory_contract::time::Timestamp::from_unix_ms(now + 120_000)
                .unwrap(),
        },
    )
    .unwrap()
    .submit(&AgentCorrectionRequest {
        request_id: request_id(),
        target,
        source,
        quote_hint,
        correction: "Synthetic connector correction.".into(),
    })
    .unwrap();
    drop(host);
    let queue = native
        .call("main", &packet(json!({"operation":"agent_requests"})))
        .unwrap();
    let from_chatgpt: Vec<&Value> = queue["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|i| i["text"] == "Synthetic connector correction.")
        .collect();
    assert_eq!(from_chatgpt.len(), 1);
    assert_eq!(from_chatgpt[0]["agent"], "ChatGPT");
    native.shutdown();
}

#[test]
fn review_suggestions_and_attention_schedule_forward_core_documents() {
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), false)
        })
        .unwrap();
    let all = CatalogFilter::default();
    let now =
        enouia_memory_contract::foundation::Clock::now_unix_ms(&enouia_memory_vault::SystemClock);
    let at = |ms: i64| enouia_memory_contract::time::Timestamp::from_unix_ms(ms).unwrap();
    let review = native
        .call(
            "main",
            &packet(json!({"operation":"review_suggestions","filter":all,"query":{"horizon_days":30},"limit":50})),
        )
        .unwrap();
    assert_eq!(review["kind"], "memory_review_suggestions");
    assert_eq!(review["effect"], "native_read");
    assert!(review["items"].is_array());
    let schedule = native
        .call(
            "main",
            &packet(json!({"operation":"attention_schedule","filter":all,"query":{"from":at(now),"until":at(now + 366 * 86_400_000)},"cursor":null,"limit":50})),
        )
        .unwrap();
    assert_eq!(schedule["kind"], "memory_attention_schedule");
    // Three fresh unprotected records: each fades and is archived later.
    let events = schedule["events"].as_array().unwrap();
    assert!(events.iter().all(|e| e["past"] == false));
    assert!(schedule["fade_after_days"].as_u64().unwrap() > 0);
    assert_eq!(
        native.call(
            "main",
            &packet(json!({"operation":"review_suggestions","filter":all,"query":{"horizon_days":91},"limit":50})),
        ),
        Err("catalog_read_refused"),
        "Core refuses a horizon beyond 90 days"
    );
    native.shutdown();
}

#[test]
fn registered_agent_connects_over_its_pipe_and_lock_cuts_it() {
    use enouia_memory_contract::workspace::HostSurface;
    use enouia_memory_host::{
        mcp::agent::native::Client,
        windows::{Pipe, ProcessPeer},
    };
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let plan = native
        .call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"register"})),
        )
        .unwrap();
    let status = native
        .call(
            "main",
            &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]})),
        )
        .unwrap();
    assert_eq!(status["bridge"]["protocol"], "automation-agent-v1");
    let pipe: enouia_memory_contract::hash::Sha256Hex =
        serde_json::from_value(status["agents"][0]["pipe"].clone()).unwrap();
    let vault: enouia_memory_contract::ids::VaultId =
        serde_json::from_value(status["vault_id"].clone()).unwrap();
    assert!(
        status["agents"][1]["pipe"].is_null(),
        "Codex is not registered"
    );
    let connect = || {
        for _ in 0..40 {
            if let Ok(pipe) = Pipe::connect(&pipe) {
                return pipe;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        panic!("pipe never listened");
    };
    let host = ProcessPeer::enroll(std::process::id(), HostSurface::QuickSearch).unwrap();
    let mut client =
        Client::connect(connect(), host, &vault, std::time::Duration::from_secs(10)).unwrap();
    client
        .exchange(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"synthetic","version":"1"}}}))
        .unwrap();
    client
        .exchange(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
        .unwrap();
    let tools = client
        .exchange(&json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}))
        .unwrap()
        .unwrap();
    let names: Vec<_> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_owned())
        .collect();
    for tool in [
        "memory_note",
        "memory_correction_report",
        "memory_forget_request",
    ] {
        assert!(names.iter().any(|n| n == tool), "{tool} in {names:?}");
    }
    // ADR-MEM-169: a second session of the same Agent connects at the same time.
    let mut second = Client::connect(
        connect(),
        ProcessPeer::enroll(std::process::id(), HostSurface::QuickSearch).unwrap(),
        &vault,
        std::time::Duration::from_secs(10),
    )
    .unwrap();
    assert!(
        second
            .exchange(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"synthetic-2","version":"1"}}}))
            .unwrap()
            .is_some()
    );
    // Locking releases the library: the listener stops and the connection ends.
    native.lock();
    std::thread::sleep(std::time::Duration::from_millis(600));
    assert!(
        client
            .exchange(&json!({"jsonrpc":"2.0","id":3,"method":"tools/list"}))
            .is_err()
    );
    assert!(
        second
            .exchange(&json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}))
            .is_err()
    );
    assert!(Pipe::connect(&pipe).is_err(), "no listener after lock");
    native.shutdown();
}

/// Two user turns captured through the ChatGPT connector, each yielding one
/// preference "I prefer {topic}."; every call opens or reuses a capture window.
fn connector_capture(
    vault: &Arc<enouia_memory_vault::automation::segmented::SegmentedAutomationVault>,
    conversation: &str,
    topics: &[(&str, &str); 2],
) {
    use enouia_memory_contract::{
        common::{ActorRef, ActorType, SpeakerRole},
        foundation::Clock,
        ids::RequestId,
        ports::IdSource,
    };
    use enouia_memory_host::automation::connector_formation::{
        ConnectorConfig, ConnectorStatement, ConnectorSubmission, ConnectorWriter,
    };
    let writer = ConnectorWriter::new(
        vault.clone(),
        vault.descriptor().created_by.clone(),
        ActorRef {
            actor_type: ActorType::Client,
            actor_id: enouia_memory_contract::ids::PrincipalId::from_random(
                enouia_memory_vault::OsIdSource.random_16(),
            ),
        },
        ConnectorConfig {
            account_scope: "chatgpt-connector-synthetic".into(),
            default_timezone: "Asia/Shanghai".into(),
            max_sensitivity: Sensitivity::Private,
            allowed_forms: vec![FormationKind::Preference],
            window_days: 30,
        },
    )
    .unwrap();
    let unknown = RecordTime {
        from: None,
        until: None,
        precision: RecordPrecision::Unknown,
        bound: TimeBound::Within,
        tz: None,
        basis: TimeBasis::Unknown,
    };
    let turn = |n: u32, speaker, text: String| RuntimeCaptureTurn {
        message_id: format!("m{n}"),
        parent_message_id: (n > 1).then(|| format!("m{}", n - 1)),
        branch_id: "main".into(),
        sequence: n,
        speaker,
        text,
        original_time: None,
        original_timezone: None,
        occurred_at: None,
        content_lang: "en".into(),
        assistant_model: None,
        attachments: vec![],
    };
    // ADR-MEM-171: each statement names one person card in this window.
    let statement = |m: &str, topic: &str| ConnectorStatement {
        entities: vec![
            enouia_memory_host::automation::connector_formation::ConnectorEntity {
                name: "Aiko".into(),
                entity_type: enouia_memory_contract::next::EntityType::Person,
                reality: enouia_memory_contract::next::EntityReality::Real,
                role: enouia_memory_contract::next::EntityRole::Participant,
            },
        ],
        message_id: m.into(),
        quote: format!("I prefer {topic}."),
        title: format!("I prefer {topic}"),
        interpretation: Interpretation::ClearSelfReport,
        kind: FormationKind::Preference,
        event_time: unknown.clone(),
        valid_time: unknown.clone(),
        note: None,
    };
    writer
        .submit(
            &ConnectorSubmission {
                request: RuntimeCaptureRequest {
                    schema_version: NextVersion,
                    kind: RuntimeCaptureKind::Capture,
                    capability: RuntimeCaptureCapability::OwnerV1,
                    request_id: RequestId::from_random(enouia_memory_vault::OsIdSource.random_16()),
                    conversation_id: conversation.into(),
                    title: None,
                    turns: vec![
                        turn(
                            1,
                            SpeakerRole::User,
                            format!("Synthetic turn: I prefer {}.", topics[0].0),
                        ),
                        turn(2, SpeakerRole::Assistant, "Synthetic reply.".into()),
                        turn(
                            3,
                            SpeakerRole::User,
                            format!("Synthetic turn: I prefer {}.", topics[1].0),
                        ),
                    ],
                },
                analyst_model: "gpt-synthetic-1".into(),
                statements: vec![
                    statement(topics[0].1, topics[0].0),
                    statement(topics[1].1, topics[1].0),
                ],
            },
            false,
            enouia_memory_vault::SystemClock.now_unix_ms(),
        )
        .unwrap();
}

#[test]
fn entity_identity_groups_and_a_confirmed_decision() {
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let vault = native
        .0
        .state
        .lock()
        .unwrap()
        .library
        .as_ref()
        .unwrap()
        .vault
        .clone()
        .unwrap();
    connector_capture(
        &vault,
        "chatgpt-synthetic-aiko-1",
        &[("green tea", "m1"), ("quiet trains", "m3")],
    );
    connector_capture(
        &vault,
        "chatgpt-synthetic-aiko-2",
        &[("oolong", "m1"), ("night trains", "m3")],
    );
    let mut groups = Value::Null;
    for _ in 0..200 {
        if let Ok(v) = native.call_waiting(
            "main",
            &packet(json!({"operation":"entity_identities","limit":50})),
        ) && v["groups"]
            .as_array()
            .is_some_and(|g| g.iter().any(|g| g["name"] == "Aiko"))
        {
            groups = v;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert_eq!(groups["kind"], "runtime_entity_identities");
    let group = &groups["groups"][0];
    assert_eq!(group["basis"], "same_name");
    let ids: Vec<Value> = group["records"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["entity_id"].clone())
        .collect();
    assert!(ids.len() >= 2);
    let decide = |entities: Vec<Value>, same: bool| {
        let plan = native
            .call("main", &packet(json!({"operation":"plan_action","action":{"action":"entity_identity","entities":entities,"same":same,"reason":null},"correction":null})))
            .unwrap();
        native
            .call("main", &packet(json!({"operation":"confirm_action","operation_id":plan["plan"]["operation_id"],"plan_hash":plan["plan_hash"],"effects_hash":plan["effects_hash"]})))
            .unwrap();
        native
            .call_waiting(
                "main",
                &packet(json!({"operation":"entity_identities","limit":50})),
            )
            .unwrap()
    };
    // Morii confirms the whole same-name group, then separates one card.
    let confirmed = decide(ids.clone(), true);
    assert_eq!(confirmed["groups"][0]["basis"], "confirmed", "{confirmed}");
    let separated = decide(vec![ids[0].clone(), ids[1].clone()], false);
    let all: Vec<&Value> = separated["groups"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|g| g["records"].as_array().unwrap())
        .collect();
    let first = all.iter().find(|r| r["entity_id"] == ids[0]).unwrap();
    assert_eq!(first["opted_out"], true, "{separated}");
    native.shutdown();
}

#[test]
fn concurrent_agent_sessions_all_connect() {
    use enouia_memory_contract::workspace::HostSurface;
    use enouia_memory_host::{
        mcp::agent::native::Client,
        windows::{Pipe, ProcessPeer},
    };
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let plan = native
        .call(
            "main",
            &packet(json!({"operation":"agent_plan","agent":"claude_code","action":"register"})),
        )
        .unwrap();
    let status = native
        .call(
            "main",
            &packet(json!({"operation":"agent_commit","plan_id":plan["plan_id"]})),
        )
        .unwrap();
    let pipe: enouia_memory_contract::hash::Sha256Hex =
        serde_json::from_value(status["agents"][0]["pipe"].clone()).unwrap();
    let vault: enouia_memory_contract::ids::VaultId =
        serde_json::from_value(status["vault_id"].clone()).unwrap();
    let mut failures = Vec::new();
    for round in 0..5 {
        let results: Vec<String> = std::thread::scope(|s| {
            let handles: Vec<_> = (0..2).map(|_| s.spawn(|| {
                let p = Pipe::connect(&pipe).map_err(|e| format!("connect {e:?}"))?;
                let host = ProcessPeer::enroll(std::process::id(), HostSurface::QuickSearch).map_err(|e| format!("peer {e:?}"))?;
                let mut c = Client::connect(p, host, &vault, std::time::Duration::from_secs(10)).map_err(|e| format!("client {e:?}"))?;
                c.exchange(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"s","version":"1"}}})).map_err(|e| format!("exchange {e:?}"))?;
                Ok::<_, String>(())
            })).collect();
            handles
                .into_iter()
                .map(|h| match h.join().unwrap() {
                    Ok(()) => "ok".into(),
                    Err(e) => e,
                })
                .collect()
        });
        for r in results {
            if r != "ok" {
                failures.push(format!("round {round}: {r}"));
            }
        }
    }
    assert!(failures.is_empty(), "{failures:?}");
    native.shutdown();
}

#[test]
fn capsules_stay_off_until_turned_on_then_save_list_and_delete() {
    let native = NativeCatalog::default();
    native
        .initialize_with(|stop| {
            fixture::create_with_clock(stop, Arc::new(enouia_memory_vault::SystemClock), true)
        })
        .unwrap();
    let all = CatalogFilter::default();
    let list = || {
        native
            .call("main", &packet(json!({"operation":"capsules"})))
            .unwrap()
    };
    let empty = list();
    assert_eq!(empty["saving_enabled"], false);
    assert_eq!(empty["capsules"], json!([]));
    let page = native
        .call(
            "main",
            &packet(json!({"operation":"page","filter":all,"cursor":null,"limit":2})),
        )
        .unwrap();
    let members: Vec<Value> = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| {
            native
                .call("main", &packet(json!({"operation":"detail","filter":all,"memory_id":i["base"]["memory"]["memory_id"]})))
                .unwrap()["history"][0]["memory"]
                .clone()
        })
        .collect();
    let plan = |members: &Vec<Value>| {
        native.call("main", &packet(json!({"operation":"plan_capsule","name":"Synthetic capsule","query":"pottery","members":members})))
    };
    assert_eq!(
        plan(&members),
        Err("capsule_saving_off"),
        "saving is off by default"
    );
    let on = native
        .call(
            "main",
            &packet(json!({"operation":"capsule_saving","enabled":true})),
        )
        .unwrap();
    assert_eq!(on["saving_enabled"], true);
    let confirm = |preview: Value| {
        native
            .call("main", &packet(json!({"operation":"confirm_action","operation_id":preview["plan"]["operation_id"],"plan_hash":preview["plan_hash"],"effects_hash":preview["effects_hash"]})))
            .unwrap()
    };
    confirm(plan(&members).unwrap());
    let saved = list();
    assert_eq!(saved["capsules"][0]["name"], "Synthetic capsule");
    assert_eq!(saved["capsules"][0]["query"], "pottery");
    assert_eq!(
        saved["capsules"][0]["members"].as_array().unwrap().len(),
        members.len()
    );
    assert!(saved["capsules"][0]["members"][0]["current"].is_object());
    confirm(plan(&vec![]).unwrap());
    assert_eq!(list()["capsules"], json!([]), "an empty save deletes it");
    native.shutdown();
}
