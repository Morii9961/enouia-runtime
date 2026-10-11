use crate::collectors::LocalCollector;
use crate::config::{Config, read_config};
use crate::run::{Command, DeadlineCancellation, Ports, SystemClock, generation_id, run_locked};
use enouia_activity_delivery::curl_fetch::CurlPublicFetcher;
use enouia_activity_delivery::public_fetch::{FetchError, FetchedResponse, PublicFetcher};
use enouia_activity_store::legacy_export::export_legacy_trio;
use enouia_activity_store::legacy_import::{ImportError, ImportOptions, import_legacy_trio};
use enouia_activity_store::legacy_inspect::{compare_archives, inspect_legacy_trio};
use enouia_activity_store::overview::{read_activity_status, read_delivery_overview_locked};
use enouia_activity_store::pause::set_paused_locked;
use enouia_activity_store::reconcile::{
    AbandonError, GenerationEvidence, RetractError, abandon_pending_locked,
    inspect_recovery_locked, retract_unselected_locked, standing_name, valid_manifest_sha256,
};
use enouia_activity_store::recovery::RecoveryError;
use enouia_activity_store::writer::{AbandonEvidence, CommitError};
use enouia_activity_store::{ActivityLockGuard, WindowsActivityLock};
use enouia_common::{Cancellation, Clock, ComponentId, ErrorCode, LockProvider};
use enouia_windows_process::WindowsProcessRunner;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

struct Parsed {
    name: String,
    paused: Option<bool>,
    options: BTreeMap<String, OsString>,
}

fn parse(args: &[OsString]) -> Option<Parsed> {
    let name = args.first()?.to_str()?.to_owned();
    let allowed: &[&str] = match name.as_str() {
        "diagnostics" | "sync" | "retry-pending" | "set-paused" | "overview" | "preview"
        | "recovery-inspect" => &["--config"],
        "pending-abandon" => &[
            "--config",
            "--sequence",
            "--pending-sha256",
            "--confirm-refused",
            "--reserve-through",
        ],
        "recovery-retract" => &[
            "--config",
            "--generation",
            "--manifest-sha256",
            "--confirm-never-selected",
        ],
        "migration-inspect" => &["--input", "--output", "--against"],
        "migration-import" => &["--bundle", "--config", "--high-water", "--verified-unused"],
        "migration-export-legacy" => &["--config", "--output"],
        _ => return None,
    };
    let mut index = 1;
    let paused = if name == "set-paused" {
        index += 1;
        Some(args.get(1)?.to_str()?.parse::<bool>().ok()?)
    } else {
        None
    };
    let mut options = BTreeMap::new();
    while index < args.len() {
        let key = args[index].to_str()?;
        if !allowed.contains(&key)
            || options
                .insert(key.to_owned(), args.get(index + 1)?.clone())
                .is_some()
        {
            return None;
        }
        index += 2;
    }
    Some(Parsed {
        name,
        paused,
        options,
    })
}

impl Parsed {
    fn text(&self, key: &str) -> Result<&str, (u8, Value)> {
        self.options
            .get(key)
            .and_then(|value| value.to_str())
            .ok_or_else(|| failure(5, "invalid_arguments"))
    }

    fn path(&self, key: &str) -> Result<PathBuf, (u8, Value)> {
        self.options
            .get(key)
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .ok_or_else(|| failure(5, "invalid_arguments"))
    }
}

fn failure(code: u8, state: &'static str) -> (u8, Value) {
    (
        code,
        json!({"schemaVersion":1,"state":state,"exitCode":code}),
    )
}

fn lock(config: &Config) -> Result<ActivityLockGuard, (u8, Value)> {
    WindowsActivityLock
        .try_acquire(&config.data_root.join("sync.lock"))
        .map_err(|error| {
            if error.code == ErrorCode::Busy {
                failure(3, "busy")
            } else {
                failure(6, "storage_failed")
            }
        })
}

