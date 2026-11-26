//! ADR-MEM-220: Runtime's semantic index for the registered entry. Vectors
//! come from the local Ollama `bge-m3` model; Memory only compares and scores
//! them. Memory vectors are cached under Runtime's own config directory (never
//! in the library, an export or a repository) and filled in the background
//! from the reader's `semantic_texts`. Without Ollama every query answers
//! `None`, so recall stays lexical.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use enouia_memory_contract::next::{SemanticVector, TargetRef};
use enouia_memory_host::automation::semantic::SemanticIndex;
use serde_json::{Value, json};

pub const MODEL: &str = "bge-m3";
const OLLAMA: &str = "127.0.0.1:11434";
/// Memory blocks a recall on the query vector, so it is bounded.
const QUERY_LIMIT: Duration = Duration::from_millis(1500);
const BATCH_LIMIT: Duration = Duration::from_secs(120);
const BATCH: usize = 16;
const REFRESH_EVERY: Duration = Duration::from_secs(60);

fn key(target: &TargetRef) -> String {
    serde_json::to_string(target).unwrap_or_default()
}

/// One `/api/embed` call to the local Ollama over plain HTTP/1.1; `None` when
/// it is not installed, not running, too slow or answers anything else.
fn embed(inputs: &[&str], limit: Duration) -> Option<Vec<Vec<f32>>> {
    let body = json!({"model": MODEL, "input": inputs}).to_string();
    let addr: SocketAddr = OLLAMA.parse().ok()?;
    let mut stream =
        TcpStream::connect_timeout(&addr, limit.min(Duration::from_millis(500))).ok()?;
    stream.set_read_timeout(Some(limit)).ok()?;
    stream.set_write_timeout(Some(limit)).ok()?;
    let started = Instant::now();
    write!(stream, "POST /api/embed HTTP/1.1\r\nHost: {OLLAMA}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).ok()?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).ok()?;
    if started.elapsed() > limit {
        return None;
    }
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&raw[..split]).to_ascii_lowercase();
    if !head.lines().next()?.contains(" 200 ") {
        return None;
    }
    let mut payload = raw[split + 4..].to_vec();
    if head.contains("transfer-encoding: chunked") {
        let mut joined = Vec::new();
        let mut rest = payload.as_slice();
        loop {
            let line = rest.windows(2).position(|w| w == b"\r\n")?;
            let size =
                usize::from_str_radix(String::from_utf8_lossy(&rest[..line]).trim(), 16).ok()?;
            if size == 0 {
                break;
            }
            let start = line + 2;
            joined.extend_from_slice(rest.get(start..start + size)?);
            rest = rest.get(start + size + 2..)?;
        }
        payload = joined;
    }
    let value: Value = serde_json::from_slice(&payload).ok()?;
    let rows = value.get("embeddings")?.as_array()?;
    let out: Vec<Vec<f32>> = rows
        .iter()
        .map(|row| {
            row.as_array().map(|r| {
                r.iter()
                    .filter_map(|v| v.as_f64().map(|f| f as f32))
                    .collect()
            })
        })
        .collect::<Option<_>>()?;
    (out.len() == inputs.len()).then_some(out)
}

pub struct OllamaIndex {
    file: Option<PathBuf>,
    vectors: RwLock<HashMap<String, SemanticVector>>,
    filling: AtomicBool,
    last: Mutex<Option<Instant>>,
    /// What Settings shows: state, vectors held, memories listed.
    state: Mutex<(&'static str, usize, usize)>,
}

impl OllamaIndex {
    pub fn open(file: Option<PathBuf>) -> Arc<Self> {
        let vectors: HashMap<String, SemanticVector> = file
            .as_ref()
            .and_then(|f| std::fs::read(f).ok())
            .and_then(|bytes| {
                serde_json::from_slice::<HashMap<String, SemanticVector>>(&bytes).ok()
            })
            .map(|all| {
                all.into_iter()
                    .filter(|(_, v)| v.model == MODEL && v.valid())
                    .collect()
            })
            .unwrap_or_default();
        let held = vectors.len();
        Arc::new(Self {
            file,
            vectors: RwLock::new(vectors),
            filling: AtomicBool::new(false),
            last: Mutex::new(None),
            state: Mutex::new(("waiting", held, 0)),
        })
    }

