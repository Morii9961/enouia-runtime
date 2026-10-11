// Owned, finite development helper. No account, runner, task or store.
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn main() {
    let mode = std::env::args().nth(1).unwrap();
    let directory = std::env::args_os().nth(2).map(PathBuf::from);
    match mode.as_str() {
        "overview" | "preview" => {
            // Native acceptance replaces only its new sandbox package's
            // runner. The actual adapter supplies <command> --config <file>.
            let config = std::env::args_os().nth(3).map(PathBuf::from).unwrap();
            let package = config.parent().unwrap();
            let directory = package.join("native-pipe-control").join(&mode);
            if !directory.is_dir() { std::process::exit(9); }
            let mut process = Command::new(std::env::current_exe().unwrap());
            process.args([std::ffi::OsStr::new("hold-native"), directory.as_os_str()])
                .stdout(Stdio::inherit()).stderr(Stdio::null());
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                process.creation_flags(0x0800_0000);
            }
            let _child = process.spawn().unwrap();
            let deadline = Instant::now() + Duration::from_secs(3);
            while !directory.join("ready").exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
        "small" | "failure" => {
            std::io::stdout().write_all(b"{\"synthetic\":true}").unwrap();
            if mode == "failure" { std::process::exit(5); }
        }
        "exact" | "oversize" => {
            let length = 8 * 1024 * 1024 + usize::from(mode == "oversize");
            let _ = std::io::stdout().write_all(&vec![b'x'; length]);
        }
        "hold" | "hold-native" => {
            let directory = directory.unwrap();
            std::fs::write(directory.join("ready"), std::process::id().to_string()).unwrap();
            let deadline = Instant::now() + Duration::from_secs(if mode == "hold-native" { 45 } else { 5 });
            while !directory.join("release").exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
            std::fs::write(directory.join("done"), std::process::id().to_string()).unwrap();
        }
        "leaked" | "leaked-hanging" => {
            let directory = directory.unwrap();
            let mut process = Command::new(std::env::current_exe().unwrap());
            process.args([std::ffi::OsStr::new("hold"), directory.as_os_str()])
                .stdout(Stdio::inherit()).stderr(Stdio::null());
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                process.creation_flags(0x0800_0000);
            }
            let _child = process.spawn().unwrap();
            let deadline = Instant::now() + Duration::from_secs(2);
            while !directory.join("ready").exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            if mode == "leaked-hanging" { std::thread::sleep(Duration::from_secs(5)); }
        }
        "hang" => std::thread::sleep(Duration::from_secs(5)),
        _ => std::process::exit(9),
    }
}
