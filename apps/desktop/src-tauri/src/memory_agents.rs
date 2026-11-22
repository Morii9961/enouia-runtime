//! ADR-041: Morii's local Agents (Claude Code, Codex) and their persistent
//! read grants on the registered library (Memory ADR-MEM-141/160). Memory owns
//! the grant, its checks and the requests an Agent may submit; Runtime keeps
//! only the local name → principal / grant mapping and shows each plan to
//! Morii before committing it.
use enouia_memory_contract::{
    common::*, ids::*, json::Revision, next::*, ports::IdSource, time::Timestamp,
};
use enouia_memory_vault::{
    OsIdSource,
    automation::segmented::{AgentRequestView, OwnerReadGrantPlan, SegmentedAutomationVault},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::Mutex,
};

/// Defaults recorded in ADR-041 (Morii may change them).
pub const AGENTS: [(&str, &str); 2] = [("claude_code", "Claude Code"), ("codex", "Codex")];
const GRANT_DAYS: i64 = 90;
const DAY_MS: i64 = 86_400_000;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalAgent {
    pub principal: PrincipalId,
    pub grant_id: PolicyId,
}
/// Local file: vault id → agent key → identity. Never written into the library.
type LocalAgents = BTreeMap<String, BTreeMap<String, LocalAgent>>;
/// Local file beside it: vault id → request keys Morii chose to ignore (ADR-042).
type IgnoredRequests = BTreeMap<String, BTreeSet<String>>;
const IGNORED_FILE: &str = "ignored-agent-requests.json";
/// A planned grant held natively: agent key, Core's plan, a new identity for register.
type PendingPlans = BTreeMap<String, (String, OwnerReadGrantPlan, Option<LocalAgent>)>;