    /// From the status poll: at most once a minute, take the list of memories
    /// to embed and fill the missing vectors on a background thread.
    pub fn refresh(self: &Arc<Self>, texts: impl FnOnce() -> Option<Vec<(TargetRef, String)>>) {
        if self.filling.load(Ordering::SeqCst) {
            return;
        }
        let Ok(mut last) = self.last.lock() else {
            return;
        };
        if last.is_some_and(|at| at.elapsed() < REFRESH_EVERY) {
            return;
        }
        *last = Some(Instant::now());
        drop(last);
        let Some(texts) = texts() else {
            return;
        };
        self.filling.store(true, Ordering::SeqCst);
        let index = self.clone();
        std::thread::spawn(move || {
            index.fill(texts);
            index.filling.store(false, Ordering::SeqCst);
        });
    }

    fn fill(&self, texts: Vec<(TargetRef, String)>) {
        let wanted: HashMap<String, String> =
            texts.into_iter().map(|(t, s)| (key(&t), s)).collect();
        let total = wanted.len();
        let missing: Vec<(String, String)> = {
            let Ok(mut vectors) = self.vectors.write() else {
                return;
            };
            // A target no longer listed was withdrawn, forgotten or deleted.
            vectors.retain(|k, _| wanted.contains_key(k));
            wanted
                .iter()
                .filter(|(k, _)| !vectors.contains_key(*k))
                .map(|(k, s)| (k.clone(), s.clone()))
                .collect()
        };
        let held = |index: &Self| index.vectors.read().map_or(0, |v| v.len());
        self.set("indexing", held(self), total);
        for chunk in missing.chunks(BATCH) {
            let inputs: Vec<&str> = chunk.iter().map(|(_, s)| s.as_str()).collect();
            let Some(rows) = embed(&inputs, BATCH_LIMIT) else {
                self.save();
                self.set("unavailable", held(self), total);
                return;
            };
            if let Ok(mut vectors) = self.vectors.write() {
                for ((k, _), row) in chunk.iter().zip(rows) {
                    if let Some(v) = SemanticVector::from_f32(MODEL, &row) {
                        vectors.insert(k.clone(), v);
                    }
                }
            }
            self.set("indexing", held(self), total);
        }
        self.save();
        self.set("ready", held(self), total);
    }

    fn set(&self, state: &'static str, held: usize, total: usize) {
        if let Ok(mut slot) = self.state.lock() {
            *slot = (state, held, total);
        }
    }

    fn save(&self) {
        let (Some(file), Ok(vectors)) = (&self.file, self.vectors.read()) else {
            return;
        };
        let Ok(bytes) = serde_json::to_vec(&*vectors) else {
            return;
        };
        let temp = file.with_extension("json.tmp");
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if std::fs::write(&temp, bytes).is_ok() {
            let _ = std::fs::rename(&temp, file);
        }
    }

    pub fn status(&self) -> Value {
        let (state, held, total) = self.state.lock().map_or(("waiting", 0, 0), |s| *s);
        json!({"model": MODEL, "state": state, "indexed": held, "total": total})
    }
}

impl SemanticIndex for OllamaIndex {
    fn model(&self) -> &str {
        MODEL
    }
    fn query(&self, text: &str) -> Option<SemanticVector> {
        let row = embed(&[text], QUERY_LIMIT)?.into_iter().next()?;
        SemanticVector::from_f32(MODEL, &row)
    }
    fn memory(&self, target: &TargetRef) -> Option<SemanticVector> {
        self.vectors.read().ok()?.get(&key(target)).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(id: &str) -> TargetRef {
        serde_json::from_value(
            json!({"memory": {"memory_id": id, "revision": 1}, "hash": "a".repeat(64)}),
        )
        .unwrap()
    }

    #[test]
    fn cache_answers_memory_lookups_and_drops_other_models() {
        let dir = std::env::temp_dir().join(format!("enouia-semantic-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("semantic-bge-m3.json");
        let kept = SemanticVector::from_f32(MODEL, &[0.6, 0.8]).unwrap();
        let other = SemanticVector::from_f32("other-model", &[1.0, 0.0]).unwrap();
        let (a, b) = (
            target("mem_06d2ff6f-280a-43b7-bd11-92db87c0317d"),
            target("mem_16d2ff6f-280a-43b7-bd11-92db87c0317d"),
        );
        std::fs::write(
            &file,
            serde_json::to_vec(&HashMap::from([(key(&a), kept.clone()), (key(&b), other)]))
                .unwrap(),
        )
        .unwrap();
        let index = OllamaIndex::open(Some(file));
        assert_eq!(index.model(), MODEL);
        assert_eq!(index.memory(&a), Some(kept));
        assert_eq!(index.memory(&b), None);
        assert_eq!(index.status()["indexed"], 1);
        assert_eq!(index.status()["state"], "waiting");
        let _ = std::fs::remove_dir_all(dir);
    }
}
