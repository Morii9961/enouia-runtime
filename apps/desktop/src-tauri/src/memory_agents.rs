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
/// Local file beside it: vault id → whether Morii turned on saving Capsules
/// (Memory ADR-MEM-173). Off unless he turns it on.
const CAPSULE_FILE: &str = "capsule-saving.json";
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
                "policies":g.policies.len(),"sources":g.source_ids.len(),"follow_new_sources":g.follow_new_sources})
        };
        let agents: Vec<Value> = AGENTS
            .iter()
            .map(|(key, name)| {
                let grant = local
                    .get(*key)
                    .and_then(|a| status.grants.iter().find(|g| g.grant_id == a.grant_id));
                // ADR-MEM-168: what this grant misses since it was written.
                let coverage = local.get(*key).and_then(|a| vault.owner_read_grant_coverage(&owner, &a.grant_id).ok()).map(|c| {
                    json!({"policies":c.uncovered_policies.len(),"sources":c.uncovered_sources.len(),"refreshable":c.refreshed.is_some()})
                });
                let pipe = local
                    .get(*key)
                    .map(|a| crate::memory_pipes::pipe_id(&vault.descriptor().vault_id, &a.principal));
                json!({"key":key,"name":name,"registered":grant.is_some(),"grant":grant.map(view),"pipe":pipe,"coverage":coverage})
            })
            .collect();
        // Memory ADR-MEM-175: the ChatGPT connector's grant carries a purpose tag.
        let connector = status
            .grants
            .iter()
            .find(|g| g.purpose.as_deref() == Some("chatgpt_connector"))
            .map(|g| {
                let mut v = view(g);
                v["coverage"] = vault.owner_read_grant_coverage(&owner, &g.grant_id).ok().map(|c| {
                    json!({"policies":c.uncovered_policies.len(),"sources":c.uncovered_sources.len(),"refreshable":c.refreshed.is_some()})
                }).unwrap_or(Value::Null);
                v
            });
        let named: Vec<&PolicyId> = local.values().map(|a| &a.grant_id).collect();
        let other: Vec<Value> = status
            .grants
            .iter()
            .filter(|g| {
                !named.contains(&&g.grant_id) && g.purpose.as_deref() != Some("chatgpt_connector")
            })
            .map(view)
            .collect();
        Ok(
            json!({"agents":agents,"other_grants":other,"connector":connector,"now":status.now,
            "library_policies":status.policy_refs.len(),"vault_id":vault.descriptor().vault_id}),
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
                        // Memory ADR-MEM-170 (Morii's choice): later windows and
                        // captured sources of the same subject join automatically.
                        follow_new_sources: true,
                        purpose: None,
                    },
                    Some(identity),
                )
            }
            // ADR-MEM-168: Memory builds the widened revision and checks it.
            ("refresh", Some(grant)) => (
                vault
                    .owner_read_grant_coverage(&owner, &grant.grant_id)
                    .map_err(code)?
                    .refreshed
                    .ok_or("grant_up_to_date")?,
                None,
            ),
            (action @ ("renew" | "revoke" | "follow"), Some(mut grant)) => {
                grant.revision = Revision::new(grant.revision.get() + 1).ok_or("grant_refused")?;
                match action {
                    "renew" => {
                        grant.active = true;
                        grant.valid_until = at(GRANT_DAYS * DAY_MS)?;
                    }
                    "follow" => grant.follow_new_sources = true,
                    _ => grant.active = false,
                }
                (grant, None)
            }
            _ => return Err("catalog_invalid_request"),
        };
        let plan = vault.plan_owner_read_grant(&owner, grant).map_err(code)?;
        let summary = json!({"plan_id":null,"agent":key,"action":action,"grant_id":plan.grant.grant_id,
            "revision":plan.grant.revision,"active":plan.grant.active,"max_sensitivity":plan.grant.max_sensitivity,
            "allow_requests":plan.grant.allow_requests,"follow_new_sources":plan.grant.follow_new_sources,"valid_until":plan.grant.valid_until,"expires_at":plan.expires_at,
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
    fn capsule_all(&self) -> BTreeMap<String, bool> {
        self.file
            .as_ref()
            .and_then(|f| std::fs::read(f.with_file_name(CAPSULE_FILE)).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }
    pub fn capsule_saving(&self, vault: &SegmentedAutomationVault) -> bool {
        self.capsule_all()
            .get(&vault.descriptor().vault_id.to_string())
            .copied()
            .unwrap_or(false)
    }
    pub fn set_capsule_saving(
        &self,
        vault: &SegmentedAutomationVault,
        enabled: bool,
    ) -> Result<(), &'static str> {
        let file = self
            .file
            .as_ref()
            .ok_or("agents_file_unavailable")?
            .with_file_name(CAPSULE_FILE);
        let mut all = self.capsule_all();
        all.insert(vault.descriptor().vault_id.to_string(), enabled);
        let bytes = serde_json::to_vec_pretty(&all).map_err(|_| "agents_file_unavailable")?;
        std::fs::write(file, bytes).map_err(|_| "agents_file_unavailable")
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
        let keys = all
            .entry(vault.descriptor().vault_id.to_string())
            .or_default();
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
        // Memory ADR-MEM-184: ChatGPT asks under the connector's grant, whose
        // principal no Agent on this computer registered.
        let owner = vault.descriptor().created_by.clone();
        let connector: Vec<PrincipalId> = vault
            .owner_read_status(&owner)
            .map_err(code)?
            .grants
            .into_iter()
            .filter(|g| g.purpose.as_deref() == Some("chatgpt_connector"))
            .map(|g| g.principal.actor_id)
            .collect();
        let mut items = Vec::new();
        for r in requests {
            let agent = local
                .iter()
                .find(|(_, a)| a.principal == r.principal.actor_id)
                .and_then(|(key, _)| AGENTS.iter().find(|(k, _)| k == key))
                .map(|(_, name)| *name)
                .or_else(|| {
                    connector
                        .contains(&r.principal.actor_id)
                        .then_some("ChatGPT")
                });
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
