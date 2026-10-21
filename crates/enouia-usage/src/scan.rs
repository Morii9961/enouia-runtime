//! Explicit one-shot grants only. No source discovery, watcher, scheduler or network.
use crate::adapter::{Codex, Models, Source, claude};
use crate::store::{Batch, Coverage, Health, Ledger};
use crate::{Error, Result, bounded_json, safety};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct Limits {
    pub bytes: u64,
    pub file_bytes: u64,
    pub line_bytes: usize,
    pub entries: u64,
    pub records: u64,
    pub depth: usize,
    pub elapsed: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            bytes: 1024 * 1024 * 1024,
            file_bytes: 128 * 1024 * 1024,
            line_bytes: 1024 * 1024,
            entries: 50_000,
            records: 1_000_000,
            depth: 32,
            elapsed: Duration::from_secs(120),
        }
    }
}
pub struct Selection {
    pub source: Source,
    pub roots: Vec<PathBuf>,
    pub models: Vec<String>,
    pub limits: Limits,
}
pub struct ScanResult {
    pub health: Health,
    pub new_observations: u64,
    pub duplicate_observations: u64,
}
struct Budget<'a> {
    limits: &'a Limits,
    cancel: &'a AtomicBool,
    start: Instant,
    bytes: u64,
    entries: u64,
    records: u64,
}
impl Budget<'_> {
    fn check(&self) -> Result<()> {
        if self.cancel.load(Ordering::Relaxed) {
            Err(Error::Cancelled)
        } else if self.start.elapsed() >= self.limits.elapsed {
            Err(Error::BudgetExceeded)
        } else {
            Ok(())
        }
    }
    fn entry(&mut self) -> Result<()> {
        self.check()?;
        self.entries += 1;
        if self.entries > self.limits.entries {
            Err(Error::BudgetExceeded)
        } else {
            Ok(())
        }
    }
    fn bytes(&mut self, n: usize) -> Result<()> {
        self.check()?;
        self.bytes = self
            .bytes
            .checked_add(n as u64)
            .ok_or(Error::BudgetExceeded)?;
        if self.bytes > self.limits.bytes {
            Err(Error::BudgetExceeded)
        } else {
            Ok(())
        }
    }
}
impl Ledger {
    pub fn scan(
        &mut self,
        selection: &Selection,
        at: &str,
        cancel: &AtomicBool,
    ) -> Result<ScanResult> {
        crate::time::timestamp(at)?;
        let result = self.scan_inner(selection, at, cancel);
        if let Err(e) = result {
            self.failed_attempt(selection.source, at, e)?;
            return Err(e);
        }
        result
    }
    fn scan_inner(
        &mut self,
        selection: &Selection,
        at: &str,
        cancel: &AtomicBool,
    ) -> Result<ScanResult> {
        if selection.roots.is_empty()
            || selection.roots.len() > 16
            || selection.limits.line_bytes > 1024 * 1024
            || selection.limits.depth > 32
            || selection.limits.entries > 50_000
            || selection.limits.records > 1_000_000
            || selection.limits.bytes > 1024 * 1024 * 1024
            || selection.limits.file_bytes > 128 * 1024 * 1024
            || selection.limits.elapsed > Duration::from_secs(600)
        {
            return Err(Error::Unconfigured);
        }
        let models = Models::new(&selection.models)?;
        // Pin all existing root ancestry before opening any source. Missing roots retain history.
        let mut roots = Vec::new();
        let mut coverage = Coverage::default();
        for path in &selection.roots {
            safety::disjoint(self.root(), path)?;
            match safety::directory(path) {
                Ok(root) => {
                    safety::disjoint(self.root(), &root.path)?;
                    for old in &roots {
                        let old: &safety::Directory = old;
                        safety::disjoint(&old.path, &root.path)?;
                    }
                    roots.push(root);
                }
                Err(_) => coverage.unreadable += 1,
            }
        }
        let key = crate::identity::IdentityKey::from_bytes(self.key.0);
        let mut batch = self.batch(selection.source)?;
        let mut budget = Budget {
            limits: &selection.limits,
            cancel,
            start: Instant::now(),
            bytes: 0,
            entries: 0,
            records: 0,
        };
        budget.check()?;
        for root in roots {
            walk(
                &root.path,
                0,
                &key,
                &models,
                &mut batch,
                &mut budget,
                &mut coverage,
            )?;
        }
        coverage.retained_files = batch.retained()?;
        let new_observations = batch.new;
        let duplicate_observations = batch.duplicates;
        batch.finish_checked(coverage, at, false, true, &|| budget.check())?;
        Ok(ScanResult {
            health: self.health(selection.source)?,
            new_observations,
            duplicate_observations,
        })
    }
}
fn walk(
    path: &Path,
    depth: usize,
    key: &crate::identity::IdentityKey,
    models: &Models,
    batch: &mut Batch<'_>,
    budget: &mut Budget<'_>,
    coverage: &mut Coverage,
) -> Result<()> {
    budget.check()?;
    if depth > budget.limits.depth {
        return Err(Error::BudgetExceeded);
    }
    let _grant = match safety::directory(path) {
        Ok(g) => g,
        Err(_) => {
            coverage.unsafe_entries += 1;
            return Ok(());
        }
    };
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => {
            coverage.unreadable += 1;
            return Ok(());
        }
    };
    for entry in entries {
        budget.entry()?;
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                coverage.unreadable += 1;
                continue;
            }
        };
        let path = entry.path();
        let ty = match entry.file_type() {
            Ok(t) => t,
            Err(_) => {
                coverage.unreadable += 1;
                continue;
            }
        };
        if ty.is_symlink() {
            coverage.unsafe_entries += 1;
            continue;
        }
        if ty.is_dir() {
            walk(&path, depth + 1, key, models, batch, budget, coverage)?;
        } else if path
            .extension()
            .is_some_and(|s| s.eq_ignore_ascii_case("jsonl"))
        {
            coverage.files += 1;
            let origin = key.digest(
                "source_file",
                &[path.to_string_lossy().to_lowercase().as_bytes()],
            );
            batch.seen(&origin)?;
            read(&path, key, models, batch, budget, coverage)?;
        } else if path
            .file_name()
            .is_some_and(|s| s.to_string_lossy().ends_with(".jsonl.zst"))
        {
            coverage.unsupported += 1;
        }
    }
    Ok(())
}
fn read(
    path: &Path,
    key: &crate::identity::IdentityKey,
    models: &Models,
    batch: &mut Batch<'_>,
    budget: &mut Budget<'_>,
    coverage: &mut Coverage,
) -> Result<()> {
    let file = match safety::read_file(path) {
        Ok(f) => f,
        Err(_) => {
            coverage.unreadable += 1;
            return Ok(());
        }
    };
    if file.metadata().map_err(|_| Error::UnsafePath)?.len() > budget.limits.file_bytes {
        return Err(Error::BudgetExceeded);
    }
    let mut reader = BufReader::with_capacity(16 * 1024, file);
    let mut line = Vec::with_capacity(4096);
    let mut file_bytes = 0_u64;
    let mut clean = true;
    let mut codex = Codex::new(key, models);
    loop {
        budget.check()?;
        let available = match reader.fill_buf() {
            Ok(v) => v,
            Err(_) => {
                coverage.unreadable += 1;
                return Ok(());
            }
        };
        if available.is_empty() {
            if !line.is_empty() {
                coverage.incomplete_tails += 1;
                clean = false;
            }
            break;
        }
        let end = available.iter().position(|b| *b == b'\n');
        let take = end.map_or(available.len(), |n| n + 1);
        budget.bytes(take)?;
        file_bytes += take as u64;
        if file_bytes > budget.limits.file_bytes || line.len() + take > budget.limits.line_bytes {
            return Err(Error::BudgetExceeded);
        }
        line.extend_from_slice(&available[..take]);
        reader.consume(take);
        if end.is_none() {
            continue;
        }
        budget.records += 1;
        if budget.records > budget.limits.records {
            return Err(Error::BudgetExceeded);
        }
        coverage.records += 1;
        let parsed =
            bounded_json(&line, budget.limits.line_bytes).and_then(|value| match batch.source {
                Source::CodexLocal => codex.push(&value),
                Source::ClaudeLocal => claude(&value, key, models),
            });
        match parsed {
            Ok(Some(o)) => batch.ingest(&o)?,
            Ok(None) => {}
            Err(error) => {
                clean = false;
                coverage.rejected += 1;
                if batch.source == Source::CodexLocal {
                    if error == Error::CounterReset {
                        coverage.counter_resets += 1;
                    }
                    // Stop this chain; no guessed bridge across malformed/reset observations.
                    break;
                }
            }
        }
        line.clear();
    }
    if clean {
        coverage.complete_files += 1;
    }
    Ok(())
}
