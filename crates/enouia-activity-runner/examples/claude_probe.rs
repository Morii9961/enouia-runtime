//! Development-only Claude capability probe for operator acceptance (O3).
//! Runs the real store discovery and the real Claude adapter, one store at a
//! time and then all together, from an Activity config. Prints stage results,
//! store counts and error codes only: never paths, dates, values or output.
//! It reads no Activity store and writes nothing.
use enouia_activity::{SourceAttempt, claude};
use enouia_activity_runner::config::read_config;
use enouia_common::{Cancellation, ComponentId};
use enouia_windows_process::{WindowsProcessRunner, discover_claude_stores};
use serde_json::{Value, json};
use std::path::PathBuf;

struct Never;
impl Cancellation for Never {
    fn is_cancelled(&self) -> bool {
        false
    }
}

fn outcome(attempt: &SourceAttempt) -> Value {
    match attempt {
        SourceAttempt::Success { snapshot, .. } => {
            json!({"result": "success", "days": snapshot.days.len()})
        }
        SourceAttempt::Failed { error_code, .. } => json!({"result": "failed", "code": error_code}),
    }
}

fn main() {
    let path = std::env::args_os().nth(1).map(PathBuf::from);
    let Some(config) = path.and_then(|p| read_config(&p).ok()) else {
        println!("{}", json!({"state": "invalid_config"}));
        std::process::exit(5);
    };
    let Some(c) = &config.claude else {
        println!("{}", json!({"state": "unconfigured"}));
        std::process::exit(5);
    };
    let stores = match discover_claude_stores(
        &c.normal_store,
        &c.roaming_claude,
        &c.local_packages,
        &c.expected_stores,
    ) {
        Ok(stores) => stores,
        Err(error) => {
            println!(
                "{}",
                json!({"state": "discovery_failed", "code": error.code})
            );
            std::process::exit(6);
        }
    };
    let at = "2026-10-07T00:00:00.000Z";
    let runner = WindowsProcessRunner::new(ComponentId::ActivityCollectorClaude);
    let run = |stores: &[PathBuf]| {
        claude::collect(
            &claude::ClaudeConfig {
                node_executable: &c.node_executable,
                ccusage_cli: &c.ccusage_cli,
                stores,
            },
            at,
            &runner,
            &Never,
        )
        .map_or(json!({"result": "cancelled"}), |a| outcome(&a))
    };
    let each: Vec<Value> = stores
        .iter()
        .enumerate()
        .map(|(i, store)| json!({"store": i, "outcome": run(std::slice::from_ref(store))}))
        .collect();
    println!(
        "{}",
        json!({"state": "probed", "stores": stores.len(), "each": each, "all": run(&stores)})
    );
}
