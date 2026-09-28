//! Origin-bound public observation of a committed pending batch.

use crate::observation::{MatchingPublicContent, ObservationError, match_public_content};
use enouia_activity_contract::{sha256_hex, validate_imported_pending};
use enouia_activity_store::ActivityLockGuard;
use enouia_activity_store::run_start::{RunDecision, RunStartError, decide_run_start};
use enouia_common::{Cancellation, Clock};
use serde_json::Value;
use std::time::Duration;

const MANIFEST_PATH: &str = "/status-data/current.json";
const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_ACTIVITY_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FetchError {
    Unavailable,
    Timeout,
    TooLarge,
}

pub struct FetchedResponse {
    pub status: u16,
    pub final_url: String,
    pub redirected: bool,
    pub body: Vec<u8>,
}

/// A platform adapter must enforce the supplied byte/deadline bounds and
/// report every redirect, including one whose final URL equals the request.
pub trait PublicFetcher {
    fn fetch(
        &self,
        url: &str,
        max_bytes: usize,
        timeout: Duration,
        cancellation: &dyn Cancellation,
    ) -> Result<FetchedResponse, FetchError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OriginBoundObservation {
    pub sequence: u64,
    pub exact_pending_sha256: String,
    pub content: MatchingPublicContent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PublicObservationError {
    Store(RunStartError),
    NoPending,
    Paused,
    InvalidOrigin,
    InvalidPending,
    Cancelled,
    Fetch(FetchError),
    UnexpectedStatus(u16),
    Redirected,
    WrongUrl,
    ResponseTooLarge,
    InvalidManifest,
    Content(ObservationError),
}

fn valid_origin(origin: &str) -> bool {
    let (scheme, authority) = if let Some(authority) = origin.strip_prefix("https://") {
        ("https", authority)
    } else if let Some(authority) = origin.strip_prefix("http://") {
        ("http", authority)
    } else {
        return false;
    };
    if authority.is_empty() || authority.contains(['/', '?', '#', '@', '[', ']']) {
        return false;
    }
    let (host, port) = authority
        .split_once(':')
        .map_or((authority, None), |(host, port)| (host, Some(port)));
    if host.is_empty()
        || host.split('.').any(|label| {
            label.is_empty()
                || !label.as_bytes()[0].is_ascii_alphanumeric()
                || !label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                || !label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
    {
        return false;
    }
    if scheme == "http" && host != "localhost" && host != "127.0.0.1" {
        return false;
    }
    port.is_none_or(|port| {
        !port.is_empty()
            && port.bytes().all(|byte| byte.is_ascii_digit())
            && port.parse::<u16>().is_ok_and(|value| value > 0)
    })
}

fn checked_response(
    response: FetchedResponse,
    expected_url: &str,
    limit: usize,
) -> Result<Vec<u8>, PublicObservationError> {
    if response.redirected {
        return Err(PublicObservationError::Redirected);
    }
    if response.final_url != expected_url {
        return Err(PublicObservationError::WrongUrl);
    }
    if response.status != 200 {
        return Err(PublicObservationError::UnexpectedStatus(response.status));
    }
    if response.body.len() > limit {
        return Err(PublicObservationError::ResponseTooLarge);
    }
    Ok(response.body)
}

/// One read-only observation, with no retry loop and no pending mutation.
/// The caller holds the writer lock from recovery through both fetches.
pub fn observe_pending_locked<F: PublicFetcher, C: Clock>(
    guard: &ActivityLockGuard,
    clock: &C,
    origin: &str,
    fetcher: &F,
    cancellation: &dyn Cancellation,
) -> Result<OriginBoundObservation, PublicObservationError> {
    let (sequence, exact_bytes) =
        match decide_run_start(guard, clock).map_err(PublicObservationError::Store)? {
            RunDecision::RetryPending {
                sequence,
                exact_bytes,
                ..
            } => (sequence, exact_bytes),
            RunDecision::Paused { .. } => return Err(PublicObservationError::Paused),
            RunDecision::Collect { .. } => return Err(PublicObservationError::NoPending),
        };
    if !valid_origin(origin) {
        return Err(PublicObservationError::InvalidOrigin);
    }
    let raw: Value =
        serde_json::from_slice(&exact_bytes).map_err(|_| PublicObservationError::InvalidPending)?;
    let batch = validate_imported_pending(&raw, clock)
        .map_err(|_| PublicObservationError::InvalidPending)?;
    if batch.sequence != sequence {
        return Err(PublicObservationError::InvalidPending);
    }
    if cancellation.is_cancelled() {
        return Err(PublicObservationError::Cancelled);
    }
    let manifest_url = format!("{origin}{MANIFEST_PATH}");
    let manifest = match fetcher.fetch(
        &manifest_url,
        MAX_MANIFEST_BYTES,
        Duration::from_secs(15),
        cancellation,
    ) {
        Ok(response) => response,
        Err(_) if cancellation.is_cancelled() => return Err(PublicObservationError::Cancelled),
        Err(error) => return Err(PublicObservationError::Fetch(error)),
    };
    if cancellation.is_cancelled() {
        return Err(PublicObservationError::Cancelled);
    }
    let manifest = checked_response(manifest, &manifest_url, MAX_MANIFEST_BYTES)?;
    let parsed: Value =
        serde_json::from_slice(&manifest).map_err(|_| PublicObservationError::InvalidManifest)?;
    let activity_ref = parsed["activity"]["url"]
        .as_str()
        .ok_or(PublicObservationError::InvalidManifest)?;
    let hash = parsed["activity"]["hash"]
        .as_str()
        .ok_or(PublicObservationError::InvalidManifest)?;
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        || activity_ref != format!("/status-data/activity/{hash}.json")
    {
        return Err(PublicObservationError::InvalidManifest);
    }
    let activity_url = format!("{origin}{activity_ref}");
    let activity = match fetcher.fetch(
        &activity_url,
        MAX_ACTIVITY_BYTES,
        Duration::from_secs(15),
        cancellation,
    ) {
        Ok(response) => response,
        Err(_) if cancellation.is_cancelled() => return Err(PublicObservationError::Cancelled),
        Err(error) => return Err(PublicObservationError::Fetch(error)),
    };
    if cancellation.is_cancelled() {
        return Err(PublicObservationError::Cancelled);
    }
    let activity = checked_response(activity, &activity_url, MAX_ACTIVITY_BYTES)?;
    let content = match_public_content(&batch, &manifest, &activity, clock.now_unix_ms())
        .map_err(PublicObservationError::Content)?;
    Ok(OriginBoundObservation {
        sequence,
        exact_pending_sha256: sha256_hex(&exact_bytes),
        content,
    })
}
