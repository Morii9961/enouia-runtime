//! One locked generation commit with an immutable directory and pointer switch.

use crate::ActivityLockGuard;
use crate::generation::{
    ABANDON_REASON, GenerationError, GenerationImage, ValidatedGeneration, paused_from_delivery,
};
use crate::reader::{MAX_CURRENT_BYTES, ReadError, read_current, read_file};
use crate::recovery::{RecoveryError, audit_generations};
use enouia_activity_contract::{
    ActivityData, MAX_SAFE_INTEGER, Snapshot, activity_timestamp_ms, public_data_bytes, sha256_hex,
};
use enouia_common::Clock;
use serde_json::{Value, json};
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows_sys::Win32::Storage::FileSystem::{
    MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommitPhase {
    FileFlushed(&'static str),
    GenerationPublished,
    CurrentPrepared,
    CurrentSwitched,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitError {
    Current(ReadError),
    Recovery(RecoveryError),
    PostSwitchValidation(ReadError),
    StaleGeneration,
    InvalidNext(GenerationError),
    InvalidTransition,
    InvalidEvidence,
    Io,
    SwitchFailed,
    InterruptedBeforeSwitch,
    InterruptedAfterSwitch,
    NotPaused,
}

/// Evidence supplied by the trusted origin-bound public observer. The store
/// rechecks local identity and hashes before allowing the pending transition.
pub struct PublicationEvidence {
    pub origin: String,
    pub sequence: u64,
    pub exact_pending_sha256: String,
    pub manifest_sha256: String,
    pub activity_sha256: String,
    pub generated_at_ms: i64,
    pub published_at_ms: i64,
    pub received_at_ms: i64,
}

/// An operator's confirmation that the publisher refused one pending batch,
/// or that the receiver already holds an equal or higher sequence (ADR-033).
pub struct AbandonEvidence {
    pub sequence: u64,
    pub exact_pending_sha256: String,
    /// A new highest reserved sequence, at least the current one. `None`
    /// keeps the current reservation, which an import may have set above
    /// the pending sequence.
    pub reserved_through: Option<u64>,
}

/// What may clear a pending batch: observed publication or abandonment.
#[derive(Clone, Copy)]
enum PendingClear<'a> {
    Published(&'a PublicationEvidence),
    Abandoned(&'a AbandonEvidence),
}

fn history_retained(old: &Option<Snapshot>, next: &Option<Snapshot>) -> bool {
    let Some(old) = old else {
        return true;
    };
    let Some(next) = next else {
        return false;
    };
    if activity_timestamp_ms(&next.updated_at) < activity_timestamp_ms(&old.updated_at) {
        return false;
    }
    old.days
        .iter()
        .all(|day| next.days.iter().any(|new_day| new_day.date == day.date))
}

fn archive_retained(old: &ActivityData, next: &ActivityData) -> bool {
    history_retained(&old.sources.github, &next.sources.github)
        && history_retained(&old.sources.codex, &next.sources.codex)
        && history_retained(&old.sources.claude, &next.sources.claude)
}

fn publication_receipt_retained(old: &GenerationImage, next: &GenerationImage) -> bool {
    let Ok(old_delivery) = serde_json::from_slice::<Value>(&old.delivery) else {
        return false;
    };
    let Ok(next_delivery) = serde_json::from_slice::<Value>(&next.delivery) else {
        return false;
    };
    old_delivery.get("publicationObserved") == next_delivery.get("publicationObserved")
        && old_delivery.get("lastOutcomes") == next_delivery.get("lastOutcomes")
        && old_delivery.get("pendingAbandoned") == next_delivery.get("pendingAbandoned")
}

fn abandonment_recorded(next: &GenerationImage, evidence: &AbandonEvidence, reserved: u64) -> bool {
    serde_json::from_slice::<Value>(&next.delivery).is_ok_and(|delivery| {
        let record = &delivery["pendingAbandoned"];
        delivery.get("retry").is_none()
            && record["sequence"].as_u64() == Some(evidence.sequence)
            && record["exactPendingSha256"].as_str() == Some(evidence.exact_pending_sha256.as_str())
            && record["reservedThrough"].as_u64() == Some(reserved)
    })
}

fn valid_transition(
    old: &ValidatedGeneration,
    old_image: &GenerationImage,
    next: &ValidatedGeneration,
    next_image: &GenerationImage,
    clear: Option<PendingClear<'_>>,
) -> bool {
    if !archive_retained(&old.archive, &next.archive) {
        return false;
    }
    match (&old_image.pending, &next_image.pending) {
        (Some(previous_bytes), Some(next_bytes)) => {
            previous_bytes == next_bytes
                && next.highest_reserved == old.highest_reserved
                && next.archive == old.archive
        }
        (Some(previous_bytes), None) => match clear {
            None => false,
            Some(PendingClear::Published(evidence)) => {
                old.pending.as_ref().map(|batch| batch.sequence) == Some(evidence.sequence)
                    && sha256_hex(previous_bytes) == evidence.exact_pending_sha256
                    && old.pending.as_ref().is_some_and(|batch| {
                        public_data_bytes(&batch.data)
                            .is_ok_and(|bytes| sha256_hex(&bytes) == evidence.activity_sha256)
                    })
                    && next.highest_reserved == old.highest_reserved
                    && next.archive == old.archive
            }
            Some(PendingClear::Abandoned(evidence)) => {
                old.pending.as_ref().map(|batch| batch.sequence) == Some(evidence.sequence)
                    && sha256_hex(previous_bytes) == evidence.exact_pending_sha256
                    && match evidence.reserved_through {
                        None => next.highest_reserved == old.highest_reserved,
                        Some(through) => {
                            next.highest_reserved == through && through >= old.highest_reserved
                        }
                    }
                    && next.archive == old.archive
                    && abandonment_recorded(next_image, evidence, next.highest_reserved)
            }
        },
        (None, None) => {
            next.highest_reserved == old.highest_reserved
                && next.archive == old.archive
                && publication_receipt_retained(old_image, next_image)
        }
        (None, Some(_)) => {
            old.highest_reserved < MAX_SAFE_INTEGER
                && next.highest_reserved == old.highest_reserved + 1
                && next.pending.as_ref().is_some_and(|batch| {
                    batch.sequence == next.highest_reserved && batch.data == next.archive
                })
        }
    }
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), CommitError> {
    let mut file: File = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| CommitError::Io)?;
    file.write_all(bytes).map_err(|_| CommitError::Io)?;
    file.sync_all().map_err(|_| CommitError::Io)
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

/// Write-through rename inside one root that never replaces an existing entry.
pub(crate) fn move_without_replace(from: &Path, to: &Path) -> bool {
    switch_current(from, to, false).is_ok()
}

fn switch_current(staged: &Path, current: &Path, replace: bool) -> Result<(), CommitError> {
    let from = wide(staged.as_os_str());
    let to = wide(current.as_os_str());
    // Both paths are in one canonical root. COPY_ALLOWED is intentionally absent.
    let result = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_WRITE_THROUGH
                | if replace {
                    MOVEFILE_REPLACE_EXISTING
                } else {
                    0
                },
        )
    };
    if result == 0 {
        Err(CommitError::SwitchFailed)
    } else {
        Ok(())
    }
}

fn after<F: FnMut(CommitPhase) -> Result<(), ()>>(
    hook: &mut F,
    phase: CommitPhase,
) -> Result<(), CommitError> {
    hook(phase).map_err(|_| {
        if phase == CommitPhase::CurrentSwitched {
            CommitError::InterruptedAfterSwitch
        } else {
            CommitError::InterruptedBeforeSwitch
        }
    })
}

/// Normal commit under the root's live OS lock. Existing pending bytes cannot
/// be cleared through this entry point; public observation has a separate gate.
pub fn commit<C: Clock>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    next_image: &GenerationImage,
    clock: &C,
) -> Result<(), CommitError> {
    commit_with_hook(guard, expected_id, next_id, next_image, clock, |_| Ok(()))
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Clear pending only after the trusted observer supplies a matching public
/// result. The current archive and reserved sequence remain unchanged.
pub fn commit_publication_observed<C: Clock>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    evidence: &PublicationEvidence,
    clock: &C,
) -> Result<(), CommitError> {
    commit_publication_observed_with_hook(guard, expected_id, next_id, evidence, clock, |_| Ok(()))
}

/// Fault hook for the acknowledgment-specific pointer-switch boundary.
pub fn commit_publication_observed_with_hook<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    evidence: &PublicationEvidence,
    clock: &C,
    hook: F,
) -> Result<(), CommitError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(CommitError::Recovery)?
        .current;
    let pending = current
        .image
        .pending
        .as_ref()
        .ok_or(CommitError::InvalidEvidence)?;
    if current.id != expected_id
        || evidence.origin.is_empty()
        || evidence.origin.len() > 256
        || current
            .validated
            .pending
            .as_ref()
            .map(|batch| batch.sequence)
            != Some(evidence.sequence)
        || sha256_hex(pending) != evidence.exact_pending_sha256
        || !current.validated.pending.as_ref().is_some_and(|batch| {
            public_data_bytes(&batch.data)
                .is_ok_and(|bytes| sha256_hex(&bytes) == evidence.activity_sha256)
        })
        || !valid_hash(&evidence.manifest_sha256)
        || evidence.generated_at_ms < 0
        || evidence.published_at_ms < 0
        || evidence.received_at_ms < 0
        || evidence.published_at_ms > evidence.generated_at_ms.saturating_add(300_000)
        || evidence.received_at_ms > evidence.generated_at_ms.saturating_add(300_000)
    {
        return Err(CommitError::InvalidEvidence);
    }
    let mut delivery: Value = serde_json::from_slice(&current.image.delivery)
        .map_err(|_| CommitError::InvalidEvidence)?;
    let object = delivery
        .as_object_mut()
        .ok_or(CommitError::InvalidEvidence)?;
    object.remove("retry");
    object.insert(
        "publicationObserved".to_owned(),
        json!({
            "origin": evidence.origin,
            "sequence": evidence.sequence,
            "exactPendingSha256": evidence.exact_pending_sha256,
            "manifestSha256": evidence.manifest_sha256,
            "activitySha256": evidence.activity_sha256,
            "generatedAtMs": evidence.generated_at_ms,
            "publishedAtMs": evidence.published_at_ms,
            "receivedAtMs": evidence.received_at_ms,
        }),
    );
    // Keep the acknowledged batch's per-source outcomes for status readers;
    // they would otherwise disappear with the pending batch.
    let batch = current
        .validated
        .pending
        .as_ref()
        .ok_or(CommitError::InvalidEvidence)?;
    let observed_at_ms = clock.now_unix_ms();
    if observed_at_ms < 0 {
        return Err(CommitError::InvalidEvidence);
    }
    object.insert(
        "lastOutcomes".to_owned(),
        json!({
            "sequence": batch.sequence,
            "observedAtMs": observed_at_ms,
            "sources": batch.sources,
        }),
    );
    let mut delivery = serde_json::to_vec(&delivery).map_err(|_| CommitError::InvalidEvidence)?;
    delivery.push(b'\n');
    if delivery.len() > 1024 * 1024 {
        return Err(CommitError::InvalidEvidence);
    }
    let image = GenerationImage {
        activity: current.image.activity,
        sequence: current.image.sequence,
        pending: None,
        delivery,
    };
    commit_inner(
        guard,
        expected_id,
        next_id,
        &image,
        clock,
        Some(PendingClear::Published(evidence)),
        hook,
    )
}

