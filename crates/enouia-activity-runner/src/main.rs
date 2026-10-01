// Scheduled release runs must not allocate a console. Redirected stdout remains
// the CLI's JSON channel; debug test binaries retain their ordinary console.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    use std::io::Write;
    let args = std::env::args_os().skip(1).collect::<Vec<_>>();
    let (code, output) = enouia_activity_runner::cli::invoke(&args);
    let mut bytes = match serde_json::to_vec(&output) {
        Ok(bytes) => bytes,
        Err(_) => return std::process::ExitCode::from(6),
    };
    bytes.push(b'\n');
    if std::io::stdout().lock().write_all(&bytes).is_err() {
        return std::process::ExitCode::from(6);
    }
    std::process::ExitCode::from(code)
}

#[cfg(not(windows))]
fn main() -> std::process::ExitCode {
    println!("{{\"schemaVersion\":1,\"state\":\"unsupported_platform\",\"exitCode\":5}}");
    std::process::ExitCode::from(5)
}
