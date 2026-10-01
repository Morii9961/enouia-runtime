//! Development-only hard-kill target for marked synthetic store roots.
#[cfg(windows)]
mod windows {
    use enouia_activity_contract::{normalize_batch, public_data_bytes, sha256_hex};
    use enouia_activity_store::WindowsActivityLock;
    use enouia_activity_store::generation::GenerationImage;
    use enouia_activity_store::legacy_import::{ImportOptions, import_legacy_trio};
    use enouia_activity_store::pause::set_paused_locked;
    use enouia_activity_store::reader::read_current;
    use enouia_activity_store::recovery::{RecoveryError, audit_generations};
    use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
    use enouia_activity_store::writer::{
        CommitPhase, PublicationEvidence, commit, commit_publication_observed_with_hook,
        commit_with_hook,
    };
    use enouia_common::{FakeClock, LockProvider};
    use serde_json::{Value, json};
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    const ORACLE: &str = include_str!("../../../tests/fixtures/activity/moriium-oracle-input.json");
    fn clock() -> FakeClock {
        FakeClock::new(1_790_409_601_000)
    }
    fn guarded_root(argument: &str) -> Result<PathBuf, ()> {
        let path = Path::new(argument);
        if !path.is_absolute() {
            return Err(());
        }
        let root = fs::canonicalize(path).map_err(|_| ())?;
        let base = root.parent().ok_or(())?;
        if base.parent()
            != Some(
                fs::canonicalize(std::env::temp_dir())
                    .map_err(|_| ())?
                    .as_path(),
            )
            || !base
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("enouia-store-crash-"))
            || fs::read(base.join("ACTIVITY_SANDBOX_FIXTURE")).map_err(|_| ())?
                != b"enouia-activity-hard-kill-v1"
            || !root.file_name().is_some_and(|name| {
                name.to_str()
                    .and_then(|name| name.strip_prefix("case-"))
                    .is_some_and(|suffix| {
                        !suffix.is_empty() && suffix.bytes().all(|value| value.is_ascii_digit())
                    })
            })
        {
            return Err(());
        }
        Ok(root)
    }
    fn candidate(sequence: u64, delivery: Vec<u8>) -> Result<GenerationImage, ()> {
        let mut raw: Value = serde_json::from_str(ORACLE).map_err(|_| ())?;
        raw["sequence"] = json!(sequence);
        let batch = normalize_batch(&raw, &clock()).map_err(|_| ())?;
        let mut pending = serde_json::to_vec(&batch).map_err(|_| ())?;
        pending.push(b'\n');
        Ok(GenerationImage {
            activity: public_data_bytes(&batch.data).map_err(|_| ())?,
            sequence: format!("{{\"sequence\":{sequence}}}\n").into_bytes(),
            pending: Some(pending),
            delivery,
        })
    }
    fn recovery_code(error: &RecoveryError) -> &'static str {
        match error {
            RecoveryError::HigherReservedSequence => "higher_reserved_sequence",
            RecoveryError::ConflictingGeneration => "conflicting_generation",
            _ => "invalid_recovery",
        }
    }
    fn phase_name(phase: CommitPhase) -> String {
        match phase {
            CommitPhase::FileFlushed(name) => format!("flushed:{name}"),
            CommitPhase::GenerationPublished => "generation_published".to_owned(),
            CommitPhase::CurrentPrepared => "current_prepared".to_owned(),
            CommitPhase::CurrentSwitched => "current_switched".to_owned(),
        }
    }
    fn emit(value: &Value) -> Result<(), ()> {
        let mut output = std::io::stdout().lock();
        serde_json::to_writer(&mut output, value).map_err(|_| ())?;
        output.write_all(b"\n").map_err(|_| ())?;
        output.flush().map_err(|_| ())
    }
    fn inspect(root: &Path) -> Result<Value, ()> {
        let guard = match WindowsActivityLock.try_acquire(&root.join("sync.lock")) {
            Ok(guard) => guard,
            Err(_) => return Ok(json!({"state":"lock_unavailable"})),
        };
        let current = read_current(root, &clock()).map_err(|_| ())?;
        let audit = audit_generations(root, &clock());
        let audit_value = match &audit {
            Ok(value) => {
                json!({"state":"passed","olderGenerations":value.older_generations,"stagingDirectories":value.staging_directories})
            }
            Err(error) => json!({"state":recovery_code(error)}),
        };
        let decision = match decide_run_start(&guard, &clock()) {
            Ok(RunDecision::Collect { next_sequence, .. }) => {
                json!({"state":"collect","nextSequence":next_sequence})
            }
            Ok(RunDecision::RetryPending {
                sequence,
                exact_bytes,
                ..
            }) => {
                json!({"state":"retry_pending","sequence":sequence,"sha256":sha256_hex(&exact_bytes)})
            }
            Ok(RunDecision::Paused {
                pending_sequence, ..
            }) => json!({"state":"paused","sequence":pending_sequence}),
            Err(RunStartError::Recovery(error)) => {
                json!({"state":"blocked","reason":recovery_code(&error)})
            }
            Err(_) => return Err(()),
        };
        Ok(
            json!({"state":"inspected","generation":current.id,"sequence":current.validated.highest_reserved,"archiveSha256":sha256_hex(&current.image.activity),"pendingSha256":current.image.pending.as_ref().map(|bytes|sha256_hex(bytes)),"deliverySha256":sha256_hex(&current.image.delivery),"audit":audit_value,"decision":decision}),
        )
    }
    fn invoke() -> Result<Value, ()> {
        let args: Vec<String> = std::env::args().skip(1).collect();
        let command = args.first().ok_or(())?;
        let root = guarded_root(args.get(1).ok_or(())?)?;
        if command == "inspect" && args.len() == 2 {
            return inspect(&root);
        }
        let guard = WindowsActivityLock
            .try_acquire(&root.join("sync.lock"))
            .map_err(|_| ())?;
        match command.as_str() {
            "prepare" if args.len() == 3 => {
                let kind = &args[2];
                if !["new_batch", "pause", "acknowledge"].contains(&kind.as_str()) {
                    return Err(());
                }
                let seed = root.parent().ok_or(())?.join(format!(
                    "seed-{}",
                    root.file_name().ok_or(())?.to_string_lossy()
                ));
                fs::create_dir(&seed).map_err(|_| ())?;
                fs::write(
                    seed.join("activity.json"),
                    b"{\"version\":1,\"sources\":{\"github\":null,\"codex\":null,\"claude\":null}}",
                )
                .map_err(|_| ())?;
                fs::write(seed.join("sequence.json"), b"{\"sequence\":0}").map_err(|_| ())?;
                import_legacy_trio(
                    &guard,
                    &seed,
                    "g-0-seed",
                    &ImportOptions {
                        reconciled_high_water: 0,
                        verified_unused_identity: true,
                    },
                    &clock(),
                )
                .map_err(|_| ())?;
                set_paused_locked(&guard, &clock(), "g-0-resumed", false).map_err(|_| ())?;
                if kind != "new_batch" {
                    let image = candidate(1, b"{\"paused\":false}\n".to_vec())?;
                    commit(&guard, "g-0-resumed", "g-1-pending", &image, &clock())
                        .map_err(|_| ())?;
                }
                drop(guard);
                let mut result = inspect(&root)?;
                let expected = candidate(1, b"{\"paused\":false}\n".to_vec())?;
                result["candidatePendingSha256"] =
                    json!(sha256_hex(expected.pending.as_ref().ok_or(())?));
                result["candidateArchiveSha256"] = json!(sha256_hex(&expected.activity));
                Ok(result)
            }
            "interrupt" if args.len() == 4 => {
                let kind = &args[2];
                let stop_at = &args[3];
                let current = read_current(&root, &clock()).map_err(|_| ())?;
                let mut hook = |phase| {
                    if phase_name(phase) == *stop_at {
                        if emit(&json!({"state":"ready_to_kill","kind":kind,"phase":stop_at,"pid":std::process::id()})).is_err() {
                        return Err(());
                    }
                        loop {
                            std::thread::park();
                        }
                    }
                    Ok(())
                };
                match kind.as_str() {
                    "new_batch" => commit_with_hook(
                        &guard,
                        &current.id,
                        "g-1-crash",
                        &candidate(1, current.image.delivery.clone())?,
                        &clock(),
                        &mut hook,
                    )
                    .map_err(|_| ())?,
                    "pause" => {
                        let mut image = current.image;
                        image.delivery = b"{\"paused\":true}\n".to_vec();
                        commit_with_hook(
                            &guard,
                            &current.id,
                            "g-1-crash",
                            &image,
                            &clock(),
                            &mut hook,
                        )
                        .map_err(|_| ())?;
                    }
                    "acknowledge" => {
                        let bytes = current.image.pending.as_ref().ok_or(())?;
                        let evidence = PublicationEvidence {
                            origin: "http://127.0.0.1".to_owned(),
                            sequence: 1,
                            exact_pending_sha256: sha256_hex(bytes),
                            manifest_sha256: "a".repeat(64),
                            activity_sha256: sha256_hex(&current.image.activity),
                            generated_at_ms: 1_790_409_601_000,
                            published_at_ms: 1_790_409_601_000,
                            received_at_ms: 1_790_409_601_000,
                        };
                        commit_publication_observed_with_hook(
                            &guard,
                            &current.id,
                            "g-1-crash",
                            &evidence,
                            &clock(),
                            &mut hook,
                        )
                        .map_err(|_| ())?;
                    }
                    _ => return Err(()),
                }
                Err(()) // Requested boundary must be reached and killed, never return normally.
            }
            "advance" if args.len() == 2 => {
                match decide_run_start(&guard, &clock()) {
                    Ok(RunDecision::Collect {
                        generation_id,
                        next_sequence,
                        ..
                    }) => {
                        let image = candidate(
                            next_sequence,
                            read_current(&root, &clock())
                                .map_err(|_| ())?
                                .image
                                .delivery,
                        )?;
                        commit(&guard, &generation_id, "g-1-after", &image, &clock())
                            .map_err(|_| ())?;
                    }
                    Err(RunStartError::Recovery(_))
                    | Ok(RunDecision::RetryPending { .. } | RunDecision::Paused { .. }) => {}
                    Err(_) => return Err(()),
                }
                drop(guard);
                inspect(&root)
            }
            _ => Err(()),
        }
    }
    pub fn run() -> std::process::ExitCode {
        match invoke() {
            Ok(value) if emit(&value).is_ok() => std::process::ExitCode::SUCCESS,
            _ => std::process::ExitCode::from(5),
        }
    }
}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    windows::run()
}

#[cfg(not(windows))]
fn main() -> std::process::ExitCode {
    std::process::ExitCode::from(5)
}
