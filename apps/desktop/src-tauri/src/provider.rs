//! Native text Provider setup for the embedded Memory Core (ADR-032; Enouia
//! Memory ADR-MEM-48).
//!
//! Sending stays off unless the owner writes `memory-providers.json` in
//! Runtime's configuration folder. That file names each API, its exact model
//! and the limits the owner verified for that account; nothing is inferred
//! from a subscription or a model name. Keys live only in Windows Credential
//! Manager. They are entered through the native Windows credential prompt and
//! never pass through the page, the settings file or a log.
//!
//! This module only parses that file, injects `HttpsTransport` and
//! `CredentialStore` into the Core, and runs the native key prompt. Every
//! egress rule (grants, exact-body confirmation, one attempt, ledger) lives in
//! the Core.

use crate::memory::MemoryHost;
use enouia_memory_contract::json::SchemaVersion;
use enouia_memory_contract::provider::{Capability, ProviderCapabilities, TokenCounting};
use enouia_memory_contract::time::Timestamp;
use enouia_memory_provider::client::Limits;
use enouia_memory_provider::codec::Api;
use enouia_memory_provider::transport::{HttpsTransport, Transport};
use enouia_memory_provider::vault::Quota;
use enouia_memory_provider::windows::CredentialStore;
use enouia_memory_workspace::{NativeDestination, NativeProvider};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Manager, State, WebviewWindow};

/// The settings file, in Runtime's configuration folder.
pub const SETTINGS_FILE: &str = "memory-providers.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
enum ApiName {
    Openai,
    Anthropic,
}

impl ApiName {
    fn api(self) -> Api {
        match self {
            ApiName::Openai => Api::OpenAiResponses,
            ApiName::Anthropic => Api::AnthropicMessages,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DestinationSetting {
    api: ApiName,
    model: String,
    context_window_tokens: u64,
    max_output_tokens: u64,
    streaming: bool,
    verified_at: Timestamp,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    schema_version: u32,
    destinations: Vec<DestinationSetting>,
    max_attempts_per_session: usize,
    max_reserved_tokens_per_session: u64,
}

/// What the owner's settings file yields: a stable rule on refusal, never
/// file text or a path.
pub fn parse(bytes: &[u8]) -> Result<NativeProvider, &'static str> {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let settings: Settings =
        serde_json::from_slice(bytes).map_err(|_| "provider_setup.malformed")?;
    if settings.schema_version != 1 {
        return Err("provider_setup.schema_version");
    }
    if settings.destinations.is_empty() || settings.destinations.len() > 2 {
        return Err("provider_setup.destinations");
    }
    if settings.max_attempts_per_session == 0
        || settings.max_attempts_per_session > 1000
        || settings.max_reserved_tokens_per_session == 0
    {
        return Err("provider_setup.quota");
    }
    let mut seen = Vec::new();
    let mut destinations = Vec::new();
    for d in settings.destinations {
        if seen.contains(&d.api) {
            return Err("provider_setup.duplicate_api");
        }
        seen.push(d.api);
        let api = d.api.api();
        let binding = api.binding(&d.model).map_err(|_| "provider_setup.model")?;
        if d.max_output_tokens == 0 || d.context_window_tokens <= d.max_output_tokens {
            return Err("provider_setup.limits");
        }
        destinations.push(NativeDestination {
            api,
            capabilities: ProviderCapabilities {
                schema_version: SchemaVersion,
                binding,
                text_input: Capability::Supported,
                image_input: Capability::Unsupported,
                streaming: if d.streaming {
                    Capability::Supported
                } else {
                    Capability::Unsupported
                },
                tool_calling: Capability::Unsupported,
                cancellation: Capability::Supported,
                token_counting: TokenCounting::Estimated,
                context_window_tokens: Some(d.context_window_tokens),
                max_output_tokens: Some(d.max_output_tokens),
                verified_at: Some(d.verified_at),
            },
        });
    }
    Ok(NativeProvider {
        transport: Arc::new(HttpsTransport),
        secrets: Arc::new(CredentialStore),
        destinations,
        quota: Quota {
            max_attempts: settings.max_attempts_per_session,
            max_reserved_tokens: settings.max_reserved_tokens_per_session,
            price_limit: None,
        },
        limits: Limits::default(),
    })
}

/// The setup state the page may see.
#[derive(Clone, Debug, PartialEq)]
pub enum Setup {
    /// No settings file: sending is off.
    Absent,
    /// The file was refused for this rule; sending is off.
    Invalid(&'static str),
    /// The Core holds this setup.
    Ready,
}

impl Setup {
    pub fn describe(&self) -> Value {
        match self {
            Setup::Absent => json!({"state": "absent", "file": SETTINGS_FILE}),
            Setup::Invalid(rule) => {
                json!({"state": "invalid", "rule": rule, "file": SETTINGS_FILE})
            }
            Setup::Ready => json!({"state": "ready", "file": SETTINGS_FILE}),
        }
    }
}

/// Read the settings file, if any.
pub fn load(path: &Path) -> Result<Option<NativeProvider>, &'static str> {
    let bytes = (|| {
        let file = std::fs::File::open(path)?;
        let mut bytes = Vec::new();
        file.take(64 * 1024 + 1).read_to_end(&mut bytes)?;
        Ok::<_, std::io::Error>(bytes)
    })();
    match bytes {
        Ok(bytes) if bytes.len() > 64 * 1024 => Err("provider_setup.too_large"),
        Ok(bytes) => parse(&bytes).map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("provider_setup.unreadable"),
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(SETTINGS_FILE))
}

/// Load the owner's settings and hand them to the Core. Called at start
/// and before a key change; a missing or invalid file leaves sending off.
pub fn apply(host: &MemoryHost, path: Option<&Path>) -> Result<Setup, &'static str> {
    let _update = host.provider_update()?;
    apply_locked(host, path)
}

fn apply_locked(host: &MemoryHost, path: Option<&Path>) -> Result<Setup, &'static str> {
    let loaded = match path {
        None => Err("provider_setup.unreadable"),
        Some(path) => load(path),
    };
    let (provider, setup) = match loaded {
        Ok(None) => (None, Setup::Absent),
        Ok(Some(provider)) => (Some(provider), Setup::Ready),
        Err(rule) => (None, Setup::Invalid(rule)),
    };
    // A busy Core keeps its previous setup. Never claim sending is off if
    // taking the setup away was refused by a running call.
    host.replace_provider_setup(provider, setup.clone())?;
    Ok(setup)
}

