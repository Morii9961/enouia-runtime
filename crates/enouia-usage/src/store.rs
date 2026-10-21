//! Independent transactional ledger. Only normalized facts and keyed identifiers persist.
use crate::adapter::{ADAPTER_VERSION, Fact, Observation, Record, Source};
use crate::identity::IdentityKey;
use crate::{Error, Result, safety};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub(crate) fn sql<T>(r: rusqlite::Result<T>) -> Result<T> {
    r.map_err(|_| Error::StorageFailed)
}
pub(crate) fn encode<T: Serialize>(v: &T) -> Result<String> {
    serde_json::to_string(v).map_err(|_| Error::StorageFailed)
}
pub(crate) fn decode<T: serde::de::DeserializeOwned>(v: &str) -> Result<T> {
    serde_json::from_str(v).map_err(|_| Error::StorageFailed)
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Coverage {
    pub files: u64,
    pub complete_files: u64,
    pub records: u64,
    pub rejected: u64,
    pub incomplete_tails: u64,
    pub unreadable: u64,
    pub retained_files: u64,
    pub unsupported: u64,
    pub unsafe_entries: u64,
    pub counter_resets: u64,
}
impl Coverage {
    pub fn complete(&self) -> bool {
        self.files > 0
            && self.files == self.complete_files
            && self.rejected
                + self.incomplete_tails
                + self.unreadable
                + self.retained_files
                + self.unsupported
                + self.unsafe_entries
                + self.counter_resets
                == 0
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Health {
    pub revision: i64,
    pub last_attempt: Option<String>,
    pub last_completed: Option<String>,
    pub last_successful: Option<String>,
    pub attempt_error: Option<Error>,
    pub coverage: Coverage,
    pub conflicts: i64,
    pub accepted_facts: i64,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Identity {
    version: u8,
    key: [u8; 32],
    codex: String,
    claude: String,
}

pub struct Ledger {
    pub(crate) conn: Connection,
    pub(crate) key: IdentityKey,
    root: safety::Directory,
    _lock: File,
}
impl Ledger {
    /// Creates a NEW, explicitly selected root; never repairs or replaces an old ledger.
    pub fn init(path: &Path) -> Result<Self> {
        safety::data_location(path)?;
        let parent = safety::directory(path.parent().ok_or(Error::UnsafePath)?)?;
        std::fs::create_dir(path).map_err(|_| Error::StorageFailed)?;
        safety::make_private(path)?;
        let root = safety::directory(path)?;
        safety::data_location(&root.path)?;
        let lock = safety::writer_lock(&root)?;
        let identity = Identity {
            version: 1,
            key: safety::random()?,
            codex: safety::uuid()?,
            claude: safety::uuid()?,
        };
        let bytes = encode(&identity)?;
        safety::write_new(&root.path.join("identity.json"), bytes.as_bytes())?;
        safety::write_new(&root.path.join("usage.sqlite3"), &[])?;
        let conn = connect(&root)?;
        sql(conn.execute_batch(SCHEMA))?;
        sql(conn.execute(
            "INSERT INTO metadata VALUES('identity_hash',?1)",
            [enouia_common::sha256_hex(bytes.as_bytes())],
        ))?;
        for (source, id) in [
            (Source::CodexLocal, &identity.codex),
            (Source::ClaudeLocal, &identity.claude),
        ] {
            sql(conn.execute(
                "INSERT INTO datasets(source,dataset,revision,coverage) VALUES(?1,?2,0,?3)",
                params![source.name(), id, encode(&Coverage::default())?],
            ))?;
        }
        drop(parent);
        Ok(Self {
            conn,
            key: IdentityKey::from_bytes(identity.key),
            root,
            _lock: lock,
        })
    }
    pub fn open(path: &Path) -> Result<Self> {
        safety::data_location(path)?;
        let root = safety::directory(path)?;
        safety::check_private(&root.path)?;
        let lock = safety::writer_lock(&root)?;
        let mut file = safety::read_file(&root.path.join("identity.json"))?;
        safety::check_file_private(&root.path.join("identity.json"))?;
        if file.metadata().map_err(|_| Error::UnsafePath)?.len() > 2048 {
            return Err(Error::StorageFailed);
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|_| Error::StorageFailed)?;
        let identity: Identity =
            serde_json::from_slice(&bytes).map_err(|_| Error::StorageFailed)?;
        if identity.version != 1 {
            return Err(Error::StorageFailed);
        }
        let conn = connect(&root)?;
        if sql(conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)))? != 1 {
            return Err(Error::StorageFailed);
        }
        if sql(conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0)))? != "ok" {
            return Err(Error::StorageFailed);
        }
        let expected: String = sql(conn.query_row(
            "SELECT value FROM metadata WHERE key='identity_hash'",
            [],
            |r| r.get(0),
        ))?;
        if expected != enouia_common::sha256_hex(&bytes) {
            return Err(Error::StorageFailed);
        }
        for (s, id) in [
            (Source::CodexLocal, identity.codex),
            (Source::ClaudeLocal, identity.claude),
        ] {
            let actual: String = sql(conn.query_row(
                "SELECT dataset FROM datasets WHERE source=?1",
                [s.name()],
                |r| r.get(0),
            ))?;
            if actual != id {
                return Err(Error::StorageFailed);
            }
        }
        Ok(Self {
            conn,
            key: IdentityKey::from_bytes(identity.key),
            root,
            _lock: lock,
        })
    }
    pub fn root(&self) -> &Path {
        &self.root.path
    }
    pub fn health(&self, source: Source) -> Result<Health> {
        health(&self.conn, source)
    }
    pub(crate) fn batch(&mut self, source: Source) -> Result<Batch<'_>> {
        let tx = sql(self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate))?;
        sql(tx.execute_batch("DELETE FROM dirty; DELETE FROM seen;"))?;
        let revision: i64 = sql(tx.query_row(
            "SELECT revision FROM datasets WHERE source=?1",
            [source.name()],
            |r| r.get(0),
        ))?;
        Ok(Batch {
            tx,
            source,
            revision: revision
                .checked_add(1)
                .filter(|r| *r > 0)
                .ok_or(Error::Overflow)?,
            new: 0,
            duplicates: 0,
        })
    }
    pub(crate) fn failed_attempt(&self, source: Source, at: &str, error: Error) -> Result<()> {
        crate::time::timestamp(at)?;
        sql(self.conn.execute(
            "UPDATE datasets SET last_attempt=?2,attempt_error=?3 WHERE source=?1",
            params![source.name(), at, encode(&error)?],
        ))?;
        Ok(())
    }
    /// Rebuild from retained normalized evidence, never from guessed missing transcripts.
    pub fn replay(&mut self, source: Source, at: &str) -> Result<Health> {
        let old = self.health(source)?;
        let b = self.batch(source)?;
        sql(b.tx.execute(
            "INSERT INTO dirty SELECT DISTINCT gid FROM variants WHERE source=?1",
            [source.name()],
        ))?;
        b.finish_checked(old.coverage, at, false, false, &|| Ok(()))?;
        self.health(source)
    }
    /// Explicit reviewed selection for one opaque identity; None excludes it. Immutable audit.
    pub fn resolve(
        &mut self,
        source: Source,
        group: &str,
        identity: &str,
        digest: Option<&str>,
        at: &str,
    ) -> Result<Health> {
        if ![group, identity].iter().all(|s| is_digest(s)) || digest.is_some_and(|s| !is_digest(s))
        {
            return Err(Error::InvalidSchema);
        }
        let old = self.health(source)?;
        let b = self.batch(source)?;
        let exists:bool=sql(b.tx.query_row("SELECT EXISTS(SELECT 1 FROM variants WHERE source=?1 AND gid=?2 AND iid=?3 AND (?4 IS NULL OR digest=?4))",params![source.name(),group,identity,digest],|r|r.get(0)))?;
        if !exists {
            return Err(Error::Conflict);
        }
        sql(b.tx.execute("INSERT INTO choices VALUES(?1,?2,?3,?4) ON CONFLICT(source,gid,iid) DO UPDATE SET digest=excluded.digest",params![source.name(),group,identity,digest]))?;
        sql(b.tx.execute(
            "INSERT INTO decisions VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                source.name(),
                b.revision,
                group,
                identity,
                digest,
                ADAPTER_VERSION
            ],
        ))?;
        sql(b
            .tx
            .execute("INSERT OR IGNORE INTO dirty VALUES(?1)", [group]))?;
        b.finish_checked(old.coverage, at, true, false, &|| Ok(()))?;
        self.health(source)
    }
    /// Opaque candidate handles only; payloads and private identifiers never leave this API.
    pub fn candidates(
        &self,
        source: Source,
        limit: usize,
    ) -> Result<Vec<(String, String, String)>> {
        if limit > 2000 {
            return Err(Error::BudgetExceeded);
        }
        let mut q=sql(self.conn.prepare("SELECT v.gid,v.iid,v.digest FROM variants v JOIN current_groups g ON g.source=v.source AND g.gid=v.gid WHERE v.source=?1 AND g.conflict=1 ORDER BY v.gid,v.iid,v.digest LIMIT ?2"))?;
        let rows = sql(q.query_map(params![source.name(), limit as u32], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        }))?;
        rows.map(sql).collect()
    }
    /// Private review view: counts and supported dimensions only, never a raw observation.
    pub fn inspect(
        &self,
        source: Source,
        group: &str,
        identity: &str,
        digest: &str,
    ) -> Result<serde_json::Value> {
        if ![group, identity, digest].iter().all(|s| is_digest(s)) {
            return Err(Error::InvalidSchema);
        }
        let payload: Option<String> = sql(self
            .conn
            .query_row(
                "SELECT payload FROM variants WHERE source=?1 AND gid=?2 AND iid=?3 AND digest=?4",
                params![source.name(), group, identity, digest],
                |r| r.get(0),
            )
            .optional())?;
        let record: Record = decode(&payload.ok_or(Error::Conflict)?)?;
        Ok(match record {
            Record::Checkpoint { vector } => {
                serde_json::json!({"kind":"checkpoint","counts":vector.counts()?,"time_basis":"checkpoint_unknown"})
            }
            Record::Step {
                before,
                after,
                fact,
            } => {
                serde_json::json!({"kind":"step","before_counts":before.counts()?,"after_counts":after.counts()?,"measurement":fact.wire(source)})
            }
            Record::Message { fact, sidechain } => {
                serde_json::json!({"kind":"message","sidechain":sidechain,"measurement":fact.wire(source)})
            }
        })
    }
}
fn is_digest(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn connect(root: &safety::Directory) -> Result<Connection> {
    for name in ["usage.sqlite3", "usage.sqlite3-wal", "usage.sqlite3-shm"] {
        let p = root.path.join(name);
        if p.try_exists().map_err(|_| Error::UnsafePath)? {
            drop(safety::read_file(&p)?);
            safety::check_file_private(&p)?;
        } else if name == "usage.sqlite3" {
            return Err(Error::StorageFailed);
        }
    }
    let c = sql(Connection::open_with_flags(
        root.path.join("usage.sqlite3"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ))?;
    sql(c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-8192; PRAGMA temp_store=FILE; PRAGMA busy_timeout=0; PRAGMA max_page_count=2097152; CREATE TEMP TABLE dirty(gid TEXT PRIMARY KEY); CREATE TEMP TABLE seen(origin TEXT PRIMARY KEY); CREATE TEMP TABLE chosen(iid TEXT PRIMARY KEY,digest TEXT,kind TEXT,before_v TEXT,after_v TEXT,payload TEXT); CREATE INDEX chosen_before ON chosen(before_v); CREATE INDEX chosen_after ON chosen(after_v); CREATE TEMP TABLE projected(fid TEXT PRIMARY KEY,payload TEXT);"))?;
    Ok(c)
}
pub(crate) fn health(c: &Connection, s: Source) -> Result<Health> {
    let (revision,last_attempt,last_completed,last_successful,error,coverage):(i64,Option<String>,Option<String>,Option<String>,Option<String>,String)=sql(c.query_row("SELECT revision,last_attempt,last_completed,last_successful,attempt_error,coverage FROM datasets WHERE source=?1",[s.name()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))))?;
    Ok(Health{revision,last_attempt,last_completed,last_successful,attempt_error:error.as_deref().map(decode).transpose()?,coverage:decode(&coverage)?,conflicts:sql(c.query_row("SELECT COUNT(*) FROM current_groups WHERE source=?1 AND conflict=1",[s.name()],|r|r.get(0)))?,accepted_facts:sql(c.query_row("SELECT COUNT(*) FROM facts f JOIN current_groups g ON f.source=g.source AND f.gid=g.gid AND f.revision=g.facts_revision WHERE f.source=?1",[s.name()],|r|r.get(0)))?})
}
pub(crate) struct Batch<'a> {
    pub tx: Transaction<'a>,
    pub source: Source,
    pub revision: i64,
    pub new: u64,
    pub duplicates: u64,
}
impl Batch<'_> {
    pub fn ingest(&mut self, o: &Observation) -> Result<()> {
        if o.source != self.source {
            return Err(Error::UnsupportedSource);
        }
        let payload = encode(&o.record)?;
        let digest = enouia_common::sha256_hex(payload.as_bytes());
        let (kind, before, after) = match &o.record {
            Record::Checkpoint { vector } => ("checkpoint", None, Some(vector.vertex())),
            Record::Step { before, after, .. } => {
                ("step", Some(before.vertex()), Some(after.vertex()))
            }
            Record::Message { .. } => ("message", None, None),
        };
        let n = sql(self.tx.execute(
            "INSERT OR IGNORE INTO variants VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                self.source.name(),
                o.group,
                o.identity,
                digest,
                kind,
                before,
                after,
                payload,
                ADAPTER_VERSION
            ],
        ))?;
        if n == 0 {
            self.duplicates += 1;
        } else {
            self.new += 1;
            // A reviewed variant is scoped to evidence known at review time. New metering
            // evidence reopens the conflict; an explicit whole-identity exclusion stays in force.
            sql(self.tx.execute(
                "DELETE FROM choices WHERE source=?1 AND gid=?2 AND iid=?3 AND digest IS NOT NULL",
                params![self.source.name(), o.group, o.identity],
            ))?;
            sql(self
                .tx
                .execute("INSERT OR IGNORE INTO dirty VALUES(?1)", [&o.group]))?;
        }
        Ok(())
    }
    pub fn seen(&self, origin: &str) -> Result<()> {
        sql(self
            .tx
            .execute("INSERT OR IGNORE INTO seen VALUES(?1)", [origin]))?;
        sql(self.tx.execute(
            "INSERT OR IGNORE INTO files VALUES(?1,?2)",
            params![self.source.name(), origin],
        ))?;
        Ok(())
    }
    pub fn retained(&self) -> Result<u64> {
        let count:i64=sql(self.tx.query_row("SELECT COUNT(*) FROM files WHERE source=?1 AND origin NOT IN (SELECT origin FROM seen)",[self.source.name()],|r|r.get(0)))?;
        u64::try_from(count).map_err(|_| Error::StorageFailed)
    }
    #[cfg(test)]
    pub fn finish(self, coverage: Coverage, at: &str, force: bool) -> Result<()> {
        self.finish_checked(coverage, at, force, true, &|| Ok(()))
    }
    pub fn finish_checked(
        self,
        coverage: Coverage,
        at: &str,
        force: bool,
        scan: bool,
        check: &impl Fn() -> Result<()>,
    ) -> Result<()> {
        crate::time::timestamp(at)?;
        let mut changed = force;
        let mut last = String::new();
        loop {
            check()?;
            let gid: Option<String> = sql(self
                .tx
                .query_row(
                    "SELECT gid FROM dirty WHERE gid>?1 ORDER BY gid LIMIT 1",
                    [&last],
                    |r| r.get(0),
                )
                .optional())?;
            let Some(gid) = gid else {
                break;
            };
            last = gid.clone();
            changed |= self.project(&gid, check)?;
        }
        let old: String = sql(self.tx.query_row(
            "SELECT coverage FROM datasets WHERE source=?1",
            [self.source.name()],
            |r| r.get(0),
        ))?;
        let coverage_json = encode(&coverage)?;
        changed |= old != coverage_json;
        let conflicts: i64 = sql(self.tx.query_row(
            "SELECT COUNT(*) FROM current_groups WHERE source=?1 AND conflict=1",
            [self.source.name()],
            |r| r.get(0),
        ))?;
        if changed {
            sql(self.tx.execute(
                "INSERT INTO revisions VALUES(?1,?2,?3,?4,?5)",
                params![
                    self.source.name(),
                    self.revision,
                    at,
                    coverage_json,
                    ADAPTER_VERSION
                ],
            ))?;
            sql(self.tx.execute(
                "UPDATE datasets SET revision=?2,coverage=?3 WHERE source=?1",
                params![self.source.name(), self.revision, coverage_json],
            ))?;
        }
        if scan {
            sql(self.tx.execute("UPDATE datasets SET last_attempt=?2,last_completed=?2,attempt_error=NULL,last_successful=CASE WHEN ?3 THEN ?2 ELSE last_successful END WHERE source=?1",params![self.source.name(),at,coverage.complete()&&conflicts==0]))?;
        }
        check()?;
        sql(self.tx.commit())
    }
    fn project(&self, gid: &str, check: &impl Fn() -> Result<()>) -> Result<bool> {
        sql(self.tx.execute_batch("DELETE FROM chosen;"))?;
        // A reviewed choice can select a variant or explicitly exclude an identity.
        sql(self.tx.execute("INSERT INTO chosen SELECT v.iid,v.digest,v.kind,v.before_v,v.after_v,v.payload FROM variants v LEFT JOIN choices c ON c.source=v.source AND c.gid=v.gid AND c.iid=v.iid WHERE v.source=?1 AND v.gid=?2 AND ((c.iid IS NOT NULL AND c.digest=v.digest) OR (c.iid IS NULL AND (SELECT COUNT(*) FROM variants x WHERE x.source=v.source AND x.gid=v.gid AND x.iid=v.iid)=1))",params![self.source.name(),gid]))?;
        let ambiguity:bool=sql(self.tx.query_row("SELECT EXISTS(SELECT 1 FROM variants v LEFT JOIN choices c ON c.source=v.source AND c.gid=v.gid AND c.iid=v.iid WHERE v.source=?1 AND v.gid=?2 AND c.iid IS NULL GROUP BY v.iid HAVING COUNT(*)>1)",params![self.source.name(),gid],|r|r.get(0)))?;
        let previous:Option<(i64,String,bool)>=sql(self.tx.query_row("SELECT facts_revision,fingerprint,conflict FROM current_groups WHERE source=?1 AND gid=?2",params![self.source.name(),gid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional())?;
        let mut conflict = ambiguity;
        // Stage projection in SQL, so session length never requires a graph-sized Rust collection.
        sql(self.tx.execute_batch("DELETE FROM projected;"))?;
        if !conflict {
            conflict = match self.source {
                Source::ClaudeLocal => self.project_claude()?,
                Source::CodexLocal => self.project_codex(check)?,
            };
        }
        let mut fingerprint = String::new();
        if !conflict {
            let mut q = sql(self
                .tx
                .prepare("SELECT fid,payload FROM projected ORDER BY fid"))?;
            let mut rows = sql(q.query([]))?;
            while let Some(r) = sql(rows.next())? {
                let id: String = sql(r.get(0))?;
                let p: String = sql(r.get(1))?;
                fingerprint = enouia_common::sha256_hex(format!("{fingerprint}{id}{p}").as_bytes());
            }
        } else if let Some((_, old, _)) = &previous {
            fingerprint = old.clone();
        }
        if previous
            .as_ref()
            .is_some_and(|(_, old, c)| old == &fingerprint && *c == conflict)
        {
            return Ok(false);
        }
        let facts_revision = if conflict {
            previous.as_ref().map_or(0, |p| p.0)
        } else {
            self.revision
        };
        if !conflict {
            sql(self.tx.execute(
                "INSERT INTO facts SELECT ?1,?2,?3,fid,payload FROM projected",
                params![self.source.name(), gid, self.revision],
            ))?;
        }
        sql(self.tx.execute(
            "INSERT INTO group_history VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                self.source.name(),
                gid,
                self.revision,
                facts_revision,
                fingerprint,
                conflict
            ],
        ))?;
        sql(self.tx.execute("INSERT INTO current_groups VALUES(?1,?2,?3,?4,?5) ON CONFLICT(source,gid) DO UPDATE SET facts_revision=excluded.facts_revision,fingerprint=excluded.fingerprint,conflict=excluded.conflict",params![self.source.name(),gid,facts_revision,fingerprint,conflict]))?;
        Ok(true)
    }
    fn fact(&self, id: &str, fact: &Fact) -> Result<()> {
        fact.counts.validate()?;
        sql(self.tx.execute(
            "INSERT INTO projected VALUES(?1,?2)",
            params![id, encode(fact)?],
        ))?;
        Ok(())
    }
    fn project_claude(&self) -> Result<bool> {
        let mut q = sql(self.tx.prepare("SELECT payload FROM chosen ORDER BY iid"))?;
        let mut rows = sql(q.query([]))?;
        let mut first: Option<Fact> = None;
        while let Some(row) = sql(rows.next())? {
            let p: String = sql(row.get(0))?;
            let Record::Message { fact, .. } = decode(&p)? else {
                return Ok(true);
            };
            if let Some(old) = &first {
                if old != &fact {
                    return Ok(true);
                }
            } else {
                first = Some(fact);
            }
        }
        // Replayed parent/sidechain messages with identical metering facts count once globally.
        if let Some(f) = first {
            self.fact("message", &f)?;
        }
        Ok(false)
    }
    fn project_codex(&self, check: &impl Fn() -> Result<()>) -> Result<bool> {
        let branching:bool=sql(self.tx.query_row("SELECT EXISTS(SELECT before_v FROM chosen WHERE kind='step' GROUP BY before_v HAVING COUNT(*)>1 UNION ALL SELECT after_v FROM chosen WHERE kind='step' GROUP BY after_v HAVING COUNT(*)>1)",[],|r|r.get(0)))?;
        if branching {
            return Ok(true);
        }
        let roots_sql = "SELECT vertex FROM (SELECT after_v vertex FROM chosen WHERE kind='checkpoint' UNION SELECT before_v FROM chosen WHERE kind='step') WHERE vertex NOT IN (SELECT after_v FROM chosen WHERE kind='step') ORDER BY vertex LIMIT 2";
        let roots: Vec<String> = {
            let mut q = sql(self.tx.prepare(roots_sql))?;
            let r = sql(q.query_map([], |r| r.get(0)))?;
            r.map(sql).collect::<Result<_>>()?
        };
        let total: i64 = sql(self
            .tx
            .query_row("SELECT COUNT(*) FROM chosen", [], |r| r.get(0)))?;
        if total == 0 {
            return Ok(false);
        }
        if roots.len() != 1 {
            return Ok(true);
        }
        let mut vertex = roots[0].clone();
        let payload:String=sql(self.tx.query_row("SELECT payload FROM chosen WHERE (kind='checkpoint' AND after_v=?1) OR (kind='step' AND before_v=?1) LIMIT 1",[&vertex],|r|r.get(0)))?;
        let vector = match decode(&payload)? {
            Record::Checkpoint { vector } => vector,
            Record::Step { before, .. } => before,
            _ => return Ok(true),
        };
        if !vector.total.is_zero() {
            self.fact(
                "baseline",
                &Fact::new(
                    "unknown".into(),
                    "unknown".into(),
                    "unknown".into(),
                    None,
                    vector.counts()?,
                ),
            )?;
        }
        let mut visited = 0_i64;
        loop {
            check()?;
            let next: Option<(String, String, String)> = sql(self
                .tx
                .query_row(
                    "SELECT iid,after_v,payload FROM chosen WHERE kind='step' AND before_v=?1",
                    [&vertex],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional())?;
            let Some((id, after, payload)) = next else {
                break;
            };
            let Record::Step { fact, .. } = decode(&payload)? else {
                return Ok(true);
            };
            self.fact(&id, &fact)?;
            vertex = after;
            visited += 1;
            if visited > total {
                return Ok(true);
            }
        }
        let edges: i64 =
            sql(self
                .tx
                .query_row("SELECT COUNT(*) FROM chosen WHERE kind='step'", [], |r| {
                    r.get(0)
                }))?;
        // Disconnected checkpoints also indicate missing lineage, not another additive baseline.
        let disconnected:bool=sql(self.tx.query_row("SELECT EXISTS(SELECT 1 FROM chosen c WHERE c.kind='checkpoint' AND c.after_v<>?1 AND NOT EXISTS(SELECT 1 FROM chosen e WHERE e.kind='step' AND e.after_v=c.after_v))",[&roots[0]],|r|r.get(0)))?;
        Ok(visited != edges || disconnected)
    }
}
const SCHEMA:&str="
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE datasets(source TEXT PRIMARY KEY,dataset TEXT NOT NULL,revision INTEGER NOT NULL,coverage TEXT NOT NULL,last_attempt TEXT,last_completed TEXT,last_successful TEXT,attempt_error TEXT);
CREATE TABLE variants(source TEXT,gid TEXT,iid TEXT,digest TEXT,kind TEXT,before_v TEXT,after_v TEXT,payload TEXT,adapter TEXT,PRIMARY KEY(source,gid,iid,digest));
CREATE TABLE choices(source TEXT,gid TEXT,iid TEXT,digest TEXT,PRIMARY KEY(source,gid,iid));
CREATE TABLE decisions(source TEXT,revision INTEGER,gid TEXT,iid TEXT,digest TEXT,adapter TEXT);
CREATE TABLE revisions(source TEXT,revision INTEGER,completed TEXT,coverage TEXT,adapter TEXT,PRIMARY KEY(source,revision));
CREATE TABLE facts(source TEXT,gid TEXT,revision INTEGER,fid TEXT,payload TEXT,PRIMARY KEY(source,gid,revision,fid));
CREATE TABLE current_groups(source TEXT,gid TEXT,facts_revision INTEGER,fingerprint TEXT,conflict INTEGER,PRIMARY KEY(source,gid));
CREATE TABLE group_history(source TEXT,gid TEXT,revision INTEGER,facts_revision INTEGER,fingerprint TEXT,conflict INTEGER,PRIMARY KEY(source,gid,revision));
CREATE TABLE files(source TEXT,origin TEXT,PRIMARY KEY(source,origin));
PRAGMA user_version=1;";

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    fn observation(key: &IdentityKey, id: &str) -> Observation {
        crate::adapter::claude(&serde_json::json!({"type":"assistant","timestamp":"2026-10-20T12:00:00Z","message":{"id":id,"model":"fictional","usage":{"input_tokens":1,"output_tokens":1}}}),key,&crate::adapter::Models::new(&[]).unwrap()).unwrap().unwrap()
    }
    #[test]
    #[ignore = "child process entry, invoked by crash_reopen"]
    fn crash_child() {
        let root = std::env::var_os("USAGE_CRASH_ROOT").expect("test fixture root");
        let phase = std::env::var("USAGE_CRASH_PHASE").unwrap();
        let mut l = Ledger::open(Path::new(&root)).unwrap();
        let key = IdentityKey::from_bytes(l.key.0);
        sql(l.conn.execute_batch("PRAGMA cache_size=-64;")).unwrap();
        let mut b = l.batch(Source::ClaudeLocal).unwrap();
        // Force dirty page spill, then terminate without Rust destructors or SQLite close.
        for i in 0..1000 {
            b.ingest(&observation(&key, &format!("fictional-crash-{i}")))
                .unwrap();
        }
        if phase == "before" {
            std::process::exit(86);
        }
        b.finish(Coverage::default(), "2026-10-21T12:00:00Z", false)
            .unwrap();
        std::process::exit(87);
    }
    #[test]
    fn crash_reopen_and_transaction_failure() {
        let root =
            std::env::temp_dir().join(format!("enouia-usage-crash-{}", safety::uuid().unwrap()));
        let mut l = Ledger::init(&root).unwrap();
        let key = IdentityKey::from_bytes(l.key.0);
        let mut b = l.batch(Source::ClaudeLocal).unwrap();
        b.ingest(&observation(&key, "fictional-confirmed")).unwrap();
        b.finish(Coverage::default(), "2026-10-21T12:00:00Z", false)
            .unwrap();
        let before = l.health(Source::ClaudeLocal).unwrap();
        drop(l);
        for (phase, code, count) in [("before", 86, 1), ("after", 87, 1001)] {
            let status = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "store::tests::crash_child", "--ignored"])
                .env("USAGE_CRASH_ROOT", &root)
                .env("USAGE_CRASH_PHASE", phase)
                .status()
                .unwrap();
            assert_eq!(status.code(), Some(code));
            let l = Ledger::open(&root).unwrap();
            let h = l.health(Source::ClaudeLocal).unwrap();
            assert_eq!(h.accepted_facts, count);
            if phase == "before" {
                assert_eq!(h.revision, before.revision);
            }
            drop(l);
        }
        let mut l = Ledger::open(&root).unwrap();
        let h = l.health(Source::ClaudeLocal).unwrap();
        sql(l.conn.execute_batch("CREATE TRIGGER fixture_fail BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT,'fixture'); END;")).unwrap();
        let mut b = l.batch(Source::ClaudeLocal).unwrap();
        b.ingest(&observation(&key, "fictional-failed")).unwrap();
        assert_eq!(
            b.finish(Coverage::default(), "2026-10-21T12:00:00Z", false),
            Err(Error::StorageFailed)
        );
        assert_eq!(l.health(Source::ClaudeLocal).unwrap().revision, h.revision);
        assert_eq!(
            l.health(Source::ClaudeLocal).unwrap().accepted_facts,
            h.accepted_facts
        );
        drop(l);
        assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
        std::fs::remove_dir_all(root).unwrap();
    }
}
