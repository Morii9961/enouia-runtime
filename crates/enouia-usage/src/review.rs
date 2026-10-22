//! Bounded review pages and evidence-bound confirmations for the manual client.
use crate::adapter::Source;
use crate::store::{Ledger, decode, encode, sql};
use crate::{Error, Result, bounded_json};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub group: String,
    pub identity: String,
    pub digest: String,
}
#[derive(Serialize)]
pub struct CandidatePage {
    pub items: Vec<Candidate>,
    pub next_cursor: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Stamp {
    purpose: String,
    source: Source,
    revision: i64,
    evidence: i64,
    candidate: Candidate,
}
impl Ledger {
    fn stamp(&self, purpose: &str, source: Source, candidate: Candidate) -> Result<Stamp> {
        let revision = self.health(source)?.revision;
        let evidence = sql(self.conn.query_row(
            "SELECT COUNT(*) FROM variants WHERE source=?1",
            [source.name()],
            |r| r.get(0),
        ))?;
        Ok(Stamp {
            purpose: purpose.into(),
            source,
            revision,
            evidence,
            candidate,
        })
    }
    fn seal(&self, stamp: &Stamp) -> Result<String> {
        let payload = encode(stamp)?;
        encode(
            &json!({"payload":payload,"seal":self.key.digest("usage_review_v1",&[payload.as_bytes()])}),
        )
    }
    fn checked_stamp(&self, text: &str, purpose: &str, source: Source) -> Result<Stamp> {
        let v = bounded_json(text.as_bytes(), 2048)?;
        if v.as_object().is_none_or(|o| o.len() != 2) {
            return Err(Error::InvalidSchema);
        }
        let payload = v["payload"].as_str().ok_or(Error::InvalidSchema)?;
        if v["seal"] != self.key.digest("usage_review_v1", &[payload.as_bytes()]) {
            return Err(Error::StaleRead);
        }
        let stamp: Stamp = decode(payload)?;
        let current = self.stamp(purpose, source, stamp.candidate.clone())?;
        if stamp.purpose != purpose
            || stamp.source != source
            || stamp.revision != current.revision
            || stamp.evidence != current.evidence
        {
            return Err(Error::StaleRead);
        }
        Ok(stamp)
    }
    pub fn candidate_page(
        &self,
        source: Source,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<CandidatePage> {
        if !(1..=100).contains(&limit) {
            return Err(Error::BudgetExceeded);
        }
        let after = if let Some(c) = cursor {
            self.checked_stamp(c, "page", source)?.candidate
        } else {
            Candidate {
                group: String::new(),
                identity: String::new(),
                digest: String::new(),
            }
        };
        let mut q=sql(self.conn.prepare("SELECT v.gid,v.iid,v.digest FROM variants v JOIN current_groups g ON g.source=v.source AND g.gid=v.gid WHERE v.source=?1 AND g.conflict=1 AND (v.gid,v.iid,v.digest)>(?2,?3,?4) ORDER BY v.gid,v.iid,v.digest LIMIT ?5"))?;
        let rows = sql(q.query_map(
            params![
                source.name(),
                after.group,
                after.identity,
                after.digest,
                limit + 1
            ],
            |r| {
                Ok(Candidate {
                    group: r.get(0)?,
                    identity: r.get(1)?,
                    digest: r.get(2)?,
                })
            },
        ))?;
        let mut items = rows.map(sql).collect::<Result<Vec<_>>>()?;
        let more = items.len() > limit as usize;
        if more {
            items.pop();
        }
        let next_cursor = if more {
            Some(self.seal(&self.stamp(
                "page",
                source,
                items.last().ok_or(Error::StorageFailed)?.clone(),
            )?)?)
        } else {
            None
        };
        Ok(CandidatePage { items, next_cursor })
    }
    pub fn review_candidate(&self, source: Source, candidate: &Candidate) -> Result<Value> {
        let view = self.inspect(
            source,
            &candidate.group,
            &candidate.identity,
            &candidate.digest,
        )?;
        let token = self.seal(&self.stamp("review", source, candidate.clone())?)?;
        Ok(json!({"view":view,"review_token":token}))
    }
    pub fn resolve_reviewed(
        &mut self,
        source: Source,
        token: &str,
        exclude: bool,
        at: &str,
    ) -> Result<crate::store::Health> {
        let stamp = self.checked_stamp(token, "review", source)?;
        let c = stamp.candidate;
        self.resolve(
            source,
            &c.group,
            &c.identity,
            if exclude { None } else { Some(&c.digest) },
            at,
        )
    }
}