fn credential_name(api: &str) -> Option<&'static str> {
    match api {
        "openai" => Some("Enouia.Memory.Provider.openai"),
        "anthropic" => Some("Enouia.Memory.Provider.anthropic"),
        _ => None,
    }
}

/// The page asks for the setup state. It never learns a key or a path.
#[tauri::command]
pub async fn memory_provider_setup(
    window: WebviewWindow,
    host: State<'_, MemoryHost>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    Ok(host.provider_setup().describe())
}

/// Explicitly reload the same host-owned file. This neither prompts for a
/// key nor dispatches a request; the page cannot supply a path or file text.
#[tauri::command]
pub async fn memory_provider_reload(
    window: WebviewWindow,
    host: State<'_, MemoryHost>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let host = host.inner().clone();
    let path = settings_path(window.app_handle());
    tauri::async_runtime::spawn_blocking(move || {
        apply(&host, path.as_deref())
            .map(|setup| setup.describe())
            .map_err(str::to_owned)
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}

/// Set or remove one API key natively. `set` opens the Windows credential
/// prompt; the key goes from that prompt to Credential Manager without
/// reaching the page. `remove` first takes the setup out of the Core, which
/// refuses while a send is running, then restores it from the settings file.
#[tauri::command]
pub async fn memory_provider_key(
    window: WebviewWindow,
    host: State<'_, MemoryHost>,
    api: String,
    action: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("permission_denied".into());
    }
    let name = credential_name(&api).ok_or("invalid_request")?;
    if host.is_closing() {
        return Err("runtime_closing".into());
    }
    let host = host.inner().clone();
    let path = settings_path(window.app_handle());
    #[cfg(windows)]
    let parent = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    #[cfg(not(windows))]
    let parent = 0isize;
    tauri::async_runtime::spawn_blocking(move || {
        let _update = host.provider_update().map_err(str::to_owned)?;
        match action.as_str() {
            "set" => set_key(name, &api, parent),
            "remove" => {
                host.replace_provider_setup(None, Setup::Absent)
                    .map_err(|_| "provider_busy".to_owned())?;
                let removed = CredentialStore.delete(name);
                let applied = apply_locked(&host, path.as_deref());
                removed.map_err(|_| "credential_failed".to_owned())?;
                applied.map_err(str::to_owned)?;
                Ok(json!({"removed": true}))
            }
            _ => Err("invalid_request".into()),
        }
    })
    .await
    .map_err(|_| "worker_failed".to_owned())?
}

fn set_key(name: &str, api: &str, parent: isize) -> Result<Value, String> {
    let Some(secret) =
        prompt::ask(api, parent).map_err(|_| "credential_prompt_failed".to_owned())?
    else {
        return Ok(json!({"cancelled": true}));
    };
    // The same local shape rule native sending applies, so a malformed key
    // is refused here instead of at the first send.
    HttpsTransport
        .validate_secret(&secret)
        .map_err(|_| "credential_malformed".to_owned())?;
    CredentialStore
        .write(name, &secret)
        .map_err(|_| "credential_failed".to_owned())?;
    Ok(json!({"saved": true}))
}

#[cfg(windows)]
mod prompt {
    use enouia_memory_contract::ports::SecretBytes;
    use windows_sys::Win32::Foundation::{
        ERROR_CANCELLED, ERROR_INSUFFICIENT_BUFFER, GetLastError,
    };
    use windows_sys::Win32::Security::Credentials::{
        CREDUI_INFOW, CREDUIWIN_GENERIC, CredUIPromptForWindowsCredentialsW,
        CredUnPackAuthenticationBufferW,
    };
    use windows_sys::Win32::System::Com::CoTaskMemFree;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// Ask for one key in the native Windows credential prompt. The user
    /// name field is ignored; the password field holds the key. `Ok(None)`
    /// means the owner cancelled.
    pub fn ask(api: &str, parent: isize) -> Result<Option<SecretBytes>, ()> {
        let caption = wide("Enouia Runtime");
        let message = wide(&format!(
            "Paste the {api} API key into the password field. The user name is not used. \
             The key is saved in Windows Credential Manager only."
        ));
        let info = CREDUI_INFOW {
            cbSize: std::mem::size_of::<CREDUI_INFOW>() as u32,
            hwndParent: parent as _,
            pszMessageText: message.as_ptr(),
            pszCaptionText: caption.as_ptr(),
            hbmBanner: std::ptr::null_mut(),
        };
        let mut package = 0u32;
        let mut out: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut out_size = 0u32;
        let mut save = 0;
        // SAFETY: valid, nul-terminated strings outlive the call; the out
        // buffer is zeroed and freed exactly once below.
        let status = unsafe {
            CredUIPromptForWindowsCredentialsW(
                &info,
                0,
                &mut package,
                std::ptr::null(),
                0,
                &mut out,
                &mut out_size,
                &mut save,
                CREDUIWIN_GENERIC,
            )
        };
        if status == ERROR_CANCELLED {
            return Ok(None);
        }
        if status != 0 || out.is_null() {
            return Err(());
        }
        let result = unpack(out, out_size);
        // SAFETY: `out` holds `out_size` bytes allocated by CredUI.
        unsafe {
            std::ptr::write_bytes(out.cast::<u8>(), 0, out_size as usize);
            CoTaskMemFree(out);
        }
        result.map(Some)
    }

    fn unpack(buffer: *mut core::ffi::c_void, size: u32) -> Result<SecretBytes, ()> {
        let (mut user, mut domain, mut pass) = (0u32, 0u32, 0u32);
        // SAFETY: a sizing call with null outputs, as documented.
        let sized = unsafe {
            CredUnPackAuthenticationBufferW(
                0,
                buffer,
                size,
                std::ptr::null_mut(),
                &mut user,
                std::ptr::null_mut(),
                &mut domain,
                std::ptr::null_mut(),
                &mut pass,
            )
        };
        if sized != 0 || unsafe { GetLastError() } != ERROR_INSUFFICIENT_BUFFER || pass == 0 {
            return Err(());
        }
        let mut user_buf = vec![0u16; user.max(1) as usize];
        let mut domain_buf = vec![0u16; domain.max(1) as usize];
        let mut pass_buf = vec![0u16; pass as usize];
        // SAFETY: buffers have the sizes the sizing call reported.
        let ok = unsafe {
            CredUnPackAuthenticationBufferW(
                0,
                buffer,
                size,
                user_buf.as_mut_ptr(),
                &mut user,
                domain_buf.as_mut_ptr(),
                &mut domain,
                pass_buf.as_mut_ptr(),
                &mut pass,
            )
        };
        let end = pass_buf
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(pass_buf.len());
        let key = if ok == 0 {
            Err(())
        } else {
            String::from_utf16(&pass_buf[..end])
                .map(|key| SecretBytes::new(key.into_bytes()))
                .map_err(|_| ())
        };
        pass_buf.fill(0);
        user_buf.fill(0);
        key
    }
}

#[cfg(not(windows))]
mod prompt {
    use enouia_memory_contract::ports::SecretBytes;
    pub fn ask(_: &str, _: isize) -> Result<Option<SecretBytes>, ()> {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(destinations: Value) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "schemaVersion": 1, "destinations": destinations,
            "maxAttemptsPerSession": 10, "maxReservedTokensPerSession": 100000,
        }))
        .unwrap()
    }

    fn openai() -> Value {
        json!({"api": "openai", "model": "synthetic-model", "contextWindowTokens": 128000,
            "maxOutputTokens": 4096, "streaming": true, "verifiedAt": "2026-10-11T00:00:00.000Z"})
    }

    #[test]
    fn owner_settings_become_explicit_destinations() {
        let mut anthropic = openai();
        anthropic["api"] = json!("anthropic");
        anthropic["streaming"] = json!(false);
        let provider = parse(&settings(json!([openai(), anthropic]))).unwrap();
        assert_eq!(provider.destinations.len(), 2);
        let first = &provider.destinations[0].capabilities;
        assert_eq!(first.binding.model, "synthetic-model");
        assert_eq!(first.binding.provider, "openai");
        assert_eq!(first.streaming, Capability::Supported);
        assert_eq!(
            provider.destinations[1].capabilities.streaming,
            Capability::Unsupported
        );
        assert_eq!(provider.quota.max_attempts, 10);
        // A BOM from Notepad is accepted.
        let mut bom = b"\xEF\xBB\xBF".to_vec();
        bom.extend(settings(json!([openai()])));
        assert!(parse(&bom).is_ok());
    }

    #[test]
    fn unclear_settings_leave_sending_off_with_a_rule() {
        let mut unknown = openai();
        unknown["apiKey"] = json!("not-allowed-here");
        let mut bad_api = openai();
        bad_api["api"] = json!("other");
        let mut bad_model = openai();
        bad_model["model"] = json!("has space");
        let mut limits = openai();
        limits["maxOutputTokens"] = json!(200000);
        for (bytes, rule) in [
            (b"not json".to_vec(), "provider_setup.malformed"),
            (settings(json!([unknown])), "provider_setup.malformed"),
            (settings(json!([bad_api])), "provider_setup.malformed"),
            (settings(json!([])), "provider_setup.destinations"),
            (
                settings(json!([openai(), openai()])),
                "provider_setup.duplicate_api",
            ),
            (settings(json!([bad_model])), "provider_setup.model"),
            (settings(json!([limits])), "provider_setup.limits"),
        ] {
            assert_eq!(parse(&bytes).err(), Some(rule));
        }
        let mut version: Value = serde_json::from_slice(&settings(json!([openai()]))).unwrap();
        version["schemaVersion"] = json!(2);
        assert_eq!(
            parse(&serde_json::to_vec(&version).unwrap()).err(),
            Some("provider_setup.schema_version")
        );
        version["schemaVersion"] = json!(1);
        version["maxAttemptsPerSession"] = json!(0);
        assert_eq!(
            parse(&serde_json::to_vec(&version).unwrap()).err(),
            Some("provider_setup.quota")
        );
    }

    #[test]
    fn a_missing_file_is_absent_and_the_core_accepts_parsed_settings() {
        let dir =
            std::env::temp_dir().join(format!("enouia-provider-setup-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(SETTINGS_FILE);
        let _ = std::fs::remove_file(&path);
        let host = MemoryHost::new();
        assert_eq!(apply(&host, Some(&path)), Ok(Setup::Absent));
        std::fs::write(&path, settings(json!([openai()]))).unwrap();
        assert_eq!(apply(&host, Some(&path)), Ok(Setup::Ready));
        assert_eq!(host.provider_setup().describe()["state"], "ready");
        std::fs::write(&path, b"{").unwrap();
        assert_eq!(
            apply(&host, Some(&path)),
            Ok(Setup::Invalid("provider_setup.malformed"))
        );
        let status = host
            .forward(
                &json!({"schemaVersion": 1, "requestId": "req_00000000-0000-4000-8000-000000000001",
                "command": "provider_status", "idempotencyKey": null, "arguments": {}}),
            )
            .unwrap();
        assert_eq!(status["result"]["configured"], false);
        std::fs::write(&path, settings(json!([openai()]))).unwrap();
        assert_eq!(apply(&host, Some(&path)), Ok(Setup::Ready));
        let before = std::fs::read(&path).unwrap();
        {
            let _update = host.provider_update().unwrap();
            assert_eq!(apply(&host, Some(&path)), Err("provider_setup.busy"));
            assert_eq!(host.provider_setup(), Setup::Ready);
        }
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(apply(&host, Some(&path)), Ok(Setup::Absent));
        host.begin_close();
        assert_eq!(apply(&host, Some(&path)), Err("runtime_closing"));
        host.shutdown();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn core_refusal_does_not_replace_the_observed_setup() {
        let host = MemoryHost::new();
        host.replace_provider_setup(
            Some(parse(&settings(json!([openai()]))).unwrap()),
            Setup::Ready,
        )
        .unwrap();
        let mut refused = parse(&settings(json!([openai()]))).unwrap();
        refused.destinations[0].capabilities.context_window_tokens = Some(0);
        assert_eq!(
            host.replace_provider_setup(Some(refused), Setup::Ready),
            Err("provider_setup.refused")
        );
        assert_eq!(host.provider_setup(), Setup::Ready);
        host.shutdown();
    }

    #[test]
    fn oversized_settings_are_refused_before_parsing() {
        let path =
            std::env::temp_dir().join(format!("enouia-provider-large-{}.json", std::process::id()));
        std::fs::write(&path, vec![b' '; 64 * 1024 + 1]).unwrap();
        assert_eq!(load(&path).err(), Some("provider_setup.too_large"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_running_synthetic_send_preserves_setup_until_reload_can_disable_it() {
        use enouia_memory_contract::foundation::{Cancellation, ComponentId};
        use enouia_memory_contract::ports::{SecretBytes, SecretStore};
        use enouia_memory_contract::{MemoryError, MemoryErrorCode};
        use enouia_memory_provider::codec::WireRequest;
        use enouia_memory_workspace::PickKind;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::time::{Duration, Instant};

        struct Secrets;
        impl SecretStore for Secrets {
            fn read(&self, _: &str) -> Result<SecretBytes, MemoryError> {
                Ok(SecretBytes::new(b"synthetic-secret".to_vec()))
            }
        }
        struct Held(AtomicBool);
        impl Transport for Held {
            fn exchange(
                &self,
                _: &WireRequest,
                _: &SecretBytes,
                cancel: &dyn Cancellation,
                _: Duration,
                _: &mut dyn FnMut(&[u8]) -> Result<(), MemoryError>,
            ) -> Result<(), MemoryError> {
                self.0.store(true, Ordering::SeqCst);
                let deadline = Instant::now() + Duration::from_secs(10);
                while !cancel.is_cancelled() && Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(MemoryError::new(
                    MemoryErrorCode::Cancelled,
                    ComponentId::Provider,
                ))
            }
        }
        struct Fixture {
            host: MemoryHost,
            dir: PathBuf,
        }
        impl Drop for Fixture {
            fn drop(&mut self) {
                self.host.shutdown();
                let _ = std::fs::remove_dir_all(&self.dir);
            }
        }
        let dir = std::env::temp_dir().join(format!("enouia-provider-held-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let dir = std::fs::canonicalize(dir).unwrap();
        let dir = PathBuf::from(dir.to_string_lossy().trim_start_matches(r"\\?\"));
        let fixture = Fixture {
            host: MemoryHost::new(),
            dir,
        };
        let host = &fixture.host;
        let mut n = 0;
        let mut call = |command: &str, arguments: Value| {
            n += 1;
            let response = host
                .forward(&json!({"schemaVersion": 1,
                "requestId": format!("req_00000000-0000-4000-8000-{n:012}"),
                "command": command, "idempotencyKey": if enouia_memory_contract::workspace::is_write(command) { json!(format!("synthetic-provider-test-{n:04}")) } else { Value::Null },
                "arguments": arguments}))
                .unwrap();
            assert_eq!(response["error"], Value::Null, "{response}");
            response["result"].clone()
        };
        let token = host.register_pick(PickKind::VaultRoot, &fixture.dir.join("vault"));
        call(
            "vault_create",
            json!({"rootToken": token["token"], "confirmPhrase": "create new vault"}),
        );
        let http = Arc::new(Held(AtomicBool::new(false)));
        let mut provider = parse(&settings(json!([openai()]))).unwrap();
        provider.transport = http.clone();
        provider.secrets = Arc::new(Secrets);
        host.replace_provider_setup(Some(provider), Setup::Ready)
            .unwrap();
        let plan = call(
            "egress_grant_plan",
            json!({"apis": ["openai"], "maxSensitivity": "private", "extraction": false}),
        );
        let policy = call(
            "provider_confirm",
            json!({"planId": plan["planId"], "diffHash": plan["diffHash"]}),
        );
        let session = call("session_new", json!({}));
        let prepared = call(
            "external_prepare",
            json!({"sessionId": session["sessionId"], "branchId": session["branchId"],
            "text": "Synthetic question only", "api": "openai", "policyId": policy["policyId"], "streaming": false, "outputTokens": 128}),
        );
        let started = call(
            "external_send",
            json!({"callId": prepared["callId"], "wireHash": prepared["wireHash"]}),
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        while !http.0.load(Ordering::SeqCst) {
            assert!(
                Instant::now() < deadline,
                "synthetic transport did not start"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        let operations = call("operation_list", json!({}));
        let observed = operations["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|op| op["operationId"] == started["operationId"])
            .unwrap();
        assert_eq!(observed["kind"], "external_send");
        assert!(matches!(
            observed["state"].as_str(),
            Some("queued" | "running")
        ));
        assert!(observed["progress"]["done"].is_u64());
        assert!(observed["cancelRequested"].is_boolean());
        for private in ["body", "secret", "path", "text"] {
            assert!(observed.get(private).is_none());
        }
        let path = fixture.dir.join(SETTINGS_FILE);
        std::fs::write(&path, b"{").unwrap();
        assert_eq!(apply(host, Some(&path)), Err("provider.call_running"));
        assert_eq!(host.provider_setup(), Setup::Ready);
        assert_eq!(call("provider_status", json!({}))["configured"], true);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(apply(host, Some(&path)), Err("provider.call_running"));
        assert_eq!(host.provider_setup(), Setup::Ready);
        call(
            "operation_cancel",
            json!({"operationId": started["operationId"]}),
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match apply(host, Some(&path)) {
                Ok(Setup::Absent) => break,
                Err("provider.call_running") if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(5))
                }
                other => panic!("reload did not recover: {other:?}"),
            }
        }
        assert_eq!(call("provider_status", json!({}))["configured"], false);

        // A lifecycle interruption leaves an unknown saved outcome. Local
        // closure must remain possible after native setup is removed.
        let mut provider = parse(&settings(json!([openai()]))).unwrap();
        provider.transport = http.clone();
        provider.secrets = Arc::new(Secrets);
        host.replace_provider_setup(Some(provider), Setup::Ready)
            .unwrap();
        let session = call("session_new", json!({}));
        let prepared = call(
            "external_prepare",
            json!({"sessionId":session["sessionId"],"branchId":session["branchId"],
            "text":"Second synthetic question", "api":"openai", "policyId":policy["policyId"],"streaming":false,"outputTokens":128}),
        );
        http.0.store(false, Ordering::SeqCst);
        call(
            "external_send",
            json!({"callId":prepared["callId"],"wireHash":prepared["wireHash"]}),
        );
        let deadline = Instant::now() + Duration::from_secs(5);
        while !http.0.load(Ordering::SeqCst) {
            assert!(
                Instant::now() < deadline,
                "second synthetic transport did not start"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        call("vault_lock", json!({}));
        call("vault_unlock", json!({}));
        host.replace_provider_setup(None, Setup::Absent).unwrap();
        let branch = json!({"sessionId":session["sessionId"],"branchId":session["branchId"]});
        let saved = call("session_detail", branch.clone());
        let invocation = &saved["invocations"][0];
        assert_eq!(invocation["state"], "outcome_unknown");
        let plan = call(
            "external_interrupt_plan",
            json!({"inputEventId":invocation["input_event_id"],"dispatchId":invocation["dispatch_id"]}),
        );
        assert_eq!(plan["kind"], "interrupt");
        call(
            "provider_confirm",
            json!({"planId":plan["planId"],"diffHash":plan["diffHash"]}),
        );
        assert_eq!(
            call("session_detail", branch)["invocations"][0]["state"],
            "cancelled"
        );
        assert_eq!(call("provider_status", json!({}))["configured"], false);
    }

    #[test]
    fn only_the_two_provider_entries_can_be_named() {
        assert_eq!(
            credential_name("openai"),
            Some("Enouia.Memory.Provider.openai")
        );
        assert_eq!(
            credential_name("anthropic"),
            Some("Enouia.Memory.Provider.anthropic")
        );
        assert_eq!(credential_name("Enouia.Memory.Provider.openai"), None);
        assert_eq!(credential_name(""), None);
    }
}
