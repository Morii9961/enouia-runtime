//! Fresh segmented example; no remembered root, analyzer, Provider or worker.
use enouia_memory_contract::{
    common::*, foundation::Clock, hash::sha256, ids::*, json::Knowable, next::*, ports::IdSource,
    time::Timestamp,
};
use enouia_memory_host::automation::catalog::SegmentedMemoryReader;
use enouia_memory_vault::{
    OsIdSource, RootPolicy, SystemClock, automation::segmented::SegmentedAutomationVault,
    fault::Faults, verify_data_root,
};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub(super) struct Fixture {
    pub reader: SegmentedMemoryReader,
    pub profile: AttentionProfile,
    pub system: ActorRef,
    pub _root: PathBuf,
}
fn load<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, &'static str> {
    serde_json::from_str(text).map_err(|_| "catalog_fixture_invalid")
}
pub(super) fn create(stop: &AtomicBool) -> Result<Fixture, &'static str> {
    let ids = Arc::new(OsIdSource);
    let clock = Arc::new(SystemClock);
    let now_ms = clock.now_unix_ms();
    let now = Timestamp::from_unix_ms(now_ms).ok_or("catalog_fixture_invalid")?;
    let mut descriptor: AutomationDescriptor =
        load(include_str!("../../tests/fixtures/core8/descriptor.json"))?;
    descriptor.layout = AutomationLayout::SegmentedV1;
    descriptor.vault_id = VaultId::from_random(ids.random_16());
    descriptor.host_id = DeviceId::from_random(ids.random_16());
    descriptor.created_by.actor_id = PrincipalId::from_random(ids.random_16());
    descriptor.system_actor.actor_id = PrincipalId::from_random(ids.random_16());
    let mut policy: AutomationPolicy =
        load(include_str!("../../tests/fixtures/core8/policy.json"))?;
    policy.vault_id = descriptor.vault_id.clone();
    policy.system_actor = descriptor.system_actor.clone();
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
        Timestamp::from_unix_ms(now_ms + 3_600_000).ok_or("catalog_fixture_invalid")?;
    if stop.load(Ordering::SeqCst) {
        return Err("catalog_locked");
    }
    let root = std::env::temp_dir().join(format!(
        "enouia-runtime-catalog-synthetic-{}",
        descriptor.vault_id
    ));
    std::fs::create_dir(&root).map_err(|_| "catalog_fixture_storage")?;
    let verified =
        verify_data_root(&root, &RootPolicy::default()).map_err(|_| "catalog_fixture_storage")?;
    let vault = Arc::new(
        SegmentedAutomationVault::create(&verified, descriptor.clone(), clock, ids, Faults::none())
            .map_err(|_| "catalog_fixture_storage")?,
    );
    vault
        .set_policy(&descriptor.created_by, policy.clone())
        .map_err(|_| "catalog_fixture_policy")?;
    for (index, (title, text, language, kind)) in [
        (
            "Blue pottery cup",
            "Synthetic example: I made a blue pottery cup.",
            "en",
            FormationKind::Episode,
        ),
        (
            "调试偏好",
            "合成示例：我喜欢详细的调试说明。",
            "zh-Hans",
            FormationKind::Preference,
        ),
        (
            "Class choice",
            "Synthetic example: I still need to choose a class.",
            "en",
            FormationKind::OpenLoop,
        ),
    ]
    .into_iter()
    .enumerate()
    {
        if stop.load(Ordering::SeqCst) {
            return Err("catalog_locked");
        }
        let mut source: CapturedSource =
            load(include_str!("../../tests/fixtures/catalog/source.json"))?;
        source.record.source_id = policy.source_ids[index].clone();
        source.record.locator = Locator::RuntimeEvent {
            event_id: EventId::from_random(OsIdSource.random_16()),
        };
        source.record.access_policy_id = policy.access_policy_id.clone();
        source.record.captured_at = now.clone();
        source.record.created_at = now.clone();
        source.record.occurred_at = None;
        source.record.time_precision = TimePrecision::Unknown;
        source.record.original_conversation_id = None;
        source.record.original_message_id = None;
        source.record.branch_id = Knowable::Known(None);
        source.text = text.into();
        source.record.content_hash = sha256(source.text.as_bytes());
        source.attributed_subject = Some(policy.subject_id.clone());
        let fields = source
            .record_fields
            .as_mut()
            .ok_or("catalog_fixture_invalid")?;
        fields.conversation_id = None;
        fields.content_lang = language.into();
        vault
            .capture(
                &descriptor.system_actor,
                vec![source.clone()],
                RecordCatalog::default(),
            )
            .map_err(|error| {
                #[cfg(test)]
                eprintln!("synthetic catalog capture: {error:?}");
                let _ = error;
                "catalog_fixture_capture"
            })?;
        let mut input: AdmissionInput =
            load(include_str!("../../tests/fixtures/catalog/input.json"))?;
        input.policy = policy.reference();
        input.input_refs = vec![source.reference()];
        input.content = text.into();
        input.evidence = vec![EvidenceRef {
            source_id: source.record.source_id.clone(),
            source_revision: source.record.revision,
            locator: source.record.locator.clone(),
            object_hash: source.record.content_hash.clone(),
            evidence_class: source.record.evidence_class,
            supports: "content".into(),
        }];
        let dimensions = input.dimensions.as_mut().ok_or("catalog_fixture_invalid")?;
        dimensions.kind = kind;
        dimensions.occurrence = if kind == FormationKind::Episode {
            OccurrenceAssertion::ReportedOccurred
        } else {
            OccurrenceAssertion::Unknown
        };
        dimensions.state = if kind == FormationKind::OpenLoop {
            Some(FormationState::Open)
        } else {
            None
        };
        let fields = input
            .record_fields
            .as_mut()
            .ok_or("catalog_fixture_invalid")?;
        fields.title = title.into();
        fields.content_lang = language.into();
        fields.entities.clear();
        fields.annotations = None;
        fields.evidence = vec![QuotedEvidence {
            reference: input.evidence[0].clone(),
            quote: text.into(),
            speaker: SpeakerRole::User,
            start: 0,
            end: text.chars().count() as u32,
        }];
        let request = vault
            .prepare(&descriptor.system_actor, input)
            .map_err(|error| {
                #[cfg(test)]
                eprintln!("synthetic catalog prepare: {error:?}");
                let _ = error;
                "catalog_fixture_prepare"
            })?;
        let response = serde_json::to_string(
            &vault
                .evaluate(&descriptor.system_actor, &request)
                .map_err(|_| "catalog_fixture_evaluate")?,
        )
        .map_err(|_| "catalog_fixture_invalid")?;
        let binding = GenerationBinding {
            operation_id: request.operation_id.clone(),
            input_hash: digest(&request),
            response_hash: sha256(response.as_bytes()),
        };
        vault
            .apply_batch(
                &descriptor.system_actor,
                vec![request],
                vec![response],
                vec![binding],
            )
            .map_err(|_| "catalog_fixture_apply")?;
    }
    let reader =
        SegmentedMemoryReader::from_authenticated_system(vault, descriptor.system_actor.clone())
            .map_err(|_| "catalog_fixture_invalid")?;
    Ok(Fixture {
        reader,
        profile: load(include_str!("../../tests/fixtures/core8/profile.json"))?,
        system: descriptor.system_actor,
        _root: root,
    })
    // Retain only this fresh bounded example for diagnosis. Never reopen it.
}
