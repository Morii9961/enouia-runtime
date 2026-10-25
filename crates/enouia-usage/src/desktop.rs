//! Private one-shot stdin channel. Paths belong to the native host, never the web page.
use crate::adapter::{Fact, Source};
use crate::count::Counts;
use crate::review::Candidate;
use crate::scan::{Limits, Selection};
use crate::store::{Ledger, decode, sql};
use crate::{Error, Result};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    version: u8,
    root: PathBuf,
    source: Source,
    action: Action,
}
#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
enum Action {
    Init {
        confirm: bool,
    },
    Overview,
    Scan {
        roots: Vec<PathBuf>,
        models: Vec<String>,
    },
    Replay,
    Candidates {
        cursor: Option<String>,
    },
    Inspect {
        candidate: Candidate,
    },
    Resolve {
        review_token: String,
        exclude: bool,
    },
    Export {
        start: String,
        end_exclusive: String,
        output: PathBuf,
    },
}
impl Request {
    pub fn run(self, at: &str) -> Result<Value> {
        if self.version != 1 {
            return Err(Error::InvalidSchema);
        }
        if matches!(self.action, Action::Init { confirm: true }) {
            let l = Ledger::init(&self.root)?;
            return l.overview(self.source);
        }
        if matches!(self.action, Action::Init { .. }) {
            return Err(Error::Unconfigured);
        }
        let mut l = Ledger::open(&self.root)?;
        match self.action {
            Action::Init { .. } => Err(Error::Unconfigured),
            Action::Overview => l.overview(self.source),
            Action::Scan { roots, models } => {
                let s = Selection {
                    source: self.source,
                    roots,
                    models,
                    limits: Limits::default(),
                };
                l.scan(&s, at, &AtomicBool::new(false))?;
                l.overview(self.source)
            }
            Action::Replay => {
                l.replay(self.source, at)?;
                l.overview(self.source)
            }
            Action::Candidates { cursor } => {
                Ok(json!({"page":l.candidate_page(self.source,cursor.as_deref(),64)?}))
            }
            Action::Inspect { candidate } => l.review_candidate(self.source, &candidate),
            Action::Resolve {
                review_token,
                exclude,
            } => {
                l.resolve_reviewed(self.source, &review_token, exclude, at)?;
                l.overview(self.source)
            }
            Action::Export {
                start,
                end_exclusive,
                output,
            } => {
                let health = l.export_file(self.source, &start, &end_exclusive, at, &output)?;
                Ok(json!({"health":health,"exported":true}))
            }
        }
    }
}
impl Ledger {
    pub fn overview(&self, source: Source) -> Result<Value> {
        let health = self.health(source)?;
        let mut counts: Option<Counts> = None;
        let mut q=sql(self.conn.prepare("SELECT f.payload FROM facts f JOIN current_groups g ON f.source=g.source AND f.gid=g.gid AND f.revision=g.facts_revision WHERE f.source=?1 ORDER BY f.gid,f.fid"))?;
        let mut rows = sql(q.query([source.name()]))?;
        while let Some(row) = sql(rows.next())? {
            let text: String = sql(row.get(0))?;
            let fact: Fact = decode(&text)?;
            counts = Some(if let Some(c) = counts {
                c.add(&fact.counts)?
            } else {
                fact.counts
            });
        }
        Ok(
            json!({"source":source,"health":health,"counts":counts,"date_coverage":"unallocated","notice":crate::export::NOTICE}),
        )
    }
}