/// End one pending batch without publication (ADR-033). The store must be
/// paused, the batch must match the operator's sequence and exact hash, and the
/// archive is kept. The sequence stays consumed; `reserved_through` may move
/// the reservation above a known remote high-water, and otherwise it stays.
pub fn commit_pending_abandoned<C: Clock>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    evidence: &AbandonEvidence,
    clock: &C,
) -> Result<(), CommitError> {
    commit_pending_abandoned_with_hook(guard, expected_id, next_id, evidence, clock, |_| Ok(()))
}

/// Fault hook for the abandonment pointer-switch boundary.
pub fn commit_pending_abandoned_with_hook<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    evidence: &AbandonEvidence,
    clock: &C,
    hook: F,
) -> Result<(), CommitError> {
    let current = audit_generations(guard.root(), clock)
        .map_err(CommitError::Recovery)?
        .current;
    if current.id != expected_id {
        return Err(CommitError::StaleGeneration);
    }
    if !paused_from_delivery(&current.image.delivery).ok_or(CommitError::InvalidEvidence)? {
        return Err(CommitError::NotPaused);
    }
    let (Some(pending), Some(batch)) = (&current.image.pending, &current.validated.pending) else {
        return Err(CommitError::InvalidEvidence);
    };
    if batch.sequence != evidence.sequence
        || sha256_hex(pending) != evidence.exact_pending_sha256
        || evidence
            .reserved_through
            .is_some_and(|through| through < current.validated.highest_reserved)
        || evidence
            .reserved_through
            .is_some_and(|through| through > MAX_SAFE_INTEGER)
    {
        return Err(CommitError::InvalidEvidence);
    }
    let reserved_through = evidence
        .reserved_through
        .unwrap_or(current.validated.highest_reserved);
    let abandoned_at_ms = clock.now_unix_ms();
    if abandoned_at_ms < 0 {
        return Err(CommitError::InvalidEvidence);
    }
    let activity_sha256 =
        sha256_hex(&public_data_bytes(&batch.data).map_err(|_| CommitError::InvalidEvidence)?);
    let mut delivery: Value = serde_json::from_slice(&current.image.delivery)
        .map_err(|_| CommitError::InvalidEvidence)?;
    let object = delivery
        .as_object_mut()
        .ok_or(CommitError::InvalidEvidence)?;
    object.remove("retry");
    object.insert(
        "pendingAbandoned".to_owned(),
        json!({
            "sequence": evidence.sequence,
            "exactPendingSha256": evidence.exact_pending_sha256,
            "activitySha256": activity_sha256,
            "reservedThrough": reserved_through,
            "abandonedAtMs": abandoned_at_ms,
            "reason": ABANDON_REASON,
        }),
    );
    let mut delivery = serde_json::to_vec(&delivery).map_err(|_| CommitError::InvalidEvidence)?;
    delivery.push(b'\n');
    if delivery.len() > 1024 * 1024 {
        return Err(CommitError::InvalidEvidence);
    }
    let image = GenerationImage {
        activity: current.image.activity,
        sequence: format!("{{\"sequence\":{reserved_through}}}\n").into_bytes(),
        pending: None,
        delivery,
    };
    commit_inner(
        guard,
        expected_id,
        next_id,
        &image,
        clock,
        Some(PendingClear::Abandoned(evidence)),
        hook,
    )
}

