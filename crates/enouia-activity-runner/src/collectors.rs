use crate::config::Config;
use enouia_activity::{SourceAttempt, SourceId, claude, codex, github};
use enouia_common::{Cancellation, ComponentId, ErrorCode};
use enouia_windows_process::{
    WindowsJsonLineSession, WindowsProcessRunner, discover_claude_stores,
};
use std::ffi::OsString;
use std::time::Duration;

pub trait Collector {
    fn collect(
        &self,
        attempted_at: &str,
        cancellation: &dyn Cancellation,
    ) -> Result<[SourceAttempt; 3], Cancelled>;
}

#[derive(Debug)]
pub struct Cancelled;

pub struct LocalCollector<'a> {
    pub config: &'a Config,
}

impl Collector for LocalCollector<'_> {
    fn collect(
        &self,
        attempted_at: &str,
        cancellation: &dyn Cancellation,
    ) -> Result<[SourceAttempt; 3], Cancelled> {
        let failed = |source, error_code| SourceAttempt::Failed {
            source,
            attempted_at: attempted_at.to_owned(),
            error_code,
        };
        if cancellation.is_cancelled() {
            return Err(Cancelled);
        }
        let github = match &self.config.github {
            None => failed(SourceId::Github, ErrorCode::Unconfigured),
            Some(c) => github::collect(
                &github::GithubConfig {
                    executable: &c.executable,
                    login: &c.login,
                },
                attempted_at,
                &WindowsProcessRunner::new(ComponentId::ActivityCollectorGithub),
                cancellation,
            )
            .map_err(|_| Cancelled)?,
        };
        if cancellation.is_cancelled() {
            return Err(Cancelled);
        }
        let codex = match &self.config.codex {
            None => failed(SourceId::Codex, ErrorCode::Unconfigured),
            Some(c) => match WindowsJsonLineSession::spawn(
                &c.executable,
                &[OsString::from("app-server")],
                Duration::from_secs(90),
                4 * 1024 * 1024,
            ) {
                Ok(mut session) => codex::collect(&mut session, attempted_at, cancellation)
                    .map_err(|_| Cancelled)?,
                Err(error) => failed(SourceId::Codex, error.code),
            },
        };
        if cancellation.is_cancelled() {
            return Err(Cancelled);
        }
        let claude = match &self.config.claude {
            None => failed(SourceId::Claude, ErrorCode::Unconfigured),
            Some(c) => match discover_claude_stores(
                &c.normal_store,
                &c.roaming_claude,
                &c.local_packages,
                &c.expected_stores,
            ) {
                Err(error) => failed(SourceId::Claude, error.code),
                Ok(stores) => claude::collect(
                    &claude::ClaudeConfig {
                        node_executable: &c.node_executable,
                        ccusage_cli: &c.ccusage_cli,
                        stores: &stores,
                    },
                    attempted_at,
                    &WindowsProcessRunner::new(ComponentId::ActivityCollectorClaude),
                    cancellation,
                )
                .map_err(|_| Cancelled)?,
            },
        };
        if cancellation.is_cancelled() {
            return Err(Cancelled);
        }
        Ok([github, codex, claude])
    }
}
