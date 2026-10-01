use enouia_activity_delivery::{public_fetch::valid_origin, ssh::valid_alias};
use serde::Deserialize;
use std::fs::File;
use std::io::Read;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub version: u8,
    pub mode: Mode,
    pub data_root: PathBuf,
    #[serde(default)]
    pub delivery_enabled: bool,
    pub delivery: Option<DeliveryConfig>,
    pub github: Option<GithubConfig>,
    pub codex: Option<CodexConfig>,
    pub claude: Option<ClaudeConfig>,
    #[serde(default = "default_budget")]
    pub max_run_seconds: u64,
}

fn default_budget() -> u64 {
    900
}
fn default_observation() -> u64 {
    60
}
fn default_retry() -> u64 {
    3600
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Sandbox,
    Production,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeliveryConfig {
    pub ssh_executable: PathBuf,
    pub restricted_alias: String,
    pub curl_executable: PathBuf,
    pub public_origin: String,
    #[serde(default = "default_observation")]
    pub observation_seconds: u64,
    #[serde(default = "default_retry")]
    pub retry_seconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GithubConfig {
    pub executable: PathBuf,
    pub login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexConfig {
    pub executable: PathBuf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClaudeConfig {
    pub node_executable: PathBuf,
    pub ccusage_cli: PathBuf,
    pub normal_store: PathBuf,
    pub roaming_claude: PathBuf,
    pub local_packages: PathBuf,
    pub expected_stores: Vec<PathBuf>,
}

impl Config {
    /// Structural configuration errors block all mutations. Missing installed
    /// collector tools instead become individual failed source attempts.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.version != 1
            || !self.data_root.is_absolute()
            || !(1..=900).contains(&self.max_run_seconds)
        {
            return Err("invalid_config");
        }
        if self.delivery_enabled && self.delivery.is_none() {
            return Err("invalid_config");
        }
        if let Some(d) = &self.delivery {
            if !d.ssh_executable.is_absolute()
                || !d.curl_executable.is_absolute()
                || !valid_alias(&d.restricted_alias)
                || !valid_origin(&d.public_origin)
                || d.observation_seconds > 60
                || !(1..=86400).contains(&d.retry_seconds)
            {
                return Err("invalid_config");
            }
            if self.mode == Mode::Sandbox
                && !(d.public_origin.starts_with("http://127.0.0.1")
                    || d.public_origin.starts_with("http://localhost"))
            {
                return Err("invalid_config");
            }
        }
        if self
            .github
            .as_ref()
            .is_some_and(|c| !c.executable.is_absolute() || c.login.trim().is_empty())
            || self
                .codex
                .as_ref()
                .is_some_and(|c| !c.executable.is_absolute())
        {
            return Err("invalid_config");
        }
        if self.claude.as_ref().is_some_and(|c| {
            [
                &c.node_executable,
                &c.ccusage_cli,
                &c.normal_store,
                &c.roaming_claude,
                &c.local_packages,
            ]
            .iter()
            .any(|p| !p.is_absolute())
                || c.expected_stores.len() > 128
                || c.expected_stores.iter().any(|p| !p.is_absolute())
        }) {
            return Err("invalid_config");
        }
        Ok(())
    }
}

/// Bounded config input; no environment fallback, secret field, or repo path.
pub fn read_config(path: &Path) -> Result<Config, &'static str> {
    if !path.is_absolute() {
        return Err("invalid_config");
    }
    let mut file: File = File::options()
        .read(true)
        .custom_flags(0x0020_0000)
        .open(path)
        .map_err(|_| "invalid_config")?;
    let metadata = file.metadata().map_err(|_| "invalid_config")?;
    if !metadata.is_file() || metadata.file_attributes() & 0x400 != 0 || metadata.len() > 65536 {
        return Err("invalid_config");
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|_| "invalid_config")?;
    if bytes.len() > 65536 {
        return Err("invalid_config");
    }
    let config: Config = serde_json::from_slice(&bytes).map_err(|_| "invalid_config")?;
    config.validate()?;
    Ok(config)
}