pub struct Agents {
    file: Option<PathBuf>,
    pending: Mutex<PendingPlans>,
}
fn code(error: enouia_memory_vault::automation::AutomationFault) -> &'static str {
    use enouia_memory_vault::automation::AutomationFault as F;
    match error {
        F::Stale | F::Conflict => "grant_stale",
        F::Busy => "catalog_busy",
        F::Denied => "grant_denied",
        _ => "grant_refused",
    }
}
impl Agents {
    pub fn new(file: Option<PathBuf>) -> Self {
        Self {
            file,
            pending: Mutex::new(BTreeMap::new()),
        }
    }
    fn load(&self) -> LocalAgents {
        self.file
            .as_ref()
            .and_then(|f| std::fs::read(f).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }
    fn save(&self, all: &LocalAgents) -> Result<(), &'static str> {
        let file = self.file.as_ref().ok_or("agents_file_unavailable")?;
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|_| "agents_file_unavailable")?;
        }
        let bytes = serde_json::to_vec_pretty(all).map_err(|_| "agents_file_unavailable")?;
        std::fs::write(file, bytes).map_err(|_| "agents_file_unavailable")
    }
    pub fn local(&self, vault: &SegmentedAutomationVault) -> BTreeMap<String, LocalAgent> {
        self.load()
            .remove(&vault.descriptor().vault_id.to_string())
            .unwrap_or_default()
    }
    /// The known Agents with their current grants, plus any grant on the
    /// library that this machine has no name for.
    pub fn status(&self, vault: &SegmentedAutomationVault) -> Result<Value, &'static str> {
        let owner = vault.descriptor().created_by.clone();
        let status = vault.owner_read_status(&owner).map_err(code)?;
        let local = self.local(vault);
        let view = |g: &OwnerReadGrant| {
            json!({"grant_id":g.grant_id,"revision":g.revision,"active":g.active,"max_sensitivity":g.max_sensitivity,
                "allow_requests":g.allow_requests,"source_read":g.source_read,"valid_from":g.valid_from,"valid_until":g.valid_until,
                "policies":g.policies.len(),"sources":g.source_ids.len()})
        };
        let agents: Vec<Value> = AGENTS
            .iter()
            .map(|(key, name)| {
                let grant = local
                    .get(*key)
                    .and_then(|a| status.grants.iter().find(|g| g.grant_id == a.grant_id));
                json!({"key":key,"name":name,"registered":grant.is_some(),"grant":grant.map(view)})
            })
            .collect();
        let named: Vec<&PolicyId> = local.values().map(|a| &a.grant_id).collect();
        let other: Vec<Value> = status
            .grants
            .iter()
            .filter(|g| !named.contains(&&g.grant_id))
            .map(view)
            .collect();
        Ok(
            json!({"agents":agents,"other_grants":other,"now":status.now,
            "library_policies":status.policy_refs.len()}),
        )
    }
    /// Build one grant revision for `action` and ask Core to plan it. Nothing
    /// is written; Morii sees the summary and confirms or discards it.
    pub fn plan(
        &self,
        vault: &SegmentedAutomationVault,
        excluded_sources: &[SourceId],
        key: &str,
        action: &str,
        now_ms: i64,
    ) -> Result<Value, &'static str> {
        let owner = vault.descriptor().created_by.clone();
        let subject = vault
            .descriptor()
            .owner_subject_id
            .clone()
            .ok_or("grant_refused")?;
        if !AGENTS.iter().any(|(k, _)| *k == key) {
            return Err("catalog_invalid_request");
        }
        let status = vault.owner_read_status(&owner).map_err(code)?;
        let local = self.local(vault);
        let current = local.get(key).and_then(|a| {
            status
                .grants
                .iter()
                .find(|g| g.grant_id == a.grant_id)
                .cloned()
        });
        let scope = || {
            let mut sources: Vec<SourceId> = status
                .policies
                .iter()
                .flat_map(|p| p.source_ids.iter().cloned())
                .filter(|s| !excluded_sources.contains(s))
                .collect();
            sources.sort();
            sources.dedup();
            (status.policy_refs.clone(), sources)
        };
        let at = |offset: i64| Timestamp::from_unix_ms(now_ms + offset).ok_or("grant_refused");
        let (grant, identity) = match (action, current) {
            ("register", None) => {
                let identity = LocalAgent {
                    principal: PrincipalId::from_random(OsIdSource.random_16()),
                    grant_id: PolicyId::from_random(OsIdSource.random_16()),
                };
                let (policies, source_ids) = scope();
                (
                    OwnerReadGrant {
                        grant_id: identity.grant_id.clone(),
                        revision: Revision::new(1).ok_or("grant_refused")?,
                        vault_id: vault.descriptor().vault_id.clone(),
                        principal: ActorRef {
                            actor_type: ActorType::Agent,
                            actor_id: identity.principal.clone(),
                        },
                        subject_id: subject,
                        project_id: None,
                        policies,
                        source_ids,
                        max_sensitivity: Sensitivity::Private,
                        source_read: true,
                        active: true,
                        valid_from: at(0)?,
                        valid_until: at(GRANT_DAYS * DAY_MS)?,
                        allow_requests: true,
                    },
                    Some(identity),
                )
            }
            (action @ ("renew" | "refresh" | "revoke"), Some(mut grant)) => {
                grant.revision = Revision::new(grant.revision.get() + 1).ok_or("grant_refused")?;
                match action {
                    "renew" => {
                        grant.active = true;
                        grant.valid_until = at(GRANT_DAYS * DAY_MS)?;
                    }
                    "refresh" => (grant.policies, grant.source_ids) = scope(),
                    _ => grant.active = false,
                }
                (grant, None)
            }
            _ => return Err("catalog_invalid_request"),
        };
        let plan = vault.plan_owner_read_grant(&owner, grant).map_err(code)?;
        let summary = json!({"plan_id":null,"agent":key,"action":action,"grant_id":plan.grant.grant_id,
            "revision":plan.grant.revision,"active":plan.grant.active,"max_sensitivity":plan.grant.max_sensitivity,
            "allow_requests":plan.grant.allow_requests,"valid_until":plan.grant.valid_until,"expires_at":plan.expires_at,
            "policies":plan.grant.policies.len(),"sources":plan.grant.source_ids.len()});
        let plan_id = RequestId::from_random(OsIdSource.random_16()).to_string();
        let mut summary = summary;
        summary["plan_id"] = json!(plan_id);
        self.pending
            .lock()
            .map_err(|_| "catalog_busy")?
            .insert(plan_id, (key.to_owned(), plan, identity));
        Ok(summary)
    }
    fn ignored_all(&self) -> IgnoredRequests {
        self.file
            .as_ref()
            .and_then(|f| std::fs::read(f.with_file_name(IGNORED_FILE)).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }
    /// ADR-042: mark one saved request as ignored (or not) on this computer.
    /// Nothing is written into the library; the request stays there.
    pub fn set_ignored(
        &self,
        vault: &SegmentedAutomationVault,
        key: &str,
        ignored: bool,
    ) -> Result<(), &'static str> {
        let file = self
            .file
            .as_ref()
            .ok_or("agents_file_unavailable")?
            .with_file_name(IGNORED_FILE);
        let mut all = self.ignored_all();
        let keys = all.entry(vault.descriptor().vault_id.to_string()).or_default();
        if ignored {
            keys.insert(key.to_owned());
        } else {
            keys.remove(key);
        }
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|_| "agents_file_unavailable")?;
        }
        let bytes = serde_json::to_vec_pretty(&all).map_err(|_| "agents_file_unavailable")?;
        std::fs::write(file, bytes).map_err(|_| "agents_file_unavailable")
    }
    /// ADR-042: Core's saved requests with the local Agent name (when this
    /// computer registered the principal) and the local ignore mark.
    pub fn requests(
        &self,
        vault: &SegmentedAutomationVault,
        requests: Vec<AgentRequestView>,
    ) -> Result<Value, &'static str> {
        let local = self.local(vault);
        let ignored = self
            .ignored_all()
            .remove(&vault.descriptor().vault_id.to_string())
            .unwrap_or_default();
        let mut items = Vec::new();
        for r in requests {
            let agent = local
                .iter()
                .find(|(_, a)| a.principal == r.principal.actor_id)
                .and_then(|(key, _)| AGENTS.iter().find(|(k, _)| k == key))
                .map(|(_, name)| *name);
            let skip = ignored.contains(&r.key.to_string());
            let mut value = serde_json::to_value(&r).map_err(|_| "catalog_read_refused")?;
            value["agent"] = json!(agent);
            value["ignored"] = json!(skip);
            items.push(value);
        }
        Ok(json!({"items":items}))
    }
    /// The main window's confirm click on a shown plan. One use.
    pub fn commit(
        &self,
        vault: &SegmentedAutomationVault,
        plan_id: &str,
    ) -> Result<Value, &'static str> {
        let (key, plan, identity) = self
            .pending
            .lock()
            .map_err(|_| "catalog_busy")?
            .remove(plan_id)
            .ok_or("grant_stale")?;
        let owner = vault.descriptor().created_by.clone();
        vault.commit_owner_read_grant(&owner, &plan).map_err(code)?;
        if let Some(identity) = identity {
            let mut all = self.load();
            all.entry(vault.descriptor().vault_id.to_string())
                .or_default()
                .insert(key, identity);
            self.save(&all)?;
        }
        self.status(vault)
    }
}