struct DisabledFetcher;
impl PublicFetcher for DisabledFetcher {
    fn fetch(
        &self,
        _: &str,
        _: usize,
        _: Duration,
        _: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError> {
        Err(FetchError::Unavailable)
    }
}

fn write_report(destination: &Path, source: &Path, report: &Value) -> Result<(), (u8, Value)> {
    let parent = destination
        .parent()
        .and_then(|p| fs::canonicalize(p).ok())
        .ok_or_else(|| failure(6, "invalid_destination"))?;
    let source = fs::canonicalize(source).map_err(|_| failure(6, "invalid_source"))?;
    if parent.starts_with(&source) {
        return Err(failure(6, "invalid_destination"));
    }
    let mut bytes = serde_json::to_vec(report).map_err(|_| failure(6, "report_failed"))?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|_| failure(6, "report_failed"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| failure(6, "report_failed"))
}

fn execute(args: &Parsed) -> Result<(u8, Value), (u8, Value)> {
    let clock = SystemClock;
    if args.name == "migration-inspect" {
        let source = args.path("--input")?;
        let output = args.path("--output")?;
        let inspected =
            inspect_legacy_trio(&source, &clock).map_err(|_| failure(6, "migration_invalid"))?;
        let comparison = if args.options.contains_key("--against") {
            let baseline = inspect_legacy_trio(&args.path("--against")?, &clock)
                .map_err(|_| failure(6, "migration_invalid"))?;
            Some(
                compare_archives(&baseline.archive, &inspected.archive)
                    .map_err(|_| failure(6, "migration_invalid"))?,
            )
        } else {
            None
        };
        let report = json!({"schemaVersion":1,"state":"legacy_inspected","exitCode":0,
            "highestReserved":inspected.highest_reserved,"pendingSequence":inspected.pending.map(|p| p.sequence),
            "rawArchiveSha256":inspected.raw_archive_sha256,"rawSequenceSha256":inspected.raw_sequence_sha256,
            "unpublishableSuccessTimes":inspected.unpublishable_success_times,"activitySha256":enouia_activity_contract::sha256_hex(&inspected.canonical_archive_bytes),"pendingSha256":inspected.pending_sha256,
            "sources":{"github":source_inventory(&inspected.archive.sources.github),"codex":source_inventory(&inspected.archive.sources.codex),
                "claude":source_inventory(&inspected.archive.sources.claude)},"comparison":comparison});
        write_report(&output, &source, &report)?;
        return Ok((0, report));
    }
    let config = read_config(&args.path("--config")?).map_err(|_| failure(5, "invalid_config"))?;
    if args.name == "overview" || args.name == "preview" {
        // Read-only and lock-free, so a scheduled run is never made busy.
        let unavailable = |code| {
            (
                6,
                crate::ipc::error(code, ComponentId::ActivityArchive, true),
            )
        };
        let status = read_activity_status(&config.data_root, &clock)
            .map_err(|_| unavailable(ErrorCode::StorageFailed))?;
        let value = if args.name == "overview" {
            crate::ipc::overview(&status, &config, clock.now_unix_ms())
        } else {
            crate::ipc::preview(&status).ok_or_else(|| unavailable(ErrorCode::ContractInvalid))?
        };
        return Ok((0, value));
    }
    // Validate command options before acquiring a lock or mutating the root.
    let import_options = if args.name == "migration-import" {
        let reconciled_high_water = args
            .options
            .get("--high-water")
            .and_then(|v| v.to_str())
            .and_then(|v| v.parse::<u64>().ok())
            .ok_or_else(|| failure(5, "invalid_arguments"))?;
        let verified_unused_identity = match args.options.get("--verified-unused") {
            None => false,
            Some(value) => value
                .to_str()
                .and_then(|v| v.parse::<bool>().ok())
                .ok_or_else(|| failure(5, "invalid_arguments"))?,
        };
        Some(ImportOptions {
            reconciled_high_water,
            verified_unused_identity,
        })
    } else {
        None
    };
    let bundle = if args.name == "migration-import" {
        Some(args.path("--bundle")?)
    } else {
        None
    };
    let output = if args.name == "migration-export-legacy" {
        Some(args.path("--output")?)
    } else {
        None
    };
    // The operator names one generation, its exact manifest hash and the
    // never-selected confirmation before anything is locked or read.
    let retraction = if args.name == "recovery-retract" {
        let generation = args.text("--generation")?;
        let manifest = args.text("--manifest-sha256")?;
        if args.text("--confirm-never-selected")? != "true" || !valid_manifest_sha256(manifest) {
            return Err(failure(5, "invalid_arguments"));
        }
        Some((generation, manifest))
    } else {
        None
    };
    // Abandonment names the exact pending batch and an explicit confirmation
    // before anything is locked or read (ADR-033).
    let abandonment = if args.name == "pending-abandon" {
        let number = |key: &str| {
            args.text(key).and_then(|value| {
                value
                    .parse::<u64>()
                    .ok()
                    .filter(|n| *n > 0 && *n <= enouia_activity_contract::MAX_SAFE_INTEGER)
                    .ok_or_else(|| failure(5, "invalid_arguments"))
            })
        };
        let sequence = number("--sequence")?;
        let reserved_through = if args.options.contains_key("--reserve-through") {
            number("--reserve-through")?
        } else {
            sequence
        };
        let hash = args.text("--pending-sha256")?;
        if args.text("--confirm-refused")? != "true"
            || !valid_manifest_sha256(hash)
            || reserved_through < sequence
        {
            return Err(failure(5, "invalid_arguments"));
        }
        Some(AbandonEvidence {
            sequence,
            exact_pending_sha256: hash.to_owned(),
            reserved_through,
        })
    } else {
        None
    };
    let guard = lock(&config)?;
    match args.name.as_str() {
        "pending-abandon" => {
            let evidence = abandonment
                .as_ref()
                .ok_or_else(|| failure(5, "invalid_arguments"))?;
            match abandon_pending_locked(&guard, &clock, &generation_id(), evidence) {
                Ok(record) => Ok((
                    0,
                    json!({"schemaVersion":1,"state":"pending_abandoned","exitCode":0,
                    "sequence":evidence.sequence,"highestReserved":record["highestReserved"],
                    "nextSequence":record["nextSequence"],"record":record}),
                )),
                Err(AbandonError::RecordFailed(record)) => Err((
                    6,
                    json!({"schemaVersion":1,"state":"abandoned_record_failed","exitCode":6,
                    "sequence":evidence.sequence,"record":record}),
                )),
                Err(AbandonError::Commit(CommitError::NotPaused)) => Err(failure(6, "not_paused")),
                Err(AbandonError::Commit(CommitError::InvalidEvidence)) => {
                    Err(failure(6, "pending_mismatch"))
                }
                Err(AbandonError::Commit(CommitError::Recovery(error))) => {
                    Err(recovery_failure(&error))
                }
                Err(AbandonError::Commit(CommitError::Current(error))) => {
                    Err(recovery_failure(&RecoveryError::Current(error)))
                }
                Err(AbandonError::Commit(_)) => Err(failure(6, "storage_failed")),
            }
        }
        "recovery-inspect" => {
            let inspection = inspect_recovery_locked(&guard, &clock)
                .map_err(|error| recovery_failure(&error))?;
            let current = &inspection.current;
            Ok((
                0,
                json!({"schemaVersion":1,"state":"recovery_inspected","exitCode":0,
                "writable":inspection.blocking.is_empty(),
                "current":{"id":current.id,"manifestSha256":current.manifest_sha256,
                    "highestReserved":current.highest_reserved,"pendingSequence":current.pending_sequence},
                "olderGenerations":inspection.older_generations,
                "stagingDirectories":inspection.staging_directories,
                "blocking":inspection.blocking.iter().map(generation_json).collect::<Vec<_>>()}),
            ))
        }
        "recovery-retract" => {
            let (generation, manifest) =
                retraction.ok_or_else(|| failure(5, "invalid_arguments"))?;
            match retract_unselected_locked(&guard, &clock, generation, manifest) {
                Ok(retracted) => Ok((
                    0,
                    json!({"schemaVersion":1,"state":"generation_retracted","exitCode":0,
                    "writable":retracted.writable,"remainingBlocking":retracted.remaining_blocking,
                    "record":retracted.record}),
                )),
                Err(RetractError::RecordFailed(retracted)) => Err((
                    6,
                    json!({"schemaVersion":1,"state":"retracted_record_failed","exitCode":6,
                    "writable":retracted.writable,"remainingBlocking":retracted.remaining_blocking,
                    "record":retracted.record}),
                )),
                Err(RetractError::Recovery(error)) => Err(recovery_failure(&error)),
                Err(RetractError::InvalidGenerationId) => Err(failure(5, "invalid_arguments")),
                Err(RetractError::NotRetractable) => Err(failure(6, "not_retractable")),
                Err(RetractError::ManifestMismatch) => Err(failure(6, "manifest_mismatch")),
                Err(RetractError::StagingOccupied) => Err(failure(6, "staging_occupied")),
                Err(RetractError::Io) => Err(failure(6, "storage_failed")),
            }
        }
        "diagnostics" => {
            let overview = read_delivery_overview_locked(&guard, &clock)
                .map_err(|_| failure(6, "storage_failed"))?;
            let pending = overview.pending.map(|p| json!({"sequence":p.sequence,"exactPendingSha256":p.exact_pending_sha256,"ageMs":p.age_ms,"retry":p.retry}));
            let abandoned = overview.abandoned.map(|a| {
                json!({"sequence":a.sequence,"exactPendingSha256":a.exact_pending_sha256,
                "reservedThrough":a.reserved_through,"abandonedAtMs":a.abandoned_at_ms})
            });
            Ok((
                0,
                json!({"schemaVersion":1,"state":"diagnostics","exitCode":0,"paused":overview.paused,
                "deliveryEnabled":config.delivery_enabled,"pending":pending,"pendingAbandoned":abandoned,
                "toolsPresent":{"github":config.github.as_ref().is_some_and(|c| c.executable.is_file()),
                    "codex":config.codex.as_ref().is_some_and(|c| c.executable.is_file()),
                    "claude":config.claude.as_ref().is_some_and(|c| c.node_executable.is_file() && c.ccusage_cli.is_file()),
                    "ssh":config.delivery.as_ref().is_some_and(|c| c.ssh_executable.is_file()),
                    "curl":config.delivery.as_ref().is_some_and(|c| c.curl_executable.is_file())}}),
            ))
        }
        "set-paused" => {
            let paused = args.paused.ok_or_else(|| failure(5, "invalid_arguments"))?;
            set_paused_locked(&guard, &clock, &generation_id(), paused)
                .map_err(|_| failure(6, "storage_failed"))?;
            Ok((
                0,
                json!({"schemaVersion":1,"state":"pause_updated","exitCode":0,"paused":paused}),
            ))
        }
        "migration-import" => {
            let summary = import_legacy_trio(
                &guard,
                bundle
                    .as_deref()
                    .ok_or_else(|| failure(5, "invalid_arguments"))?,
                &generation_id(),
                import_options
                    .as_ref()
                    .ok_or_else(|| failure(5, "invalid_arguments"))?,
                &clock,
            )
            .map_err(|error| match error {
                ImportError::UnpublishableSuccessTime => failure(6, "unpublishable_history"),
                _ => failure(6, "migration_invalid"),
            })?;
            Ok((
                0,
                json!({"schemaVersion":1,"state":"legacy_imported_paused","exitCode":0,"highestReserved":summary.highest_reserved,
                "legacyHighWater":summary.legacy_high_water,"rawArchiveSha256":summary.raw_archive_sha256,"rawSequenceSha256":summary.raw_sequence_sha256,
                "activitySha256":summary.activity_sha256,"pendingSha256":summary.pending_sha256}),
            ))
        }
        "migration-export-legacy" => {
            let summary = export_legacy_trio(
                &guard,
                output
                    .as_deref()
                    .ok_or_else(|| failure(5, "invalid_arguments"))?,
                &clock,
            )
            .map_err(|_| failure(6, "export_failed"))?;
            Ok((
                0,
                json!({"schemaVersion":1,"state":"legacy_exported","exitCode":0,"highestReserved":summary.highest_reserved,
                "activitySha256":summary.activity_sha256,"sequenceSha256":summary.sequence_sha256,"pendingSha256":summary.pending_sha256}),
            ))
        }
        "sync" | "retry-pending" => {
            let command = if args.name == "sync" {
                Command::Sync
            } else {
                Command::RetryPending
            };
            let cancellation = DeadlineCancellation::new(config.max_run_seconds);
            let collector = LocalCollector { config: &config };
            let process = WindowsProcessRunner::new(ComponentId::ActivityDelivery);
            let result = if let Some(d) = &config.delivery {
                let fetcher = CurlPublicFetcher {
                    executable: &d.curl_executable,
                    runner: &process,
                };
                run_locked(
                    &guard,
                    &config,
                    command,
                    &Ports {
                        clock: &clock,
                        collector: &collector,
                        process: &process,
                        fetcher: &fetcher,
                        cancellation: &cancellation,
                    },
                )
            } else {
                run_locked(
                    &guard,
                    &config,
                    command,
                    &Ports {
                        clock: &clock,
                        collector: &collector,
                        process: &process,
                        fetcher: &DisabledFetcher,
                        cancellation: &cancellation,
                    },
                )
            };
            Ok((
                result.exit_code,
                serde_json::to_value(result).map_err(|_| failure(6, "report_failed"))?,
            ))
        }
        _ => Err(failure(5, "invalid_arguments")),
    }
}

/// Machine-readable output contains no private paths, raw reports or subprocess
/// stderr. Diagnostics probes file presence only, never an authenticated source.
pub fn invoke(args: &[OsString]) -> (u8, Value) {
    if args.len() == 1 && args[0] == "--help" {
        return (
            0,
            json!({"schemaVersion":1,"state":"help","commands":["diagnostics","overview","preview","sync","retry-pending","set-paused","migration-inspect","migration-import","migration-export-legacy","recovery-inspect","recovery-retract","pending-abandon"]}),
        );
    }
    let Some(args) = parse(args) else {
        return failure(5, "invalid_arguments");
    };
    match execute(&args) {
        Ok(result) | Err(result) => result,
    }
}

fn source_inventory(snapshot: &Option<enouia_activity_contract::Snapshot>) -> Value {
    match snapshot {
        None => Value::Null,
        Some(s) => json!({"updatedAt":s.updated_at,"recordedDays":s.days.len(),
            "total":s.days.iter().map(|d| d.value).sum::<u64>(),
            "firstDate":s.days.first().map(|d| &d.date),"lastDate":s.days.last().map(|d| &d.date)}),
    }
}

/// Recovery failures name the blocking class but never a path.
fn recovery_failure(error: &RecoveryError) -> (u8, Value) {
    let reason = match error {
        RecoveryError::Current(_) => "current_unreadable",
        RecoveryError::InvalidEntry => "invalid_entry",
        _ => "storage_failed",
    };
    (
        6,
        json!({"schemaVersion":1,"state":"recovery_unavailable","exitCode":6,"reason":reason}),
    )
}

fn generation_json(generation: &GenerationEvidence) -> Value {
    json!({"id":generation.id,"standing":standing_name(&generation.standing),
        "manifestSha256":generation.manifest_sha256,"highestReserved":generation.highest_reserved,
        "pendingSequence":generation.pending_sequence,"pendingSha256":generation.pending_sha256,
        "preparedPointer":generation.prepared_pointer.as_str()})
}
