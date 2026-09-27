//! One locked generation commit with an immutable directory and pointer switch.

use crate::ActivityLockGuard;
use crate::generation::{GenerationError, GenerationImage, ValidatedGeneration};
use crate::reader::{ReadError, read_current};
use enouia_activity_contract::{ActivityData, MAX_SAFE_INTEGER, Snapshot, activity_timestamp_ms};
use enouia_common::Clock;
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
    PostSwitchValidation(ReadError),
    StaleGeneration,
    InvalidNext(GenerationError),
    InvalidTransition,
    Io,
    SwitchFailed,
    InterruptedBeforeSwitch,
    InterruptedAfterSwitch,
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

fn valid_transition(
    old: &ValidatedGeneration,
    old_image: &GenerationImage,
    next: &ValidatedGeneration,
    next_image: &GenerationImage,
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
        (Some(_), None) => false,
        (None, None) => {
            next.highest_reserved == old.highest_reserved && next.archive == old.archive
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

fn switch_current(staged: &Path, current: &Path) -> Result<(), CommitError> {
    let from = wide(staged.as_os_str());
    let to = wide(current.as_os_str());
    // Both paths are in one canonical root. COPY_ALLOWED is intentionally absent.
    let result = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
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
/// be cleared until the delivery-state acknowledgment protocol is implemented.
pub fn commit<C: Clock>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    next_image: &GenerationImage,
    clock: &C,
) -> Result<(), CommitError> {
    commit_with_hook(guard, expected_id, next_id, next_image, clock, |_| Ok(()))
}

/// Fault hook for crash-boundary tests. An error after CurrentSwitched means
/// the caller must re-read CURRENT; it must not assume the old state survived.
pub fn commit_with_hook<C: Clock, F: FnMut(CommitPhase) -> Result<(), ()>>(
    guard: &ActivityLockGuard,
    expected_id: &str,
    next_id: &str,
    next_image: &GenerationImage,
    clock: &C,
    mut hook: F,
) -> Result<(), CommitError> {
    let root = guard.root();
    let old = read_current(root, clock).map_err(CommitError::Current)?;
    if old.id != expected_id || old.id == next_id {
        return Err(CommitError::StaleGeneration);
    }
    let manifest = next_image
        .manifest_bytes(next_id, clock)
        .map_err(CommitError::InvalidNext)?;
    let next = next_image
        .validate(&manifest, next_id, clock)
        .map_err(CommitError::InvalidNext)?;
    if !valid_transition(&old.validated, &old.image, &next, next_image) {
        return Err(CommitError::InvalidTransition);
    }

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
        ("manifest.json", Some(manifest.as_slice())),
    ] {
        if let Some(bytes) = bytes {
            write_synced(&staging.join(name), bytes)?;
            after(&mut hook, CommitPhase::FileFlushed(name))?;
        }
    }
    fs::rename(&staging, &final_path).map_err(|_| CommitError::Io)?;
    after(&mut hook, CommitPhase::GenerationPublished)?;

    let staged_current = root.join(format!("CURRENT.{next_id}.tmp"));
    write_synced(&staged_current, format!("{next_id}\n").as_bytes())?;
    after(&mut hook, CommitPhase::CurrentPrepared)?;
    switch_current(&staged_current, &root.join("CURRENT"))?;
    after(&mut hook, CommitPhase::CurrentSwitched)?;

    let observed = read_current(root, clock).map_err(CommitError::PostSwitchValidation)?;
    if observed.id != next_id {
        return Err(CommitError::SwitchFailed);
    }
    Ok(())
}
