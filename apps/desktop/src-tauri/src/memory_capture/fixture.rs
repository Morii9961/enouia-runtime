//! Fresh synthetic Owner root with fixed conversations and a lookup analyzer.
//! No remembered root, Provider, model, embedding or semantic understanding.
use enouia_memory_contract::{
    common::*, foundation::Clock, ids::*, next::*, ports::IdSource, time::Timestamp,
};
use enouia_memory_host::automation::{
    captured_worker::CapturedWorker, catalog::SegmentedMemoryReader,
    runtime_capture::RuntimeCaptureHost,
};
use enouia_memory_vault::{
    OsIdSource, RootPolicy, SystemClock,
    automation::segmented::{
        CaptureAnalysis, CaptureAnalyzer, CaptureStatement, CaptureStopToken,
        PendingCaptureAnalysis, QueuedCapture, RuntimeCaptureScope, SegmentedAutomationVault,
    },
    fault::Faults,
    verify_data_root,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

/// Fixed synthetic exchanges: (user turn, assistant turn, language, title, kind).
/// Memory keeps a title only when it quotes the turn, so titles are excerpts.
pub(super) const EXCHANGES: [(&str, &str, &str, &str, FormationKind); 3] = [
    (
        "Synthetic example: I prefer reading design notes in the morning.",
        "Synthetic reply: noted.",
        "en",
        "reading design notes",
        FormationKind::Preference,
    ),
    (
        "合成示例：我上周做了一个蓝色陶杯。",
        "合成回复：好的。",
        "zh-Hans",
        "蓝色陶杯",
        FormationKind::Episode,
    ),
    (
        "Synthetic example: I still need to choose a pottery glaze.",
        "Synthetic reply: understood.",
        "en",
        "pottery glaze",
        FormationKind::OpenLoop,
    ),
];

pub(super) struct Fixture {
    pub host: Arc<RuntimeCaptureHost>,
    pub worker: Option<CapturedWorker>,
    pub reader: SegmentedMemoryReader,
    pub profile: AttentionProfile,
    pub requests: Vec<RuntimeCaptureRequest>,
    /// The current enrollment ends here; renewal is an explicit native setup.
    pub expires_at_ms: i64,
    pub clock: Arc<dyn Clock + Send + Sync>,
    producer: Producer,
    pub _root: PathBuf,
}
/// What a native re-enrollment needs; never supplied by the page.
struct Producer {
    vault: Arc<SegmentedAutomationVault>,
    owner: ActorRef,
    principal: ActorRef,
    policy_id: PolicyId,
    source_ids: Vec<SourceId>,
    policy_until_ms: i64,
}
impl Producer {
    /// Memory bounds one producer enrollment to five minutes and the policy.
    fn enroll(
        &self,
        clock: &(dyn Clock + Send + Sync),
    ) -> Result<(Arc<RuntimeCaptureHost>, CapturedWorker, i64), &'static str> {
        let until = (clock.now_unix_ms() + 300_000).min(self.policy_until_ms);
        let host = Arc::new(
            RuntimeCaptureHost::enroll_owner(
                self.vault.clone(),
                &self.owner,
                std::process::id(),
                self.principal.clone(),
                RuntimeCaptureScope {
                    policy_id: self.policy_id.clone(),
                    source_ids: self.source_ids.clone(),
                    max_sensitivity: Sensitivity::Private,
                    platform: "enouia-runtime".into(),
                    account_scope: "runtime-synthetic".into(),
                    default_timezone: "Asia/Shanghai".into(),
                    valid_until: Timestamp::from_unix_ms(until).ok_or("capture_fixture_invalid")?,
                },
            )
            .map_err(|error| {
                #[cfg(test)]
                eprintln!("synthetic capture enrollment: {error:?}");
                let _ = error;
                "capture_fixture_enroll"
            })?,
        );
        let worker = host
            .start_worker(LookupAnalyzer, Duration::from_secs(30))
            .map_err(|_| "capture_fixture_worker")?;
        Ok((host, worker, until))
    }
}
impl Fixture {
    /// Explicit owner-initiated renewal: revoke and join the old enrollment,
    /// then enroll the same producer again so earlier request keys replay.
    pub fn renew(&mut self) -> Result<(), &'static str> {
        self.host.revoke();
        if let Some(worker) = self.worker.take() {
            let _ = worker.shutdown();
        }
        let (host, worker, until) = self.producer.enroll(self.clock.as_ref())?;
        self.host = host;
        self.worker = Some(worker);
        self.expires_at_ms = until;
        Ok(())
    }
}

/// Knows only the fixed user turns above; every other source forms nothing.
struct LookupAnalyzer;
impl CaptureAnalyzer for LookupAnalyzer {
    fn start(
        &mut self,
        _: &QueuedCapture,
        source: &CapturedSource,
        _: &[AgentNoteRecord],
        _: &CaptureStopToken,
    ) -> Result<Box<dyn PendingCaptureAnalysis>, CaptureAnalysis> {
        let Some((text, _, _, title, kind)) = EXCHANGES
            .iter()
            .find(|e| source.record.speaker_role == SpeakerRole::User && e.0 == source.text)
        else {
            return Err(CaptureAnalysis::NoMemory);
        };
        let unknown = RecordTime {
            from: None,
            until: None,
            precision: RecordPrecision::Unknown,
            bound: TimeBound::Within,
            tz: None,
            basis: TimeBasis::Unknown,
        };
        Err(CaptureAnalysis::Statements(vec![CaptureStatement {
            quote: (*text).into(),
            title: (*title).into(),
            interpretation: Interpretation::ClearSelfReport,
            dimensions: FormationDimensions {
                kind: *kind,
                occurrence: if *kind == FormationKind::Episode {
                    OccurrenceAssertion::ReportedOccurred
                } else {
                    OccurrenceAssertion::Unknown
                },
                state: (*kind == FormationKind::OpenLoop).then_some(FormationState::Open),
                change: FormationChange::Initial,
                conditions: vec![],
                event_time: None,
                valid_time: None,
                counter_sources: vec![],
                derived_from: vec![],
                reverts_to: None,
            },
            event_time: unknown.clone(),
            valid_time: unknown,
            note: None,
            prompt_version: "runtime-capture-synthetic-1".into(),
            model_version: None,
        }]))
    }
}

