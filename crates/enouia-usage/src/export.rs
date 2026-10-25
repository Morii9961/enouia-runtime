//! Closed aggregate construction, never database-record serialization/redaction.
use crate::adapter::{ADAPTER_VERSION, Fact, Source};
use crate::count::Token;
use crate::store::{Health, Ledger, decode, encode, health, sql};
use crate::{Error, Result, contract, safety};
use rusqlite::TransactionBehavior;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::Path;

pub const NOTICE: &str =
    "Export contains aggregates only, not source text. 导出只含聚合，不含源正文。";
pub struct Export {
    pub bytes: Vec<u8>,
    pub health: Health,
}
type Reasons = BTreeMap<String, Option<Token>>;
fn quality(reasons: &Reasons) -> Value {
    json!({"state":"reported","reasons":reasons.iter().map(|(code,n)|json!({"code":code,"occurrences":n})).collect::<Vec<_>>()})
}
fn merge(a: &mut Reasons, b: &Reasons) -> Result<()> {
    for (k, n) in b {
        if let Some(old) = a.get_mut(k) {
            *old = match (&*old, n) {
                (Some(x), Some(y)) => Some(x.add(y)?),
                _ => None,
            };
        } else {
            a.insert(k.clone(), n.clone());
        }
    }
    Ok(())
}
fn issue(reasons: &mut Reasons, code: &str, number: Option<u64>) -> Result<()> {
    if number == Some(0) {
        return Ok(());
    }
    merge(
        reasons,
        &BTreeMap::from([(code.into(), number.map(Token::from_u64))]),
    )
}
impl Ledger {
    /// Range replacement with a complete dataset-wide unallocated set, even outside the range.
    pub fn export(
        &mut self,
        source: Source,
        start: &str,
        end: &str,
        generated_at: &str,
    ) -> Result<Export> {
        let dates = crate::time::range(start, end)?;
        crate::time::timestamp(generated_at)?;
        let tx = sql(self
            .conn
            .transaction_with_behavior(TransactionBehavior::Deferred))?;
        let health = health(&tx, source)?;
        if health.revision <= 0 {
            return Err(Error::Unconfigured);
        }
        let dataset: String = sql(tx.query_row(
            "SELECT dataset FROM datasets WHERE source=?1",
            [source.name()],
            |r| r.get(0),
        ))?;
        let mut groups: BTreeMap<String, Fact> = BTreeMap::new();
        let mut reasons = Reasons::new();
        let mut q=sql(tx.prepare("SELECT f.payload FROM facts f JOIN current_groups g ON f.source=g.source AND f.gid=g.gid AND f.revision=g.facts_revision WHERE f.source=?1 ORDER BY f.gid,f.fid"))?;
        let mut rows = sql(q.query([source.name()]))?;
        while let Some(row) = sql(rows.next())? {
            let payload: String = sql(row.get(0))?;
            let fact: Fact = decode(&payload)?;
            fact.counts.validate()?;
            // Identity includes all exported dimensions (including cache knownness), not quality/counts.
            let mut dims = fact.wire(source);
            dims.as_object_mut()
                .ok_or(Error::StorageFailed)?
                .remove("counts");
            dims.as_object_mut().unwrap().remove("quality");
            let key = encode(&dims)?;
            merge(&mut reasons, &fact.reasons)?;
            if let Some(old) = groups.get_mut(&key) {
                old.counts = old.counts.add(&fact.counts)?;
                merge(&mut old.reasons, &fact.reasons)?;
            } else {
                if groups.len() >= 2000 {
                    return Err(Error::BudgetExceeded);
                }
                groups.insert(key, fact);
            }
        }
        drop(rows);
        drop(q);
        let c = &health.coverage;
        issue(&mut reasons, "parse_rejected", Some(c.rejected))?;
        issue(&mut reasons, "counter_reset", Some(c.counter_resets))?;
        issue(&mut reasons, "incomplete_tail", Some(c.incomplete_tails))?;
        issue(&mut reasons, "source_missing", Some(c.retained_files))?;
        // Directory failures / unread compressed records do not provide a file/record cardinality.
        if c.unreadable + c.unsafe_entries > 0 {
            issue(&mut reasons, "source_unreadable", None)?;
        }
        if c.unsupported > 0 {
            issue(&mut reasons, "unsupported_source", None)?;
        }
        if c.retained_files > 0 {
            issue(&mut reasons, "retained_not_observed", None)?;
        }
        if health.conflicts > 0 {
            issue(
                &mut reasons,
                "session_copy_conflict",
                if source == Source::CodexLocal {
                    Some(health.conflicts as u64)
                } else {
                    None
                },
            )?;
        }
        let snapshot = json!({"kind":"ai_usage_snapshot","schema_version":"1.1","mode":"range_replacement","dataset_id":dataset,"revision":health.revision.to_string(),"generated_at":generated_at,"timezone":"Asia/Shanghai","source":source.name(),"source_timezone":"Asia/Shanghai","range":{"start":start,"end_exclusive":end},"adapter_version":ADAPTER_VERSION,
            // Supported legacy shapes have no proven request-start date. Never manufacture daily zero.
            "days":dates.into_iter().map(|date|json!({"date":date,"state":"not_collected","quality":{"state":"not_reported","reasons":[]}})).collect::<Vec<_>>(),
            "rows":[],"quality":quality(&reasons),"unallocated":groups.into_values().map(|f|f.wire(source)).collect::<Vec<_>>()});
        let bytes = serde_json::to_vec(&snapshot).map_err(|_| Error::StorageFailed)?;
        contract::parse(&bytes)?;
        sql(tx.commit())?;
        Ok(Export { bytes, health })
    }
    /// New local file only; caller chooses its location. No overwrite or transmission.
    pub fn export_file(
        &mut self,
        source: Source,
        start: &str,
        end: &str,
        at: &str,
        path: &Path,
    ) -> Result<Health> {
        let parent = safety::directory(path.parent().ok_or(Error::UnsafePath)?)?;
        // Exports may be put inside the selected private root, never over canonical state.
        let export = self.export(source, start, end, at)?;
        safety::write_new(
            &parent.path.join(path.file_name().ok_or(Error::UnsafePath)?),
            &export.bytes,
        )?;
        Ok(export.health)
    }
}
