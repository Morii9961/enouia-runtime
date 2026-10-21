//! Separate manual command namespace. Never invoked by Activity or desktop startup.
#[cfg(windows)]
fn run() -> enouia_usage::Result<serde_json::Value> {
    use enouia_usage::{
        Error,
        adapter::Source,
        export::NOTICE,
        scan::{Limits, Selection},
        store::Ledger,
    };
    use std::{path::PathBuf, sync::atomic::AtomicBool};
    let args = std::env::args_os()
        .skip(1)
        .map(|v| v.into_string().map_err(|_| Error::Unconfigured))
        .collect::<enouia_usage::Result<Vec<_>>>()?;
    let command = args
        .first()
        .map(String::as_str)
        .ok_or(Error::Unconfigured)?;
    if command == "help" {
        return Ok(
            serde_json::json!({"notice":NOTICE,"commands":["init LEDGER","health LEDGER SOURCE","scan LEDGER SOURCE ROOT... [--model PUBLIC_LABEL] [--deadline-seconds 1..600]","replay LEDGER SOURCE","candidates LEDGER SOURCE","inspect LEDGER SOURCE GROUP IDENTITY DIGEST","resolve LEDGER SOURCE GROUP IDENTITY DIGEST_OR_exclude","export LEDGER SOURCE START END_EXCLUSIVE NEW_OUTPUT_JSON"],"sources":["codex_local","claude_local"],"selection":"Each scan reads only explicitly supplied roots. No automatic source discovery.","date_coverage":"Legacy observations without proven request starts remain unallocated; daily zero is never inferred."}),
        );
    }
    let root = PathBuf::from(args.get(1).ok_or(Error::Unconfigured)?);
    if command == "init" {
        if args.len() != 2 {
            return Err(Error::Unconfigured);
        }
        let _ = Ledger::init(&root)?;
        return Ok(serde_json::json!({"state":"initialized","notice":NOTICE}));
    }
    let source = match args.get(2).map(String::as_str) {
        Some("codex_local") => Source::CodexLocal,
        Some("claude_local") => Source::ClaudeLocal,
        _ => return Err(Error::UnsupportedSource),
    };
    let mut ledger = Ledger::open(&root)?;
    let now = now()?;
    let health = match command {
        "health" if args.len() == 3 => ledger.health(source)?,
        "scan" => {
            let mut selection = Selection {
                source,
                roots: Vec::new(),
                models: Vec::new(),
                limits: Limits::default(),
            };
            let mut i = 3;
            while i < args.len() {
                match args[i].as_str() {
                    "--model" => {
                        i += 1;
                        selection
                            .models
                            .push(args.get(i).ok_or(Error::Unconfigured)?.clone());
                    }
                    "--deadline-seconds" => {
                        i += 1;
                        let seconds: u64 = args
                            .get(i)
                            .ok_or(Error::Unconfigured)?
                            .parse()
                            .map_err(|_| Error::Unconfigured)?;
                        if !(1..=600).contains(&seconds) {
                            return Err(Error::Unconfigured);
                        }
                        selection.limits.elapsed = std::time::Duration::from_secs(seconds);
                    }
                    flag if flag.starts_with("--") => return Err(Error::Unconfigured),
                    _ => selection.roots.push(PathBuf::from(&args[i])),
                }
                i += 1;
            }
            let r = ledger.scan(&selection, &now, &AtomicBool::new(false))?;
            return Ok(
                serde_json::json!({"notice":NOTICE,"health":r.health,"new_observations":r.new_observations,"duplicate_observations":r.duplicate_observations}),
            );
        }
        "replay" if args.len() == 3 => ledger.replay(source, &now)?,
        "candidates" if args.len() == 3 => {
            return Ok(
                serde_json::json!({"candidates":ledger.candidates(source,2000)?,"limit":2000,"notice":"Opaque group, identity, digest handles only. Review before selecting a correction."}),
            );
        }
        "resolve" if args.len() == 6 => ledger.resolve(
            source,
            &args[3],
            &args[4],
            if args[5] == "exclude" {
                None
            } else {
                Some(&args[5])
            },
            &now,
        )?,
        "inspect" if args.len() == 6 => {
            return Ok(
                serde_json::json!({"candidate":ledger.inspect(source,&args[3],&args[4],&args[5])?,"notice":"Private correction review: metering facts only. Select a digest explicitly after review."}),
            );
        }
        "export" if args.len() == 6 => {
            ledger.export_file(source, &args[3], &args[4], &now, &PathBuf::from(&args[5]))?
        }
        _ => return Err(Error::Unconfigured),
    };
    Ok(serde_json::json!({"notice":NOTICE,"health":health}))
}
#[cfg(windows)]
fn now() -> enouia_usage::Result<String> {
    let n = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| enouia_usage::Error::InvalidDate)?
        .as_secs();
    let day = enouia_usage::time::format_day((n / 86400) as i64);
    let s = n % 86400;
    Ok(format!(
        "{day}T{:02}:{:02}:{:02}Z",
        s / 3600,
        (s / 60) % 60,
        s % 60
    ))
}
fn main() {
    #[cfg(windows)]
    match run() {
        Ok(v) => println!("{v}"),
        Err(error) => {
            println!("{}", serde_json::json!({"error":error}));
            std::process::exit(1);
        }
    }
    #[cfg(not(windows))]
    {
        println!("{{\"error\":\"unsupported_platform\"}}");
        std::process::exit(1);
    }
}