fn load<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, &'static str> {
    serde_json::from_str(text).map_err(|_| "capture_fixture_invalid")
}
pub(super) fn create(stop: &AtomicBool) -> Result<Fixture, &'static str> {
    create_with_clock(stop, Arc::new(SystemClock))
}
pub(super) fn create_with_clock(
    stop: &AtomicBool,
    clock: Arc<dyn Clock + Send + Sync>,
) -> Result<Fixture, &'static str> {
    let ids = Arc::new(OsIdSource);
    let now_ms = clock.now_unix_ms();
    let now = Timestamp::from_unix_ms(now_ms).ok_or("capture_fixture_invalid")?;
    let until = Timestamp::from_unix_ms(now_ms + 3_600_000).ok_or("capture_fixture_invalid")?;
    let mut policy: AutomationPolicy =
        load(include_str!("../../tests/fixtures/core8/policy.json"))?;
    let mut descriptor: AutomationDescriptor =
        load(include_str!("../../tests/fixtures/core8/descriptor.json"))?;
    descriptor.vault_id = VaultId::from_random(ids.random_16());
    descriptor.host_id = DeviceId::from_random(ids.random_16());
    descriptor.created_by.actor_id = PrincipalId::from_random(ids.random_16());
    descriptor.system_actor.actor_id = PrincipalId::from_random(ids.random_16());
    policy.subject_id = SubjectId::from_random(ids.random_16());
    descriptor.layout = AutomationLayout::SegmentedOwnerV1;
    descriptor.owner_subject_id = Some(policy.subject_id.clone());
    policy.vault_id = descriptor.vault_id.clone();
    policy.system_actor = descriptor.system_actor.clone();
    policy.policy_id = PolicyId::from_random(ids.random_16());
    policy.access_policy_id = PolicyId::from_random(ids.random_16());
    policy.egress_policy_id = PolicyId::from_random(ids.random_16());
    policy.target_ids.clear();
    policy.source_ids = (0..2 * EXCHANGES.len())
        .map(|_| SourceId::from_random(ids.random_16()))
        .collect();
    policy.valid_from = now;
    policy.valid_until = until;
    if stop.load(Ordering::SeqCst) {
        return Err("capture_locked");
    }
    let root = std::env::temp_dir().join(format!(
        "enouia-runtime-capture-synthetic-{}",
        descriptor.vault_id
    ));
    std::fs::create_dir(&root).map_err(|_| "capture_fixture_storage")?;
    let verified =
        verify_data_root(&root, &RootPolicy::default()).map_err(|_| "capture_fixture_storage")?;
    let vault = Arc::new(
        SegmentedAutomationVault::create(
            &verified,
            descriptor.clone(),
            clock.clone(),
            ids.clone(),
            Faults::none(),
        )
        .map_err(|_| "capture_fixture_storage")?,
    );
    vault
        .set_policy(&descriptor.created_by, policy.clone())
        .map_err(|_| "capture_fixture_policy")?;
    if stop.load(Ordering::SeqCst) {
        return Err("capture_locked");
    }
    // The producer is this Runtime process; native setup, never a packet,
    // supplies its PID, principal and scope.
    let producer = Producer {
        vault: vault.clone(),
        owner: descriptor.created_by.clone(),
        principal: ActorRef {
            actor_type: ActorType::Client,
            actor_id: PrincipalId::from_random(ids.random_16()),
        },
        policy_id: policy.policy_id.clone(),
        source_ids: policy.source_ids.clone(),
        policy_until_ms: now_ms + 3_600_000,
    };
    let (host, worker, expires_at_ms) = producer.enroll(clock.as_ref())?;
    let requests = EXCHANGES
        .iter()
        .enumerate()
        .map(|(index, (user, assistant, language, _, _))| {
            let turn = |n: u32, speaker, text: &str, parent: Option<String>| RuntimeCaptureTurn {
                message_id: format!("m{n}"),
                parent_message_id: parent,
                branch_id: "main".into(),
                sequence: n,
                speaker,
                text: text.into(),
                original_time: None,
                original_timezone: None,
                occurred_at: None,
                content_lang: (*language).into(),
                assistant_model: None,
                attachments: vec![],
            };
            RuntimeCaptureRequest {
                schema_version: NextVersion,
                kind: RuntimeCaptureKind::Capture,
                capability: RuntimeCaptureCapability::OwnerV1,
                request_id: RequestId::from_random(OsIdSource.random_16()),
                conversation_id: format!("runtime-synthetic-{index}"),
                title: None,
                turns: vec![
                    turn(1, SpeakerRole::User, user, None),
                    turn(2, SpeakerRole::Assistant, assistant, Some("m1".into())),
                ],
            }
        })
        .collect();
    let reader =
        SegmentedMemoryReader::from_authenticated_system(vault, descriptor.system_actor.clone())
            .map_err(|_| "capture_fixture_invalid")?;
    Ok(Fixture {
        host,
        worker: Some(worker),
        reader,
        profile: load(include_str!("../../tests/fixtures/core8/profile.json"))?,
        requests,
        expires_at_ms,
        clock,
        producer,
        _root: root,
    })
    // Retain only this fresh bounded example for diagnosis. Never reopen it.
}
