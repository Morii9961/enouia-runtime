//! Explicit fresh synthetic bootstrap. No remembered roots or real model port.
use enouia_memory_contract::{
    common::*, foundation::Clock, hash::sha256, ids::*, json::Revision, next::*, ports::IdSource,
    time::Timestamp,
};
use enouia_memory_host::automation::{
    Generated, Generation, Generator, JobState, Limits, PendingGeneration, StopToken,
    SyntheticJobs, application::AutomationHost, attention::MaintenanceWorker,
};
use enouia_memory_vault::{
    OsIdSource, RootPolicy, SystemClock, automation::AutomationVault, fault::Faults,
    verify_data_root,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

pub(super) struct Fixture {
    pub host: Arc<AutomationHost>,
    pub profile: AttentionProfile,
    pub system: ActorRef,
    pub maintenance: Option<MaintenanceWorker>,
    jobs: SyntheticJobs,
    generator: Option<JoinHandle<()>>,
    // A unique, newly created synthetic root, never a user-selected library.
    pub _root: PathBuf,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.host.lock();
        if let Some(worker) = self.maintenance.take() {
            let _ = worker.join();
        }
        let _ = self.jobs.shutdown();
        if let Some(worker) = self.generator.take() {
            let _ = worker.join();
        }
        // Keep the bounded synthetic example for diagnosis. Nothing reopens it
        // automatically; no delete, migration or recovery is inferred here.
    }
}
fn load<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, &'static str> {
    serde_json::from_str(text).map_err(|_| "automation_fixture_invalid")
}
pub(super) fn create(stop: &AtomicBool) -> Result<Fixture, &'static str> {
    if stop.load(Ordering::SeqCst) {
        return Err("runtime_closing");
    }
    let ids = Arc::new(OsIdSource);
    let clock = Arc::new(SystemClock);
    let now_ms = clock.now_unix_ms();
    let now = Timestamp::from_unix_ms(now_ms).ok_or("automation_fixture_invalid")?;
    let mut d: AutomationDescriptor =
        load(include_str!("../../tests/fixtures/core8/descriptor.json"))?;
    d.layout = AutomationLayout::HostV2;
    d.vault_id = VaultId::from_random(ids.random_16());
    d.host_id = DeviceId::from_random(ids.random_16());
    d.created_by.actor_id = PrincipalId::from_random(ids.random_16());
    d.system_actor.actor_id = PrincipalId::from_random(ids.random_16());
    let mut policy: AutomationPolicy =
        load(include_str!("../../tests/fixtures/core8/policy.json"))?;
    policy.vault_id = d.vault_id.clone();
    policy.system_actor = d.system_actor.clone();
    policy.subject_id = SubjectId::from_random(ids.random_16());
    policy.policy_id = PolicyId::from_random(ids.random_16());
    policy.access_policy_id = PolicyId::from_random(ids.random_16());
    policy.egress_policy_id = PolicyId::from_random(ids.random_16());
    policy.target_ids.clear();
    policy.source_ids = (0..3)
        .map(|_| SourceId::from_random(ids.random_16()))
        .collect();
    policy.valid_from = now.clone();
    policy.valid_until =
        Timestamp::from_unix_ms(now_ms + 3_600_000).ok_or("automation_fixture_invalid")?;
    let root = std::env::temp_dir().join(format!("enouia-runtime-core8-synthetic-{}", d.vault_id));
    std::fs::create_dir(&root).map_err(|_| "automation_fixture_storage")?;
    let data_path = root.join("data");
    let jobs_path = root.join("jobs");
    for path in [&data_path, &jobs_path] {
        std::fs::create_dir(path).map_err(|_| "automation_fixture_storage")?;
    }
    let data = verify_data_root(&data_path, &RootPolicy::default())
        .map_err(|_| "automation_fixture_storage")?;
    let jobs_root = verify_data_root(&jobs_path, &RootPolicy::default())
        .map_err(|_| "automation_fixture_storage")?;
    let mut limits: Limits = load(include_str!("../../tests/fixtures/core8/limits.json"))?;
    limits.max_jobs = 8;
    limits.total_tokens = 1000;
    limits.total_cost_microusd = 1000;
    let jobs = SyntheticJobs::open(&jobs_root, limits, clock.clone(), Faults::none())
        .map_err(|_| "automation_fixture_storage")?;
    let vault =
        AutomationVault::create(&data, d.clone(), policy.clone(), clock, ids, Faults::none())
            .map_err(|_| "automation_fixture_storage")?;
    let host = Arc::new(
        AutomationHost::from_authenticated_system(vault, d.system_actor.clone(), jobs.clone())
            .map_err(|_| "automation_fixture_invalid")?,
    );
    let profile: AttentionProfile = load(include_str!("../../tests/fixtures/core8/profile.json"))?;
    let generator = jobs
        .spawn(SyntheticModel)
        .map_err(|_| "automation_fixture_invalid")?;
    let mut fixture = Fixture {
        host,
        profile,
        system: d.system_actor,
        jobs,
        generator: Some(generator),
        maintenance: None,
        _root: root,
    };
    for (index, (text, kind, state)) in [
        (
            "Synthetic example: I made a blue pottery cup.",
            FormationKind::Episode,
            None,
        ),
        (
            "Synthetic example: I prefer detailed debugging explanations.",
            FormationKind::Preference,
            None,
        ),
        (
            "Synthetic example: I still need to choose a class.",
            FormationKind::OpenLoop,
            Some(FormationState::Open),
        ),
    ]
    .into_iter()
    .enumerate()
    {
        if stop.load(Ordering::SeqCst) {
            return Err("runtime_closing");
        }
        let mut source: CapturedSource =
            load(include_str!("../../tests/fixtures/core8/source.json"))?;
        source.record.source_id = policy.source_ids[index].clone();
        source.record.locator = Locator::RuntimeEvent {
            event_id: EventId::from_random(OsIdSource.random_16()),
        };
        source.record.revision = Revision::new(1).unwrap();
        source.record.access_policy_id = policy.access_policy_id.clone();
        source.record.captured_at = now.clone();
        source.record.created_at = now.clone();
        source.record.occurred_at = Some(now.clone());
        source.record.evidence_class = EvidenceClass::UserStatement;
        source.record.speaker_role = SpeakerRole::User;
        source.record.sensitivity = Sensitivity::Private;
        source.text = text.into();
        source.record.content_hash = sha256(source.text.as_bytes());
        source.attributed_subject = Some(policy.subject_id.clone());
        let reference = source.reference();
        fixture.host.capture_native(source).map_err(|error| {
            #[cfg(test)]
            eprintln!("synthetic capture: {error:?}");
            let _ = error;
            "automation_fixture_capture"
        })?;
        let mut input: AdmissionInput =
            load(include_str!("../../tests/fixtures/core8/input.json"))?;
        input.input_refs = vec![reference];
        input.target = None;
        input.dimensions = Some(FormationDimensions {
            kind,
            state,
            change: FormationChange::Initial,
            occurrence: if kind == FormationKind::Episode {
                OccurrenceAssertion::ReportedOccurred
            } else {
                OccurrenceAssertion::Unknown
            },
            conditions: vec![],
            event_time: None,
            valid_time: None,
            counter_sources: vec![],
            derived_from: vec![],
            reverts_to: None,
        });
        let key = fixture.host.prepare_submit(vec![input]).map_err(|error| {
            #[cfg(test)]
            eprintln!("synthetic prepare: {error:?}");
            let _ = error;
            "automation_fixture_prepare"
        })?;
        let until = Instant::now() + Duration::from_secs(15);
        loop {
            if stop.load(Ordering::SeqCst) {
                return Err("runtime_closing");
            }
            if fixture
                .jobs
                .status(&key)
                .is_ok_and(|s| s.state == JobState::Generated)
            {
                break;
            }
            if Instant::now() >= until {
                return Err("automation_fixture_timeout");
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        fixture.host.apply_job(&key).map_err(|error| {
            #[cfg(test)]
            eprintln!("synthetic apply: {error:?}");
            let _ = error;
            "automation_fixture_apply"
        })?;
    }
    fixture.maintenance = Some(
        fixture
            .host
            .start_maintenance(fixture.profile.clone())
            .map_err(|_| "automation_fixture_invalid")?,
    );
    Ok(fixture)
}
struct SyntheticModel;
struct Pending(AdmissionInput);
impl Generator for SyntheticModel {
    fn start(
        &mut self,
        input: &AdmissionInput,
        _: &Limits,
        _: &StopToken,
    ) -> Result<Box<dyn PendingGeneration>, Generation> {
        Ok(Box::new(Pending(input.clone())))
    }
}
impl PendingGeneration for Pending {
    fn poll(&mut self, _: &StopToken) -> Option<Generation> {
        let mut input = self.0.clone();
        let sources: Vec<CapturedSource> = serde_json::from_str(&input.content).ok()?;
        input.content = sources.first()?.text.clone();
        input.interpretation = Interpretation::ClearSelfReport;
        let decision = DecisionDraft {
            schema_version: NextVersion,
            kind: DecisionKind::AdmissionDraft,
            rule_version: RuleVersion::V3,
            input,
            outcome: Outcome {
                knowledge: KnowledgeState::AttributedStatement,
                adoption: AdoptionState::Adopted,
                reassessment: None,
            },
        };
        Some(Generation::Complete(Box::new(Generated {
            input_hash: digest(&self.0),
            response_json: serde_json::to_string(&decision).ok()?,
            tokens_used: 5,
            cost_microusd: 1,
        })))
    }
}