/// Fault hook for crash-boundary tests. An error after CurrentSwitched means
/// the caller must re-read CURRENT; it must not assume the old state survived.
pub fn commit_with_hook<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    next_image: &GenerationImage,
    clock: &C,
    hook: F,
) -> Result<(), CommitError> {
    commit_inner(guard, expected_id, next_id, next_image, clock, None, hook)
}

fn commit_inner<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    next_image: &GenerationImage,
    clock: &C,
    clear: Option<PendingClear<'_>>,
    mut hook: F,
) -> Result<(), CommitError> {
    let root = guard.root();
    let old = audit_generations(root, clock)
        .map_err(|error| match error {
            RecoveryError::Current(error) => CommitError::Current(error),
            error => CommitError::Recovery(error),
        })?
        .current;
    if old.id != expected_id || old.id == next_id {
        return Err(CommitError::StaleGeneration);
    }
    let manifest = next_image
        .manifest_bytes(next_id, clock)
        .map_err(CommitError::InvalidNext)?;
    let next = next_image
        .validate(&manifest, next_id, clock)
        .map_err(CommitError::InvalidNext)?;
    if !valid_transition(&old.validated, &old.image, &next, next_image, clear) {
        return Err(CommitError::InvalidTransition);
    }

    write_generation(guard, next_id, next_image, &manifest, true, &mut hook)?;

    let observed = read_current(root, clock).map_err(CommitError::PostSwitchValidation)?;
    if observed.id != next_id {
        return Err(CommitError::SwitchFailed);
    }
    Ok(())
}

