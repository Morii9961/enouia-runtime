#![cfg(windows)]

use enouia_activity_store::WindowsActivityLock;
use enouia_common::{ErrorCode, LockProvider};
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn test_root() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "enouia-activity-lock-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&root).unwrap();
    root
}

fn clean(root: &Path) {
    fs::remove_file(root.join("sync.lock")).unwrap();
    fs::remove_dir(root).unwrap();
}

#[test]
fn stale_file_is_not_a_lock_and_alias_paths_share_one_handle() {
    let root = test_root();
    let path = root.join("sync.lock");
    fs::write(&path, b"stale content is not ownership").unwrap();
    let provider = WindowsActivityLock;
    let guard = provider.try_acquire(&path).unwrap();
    let alias = root.join(".").join("sync.lock");
    assert_eq!(
        provider.try_acquire(&alias).err().unwrap().code,
        ErrorCode::Busy
    );
    drop(guard);
    let guard = provider.try_acquire(&alias).unwrap();
    drop(guard);
    clean(&root);
}

#[test]
fn separate_process_cannot_enter_until_the_owner_exits() {
    let root = test_root();
    let path = root.join("sync.lock");
    let mut child = Command::new(std::env::current_exe().unwrap())
        .arg("--exact")
        .arg("lock_holder_child")
        .arg("--nocapture")
        .env("ENOUIA_TEST_LOCK_PATH", &path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    loop {
        assert!(
            output.read_line(&mut line).unwrap() > 0,
            "lock holder exited before acquiring"
        );
        if line.contains("LOCKED") {
            break;
        }
        line.clear();
    }
    let provider = WindowsActivityLock;
    assert_eq!(
        provider.try_acquire(&path).err().unwrap().code,
        ErrorCode::Busy
    );
    child.kill().unwrap();
    child.wait().unwrap();
    let guard = provider.try_acquire(&path).unwrap();
    drop(guard);
    clean(&root);
}

#[test]
fn rejects_unmanaged_or_unavailable_paths() {
    let root = test_root();
    let provider = WindowsActivityLock;
    assert_eq!(
        provider
            .try_acquire(Path::new("sync.lock"))
            .err()
            .unwrap()
            .code,
        ErrorCode::Unconfigured
    );
    assert_eq!(
        provider
            .try_acquire(&root.join("other.lock"))
            .err()
            .unwrap()
            .code,
        ErrorCode::Unconfigured
    );
    assert_eq!(
        provider
            .try_acquire(&root.join("missing").join("sync.lock"))
            .err()
            .unwrap()
            .code,
        ErrorCode::StorageFailed
    );
    fs::write(root.join("sync.lock"), b"").unwrap();
    clean(&root);
}

#[test]
fn lock_holder_child() {
    let Ok(path) = std::env::var("ENOUIA_TEST_LOCK_PATH") else {
        return;
    };
    let _guard = WindowsActivityLock.try_acquire(Path::new(&path)).unwrap();
    println!("LOCKED");
    let mut byte = [0_u8];
    let _ = std::io::stdin().read_exact(&mut byte);
}
