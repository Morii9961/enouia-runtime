//! ADR-043 (D1b): serve Morii's registered local Agents (ADR-041) over Memory's
//! combined Agent protocol (ADR-MEM-166). One named pipe per Agent; the
//! `enouia-memory-mcp` bridge that Claude Code or Codex starts connects to it.
//! Memory owns enrollment, the grant checks, renewal and every tool; Runtime
//! only listens, enrolls the connecting process and stops on lock or exit.
use enouia_memory_contract::{
    common::ActorRef, hash::Sha256Hex, ids::*, next::AttentionProfile, policy::Scope,
};
use enouia_memory_host::{
    automation::qualified_agent::QualifiedAgentHost,
    mcp::{
        agent::{AgentWriters, native::serve_connection},
        native::Enrollment,
    },
    windows::Pipe,
};
use enouia_memory_vault::automation::segmented::{SegmentedAgentScope, SegmentedAutomationVault};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Duration,
};

pub const PROTOCOL: &str = "automation-agent-v1";
/// A frame's remaining bytes and a reply; idle waiting has no limit (ADR-MEM-166).
const FRAME_TIMEOUT: Duration = Duration::from_secs(30);
const SLICE: Duration = Duration::from_millis(250);
const PERMIT_MS: i64 = 300_000;

/// The fixed pipe name an Agent's MCP configuration names; stable across restarts.
pub fn pipe_id(vault: &VaultId, principal: &PrincipalId) -> Sha256Hex {
    enouia_memory_contract::hash::sha256(
        format!("enouia-runtime-agent-pipe-1|{vault}|{principal}|{PROTOCOL}").as_bytes(),
    )
}

/// Listening threads for the current Agents. Dropping stops them (≤ one slice).
pub struct Pipes {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}
impl Drop for Pipes {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
    }
}

/// Start one listener per (principal, grant). Grants are checked by Memory on
/// every connection; an inactive or expired grant simply refuses to serve.
pub fn start(
    vault: &Arc<SegmentedAutomationVault>,
    profile: &AttentionProfile,
    agents: Vec<(PrincipalId, PolicyId)>,
) -> Pipes {
    let stop = Arc::new(AtomicBool::new(false));
    let threads = agents
        .into_iter()
        .map(|(principal, grant_id)| {
            let (vault, profile, stop) = (vault.clone(), profile.clone(), stop.clone());
            std::thread::spawn(move || listen(&vault, &profile, principal, &grant_id, &stop))
        })
        .collect();
    Pipes { stop, threads }
}

fn listen(
    vault: &Arc<SegmentedAutomationVault>,
    profile: &AttentionProfile,
    principal: PrincipalId,
    grant_id: &PolicyId,
    stop: &AtomicBool,
) {
    let id = pipe_id(&vault.descriptor().vault_id, &principal);
    let principal = ActorRef {
        actor_type: enouia_memory_contract::common::ActorType::Agent,
        actor_id: principal,
    };
    while !stop.load(Ordering::SeqCst) {
        let Ok(mut pipe) = Pipe::listen(&id) else {
            std::thread::sleep(SLICE * 4);
            continue;
        };
        let connected = loop {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            match pipe.accept(SLICE) {
                Ok(()) => break true,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break false,
            }
        };
        if connected {
            // Any refusal ends this connection only; the bridge reports it.
            let _ = serve(vault, profile, &principal, grant_id, &mut pipe, stop);
        }
        // Dropping the instance lets the next client connect to a fresh one.
    }
}

fn serve(
    vault: &Arc<SegmentedAutomationVault>,
    profile: &AttentionProfile,
    principal: &ActorRef,
    grant_id: &PolicyId,
    pipe: &mut Pipe,
    stop: &AtomicBool,
) -> Result<(), ()> {
    let owner = vault.descriptor().created_by.clone();
    let pid = pipe.client_pid().map_err(drop)?;
    let enrollment = Enrollment::enroll(
        pid,
        principal.clone(),
        vec![Scope::MemoryRead, Scope::SourceRead],
    )
    .map_err(drop)?;
    let grant = vault
        .owner_read_status(&owner)
        .map_err(drop)?
        .grants
        .into_iter()
        .find(|g| &g.grant_id == grant_id && g.active)
        .ok_or(())?;
    let now =
        enouia_memory_contract::foundation::Clock::now_unix_ms(&enouia_memory_vault::SystemClock);
    let scope = SegmentedAgentScope {
        subject_id: grant.subject_id.clone(),
        project_id: grant.project_id.clone(),
        policy_ids: grant.policies.iter().map(|r| r.policy_id.clone()).collect(),
        source_ids: grant.source_ids.clone(),
        max_sensitivity: grant.max_sensitivity,
        source_read: true,
        valid_until: enouia_memory_contract::time::Timestamp::from_unix_ms(
            (now + PERMIT_MS).min(grant.valid_until.unix_ms()),
        )
        .ok_or(())?,
    };
    let host =
        QualifiedAgentHost::from_authenticated_initialized_owner(vault.clone(), owner.clone())
            .map_err(drop)?;
    let reader = host
        .reader_with_owner_grant(&owner, principal.clone(), grant_id, scope.clone())
        .map_err(drop)?;
    let note = host
        .note_writer_with_owner_grant(&owner, principal.clone(), grant_id, scope.clone())
        .map_err(drop)?;
    let correction = host
        .correction_reporter_with_owner_grant(&owner, principal.clone(), grant_id, scope.clone())
        .map_err(drop)?;
    let forget = host
        .forget_requester_with_owner_grant(&owner, principal.clone(), grant_id, scope)
        .map_err(drop)?;
    serve_connection(
        &reader,
        AgentWriters {
            note: Some(&note),
            correction: Some(&correction),
            forget: Some(&forget),
        },
        profile,
        pipe,
        enrollment,
        FRAME_TIMEOUT,
        stop,
    )
    .map_err(drop)
}