/// Publish a validated image using the same flush and visibility boundaries for
/// normal commits and first imports. Bootstrap never replaces an existing pointer.
pub(crate) fn write_generation<F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    next_id: &str,
    next_image: &GenerationImage,
    manifest: &[u8],
    replace_current: bool,
    hook: &mut F,
) -> Result<(), CommitError> {
    let root = guard.root();
    let generations = root.join("generations");
    let staging = generations.join(format!(".staging-{next_id}"));
    let final_path = generations.join(next_id);
    if final_path.exists() {
        return Err(CommitError::Io);
    }
    fs::create_dir(&staging).map_err(|_| CommitError::Io)?;
    for (name, bytes) in [
        ("activity.json", Some(next_image.activity.as_slice())),
        ("sequence.json", Some(next_image.sequence.as_slice())),
        ("pending.json", next_image.pending.as_deref()),
        ("delivery.json", Some(next_image.delivery.as_slice())),
        ("manifest.json", Some(manifest)),
    ] {
        if let Some(bytes) = bytes {
            write_synced(&staging.join(name), bytes)?;
            after(hook, CommitPhase::FileFlushed(name))?;
        }
    }
    fs::rename(&staging, &final_path).map_err(|_| CommitError::Io)?;
    after(hook, CommitPhase::GenerationPublished)?;

    let staged_current = root.join(format!("CURRENT.{next_id}.tmp"));
    write_synced(&staged_current, format!("{next_id}\n").as_bytes())
        .map_err(|error| retract_unselected(root, next_id, &final_path, &staging, error))?;
    after(hook, CommitPhase::CurrentPrepared)?;
    switch_current(&staged_current, &root.join("CURRENT"), replace_current)
        .map_err(|error| retract_unselected(root, next_id, &final_path, &staging, error))?;
    after(hook, CommitPhase::CurrentSwitched)?;
    Ok(())
}

/// A failed pointer write observed by this live writer leaves CURRENT on the
/// old generation. Rename the never-selected directory back to its staging name
/// so recovery does not mistake it for a rolled-back pointer; nothing is
/// deleted. Process death cannot run this, and any doubt keeps the orphan.
fn retract_unselected(
    root: &Path,
    next_id: &str,
    final_path: &Path,
    staging: &Path,
    error: CommitError,
) -> CommitError {
    let selected = match read_file(
        &root.join("CURRENT"),
        MAX_CURRENT_BYTES,
        ReadError::MissingCurrent,
    ) {
        Ok(bytes) => bytes.strip_suffix(b"\n") == Some(next_id.as_bytes()),
        Err(ReadError::MissingCurrent) => false,
        Err(_) => true,
    };
    if !selected && !staging.exists() {
        let _ = fs::rename(final_path, staging);
    }
    error
}
