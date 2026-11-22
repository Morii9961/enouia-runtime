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
    for (action, revision, active) in [
        ("renew", 2, true),
        ("refresh", 3, true),
        ("revoke", 4, false),
    ] {
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
