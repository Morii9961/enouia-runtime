//! Windows-local Claude/Cowork store inventory, without reading transcripts.

use crate::job::error;
use enouia_common::{ComponentId, ErrorCode, StructuredError};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File, Metadata};
use std::io;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 6;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
const COMPONENT: ComponentId = ComponentId::ActivityCollectorClaude;
const STORE_NAMES: [&str; 2] = ["local-agent-mode-sessions", "claude-code-sessions"];

fn invalid() -> StructuredError {
    error(ErrorCode::SourceInvalid, COMPONENT)
}

fn is_reparse(metadata: &Metadata) -> bool {
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

fn optional_directory(path: &Path) -> Result<bool, StructuredError> {
    match fs::symlink_metadata(path) {
        Err(failure) if failure.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(invalid()),
        Ok(metadata) if metadata.is_dir() && !is_reparse(&metadata) => Ok(true),
        Ok(_) => Err(invalid()),
    }
}

fn key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

fn insert_store(found: &mut BTreeMap<String, PathBuf>, path: &Path) -> Result<(), StructuredError> {
    let canonical = fs::canonicalize(path).map_err(|_| invalid())?;
    let metadata = fs::metadata(&canonical).map_err(|_| invalid())?;
    if !metadata.is_dir() {
        return Err(invalid());
    }
    found.entry(key(&canonical)).or_insert(canonical);
    Ok(())
}

fn has_transcript(store: &Path) -> Result<bool, StructuredError> {
    let projects = store.join("projects");
    if !optional_directory(&projects)? {
        return Ok(false);
    }
    let mut found = false;
    for project in fs::read_dir(projects).map_err(|_| invalid())? {
        let project = project.map_err(|_| invalid())?;
        let metadata = fs::symlink_metadata(project.path()).map_err(|_| invalid())?;
        if is_reparse(&metadata) {
            return Err(invalid());
        }
        if !metadata.is_dir() {
            continue;
        }
        for transcript in fs::read_dir(project.path()).map_err(|_| invalid())? {
            let transcript = transcript.map_err(|_| invalid())?;
            let metadata = fs::symlink_metadata(transcript.path()).map_err(|_| invalid())?;
            if is_reparse(&metadata) {
                return Err(invalid());
            }
            if metadata.is_file()
                && transcript
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "jsonl")
            {
                // Open only to distinguish a readable store from one whose
                // transcript names can be listed but files cannot be used.
                File::open(transcript.path()).map_err(|_| invalid())?;
                found = true;
            }
        }
    }
    Ok(found)
}

fn visit_root(root: &Path, found: &mut BTreeMap<String, PathBuf>) -> Result<(), StructuredError> {
    if !optional_directory(root)? {
        return Ok(());
    }
    let mut stack = vec![(root.to_path_buf(), 0_usize)];
    while let Some((directory, depth)) = stack.pop() {
        for entry in fs::read_dir(directory).map_err(|_| invalid())? {
            let entry = entry.map_err(|_| invalid())?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(|_| invalid())?;
            if is_reparse(&metadata) {
                return Err(invalid());
            }
            if !metadata.is_dir() {
                continue;
            }
            if entry.file_name() == ".claude" {
                if has_transcript(&path)? {
                    insert_store(found, &path)?;
                }
            } else if depth == MAX_DEPTH {
                return Err(invalid());
            } else {
                stack.push((path, depth + 1));
            }
        }
    }
    Ok(())
}

fn package_name_matches(name: &str) -> bool {
    name.strip_prefix("Claude_").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
    })
}

/// Discover the normal Claude store followed by distinct local Cowork task
/// stores. Optional roaming/package roots may be absent; readable roots must
/// be traversed completely. Prior expected stores disappearing is an error.
/// The caller supplies Windows profile roots instead of relying on a workdir.
pub fn discover_claude_stores(
    normal_store: &Path,
    roaming_claude: &Path,
    local_packages: &Path,
    expected_stores: &[PathBuf],
) -> Result<Vec<PathBuf>, StructuredError> {
    if !normal_store.is_absolute() || !roaming_claude.is_absolute() || !local_packages.is_absolute()
    {
        return Err(error(ErrorCode::Unconfigured, COMPONENT));
    }
    let mut found = BTreeMap::new();
    insert_store(&mut found, normal_store)?;
    let normal = found.values().next().cloned().ok_or_else(invalid)?;
    for name in STORE_NAMES {
        visit_root(&roaming_claude.join(name), &mut found)?;
    }
    if optional_directory(local_packages)? {
        for package in fs::read_dir(local_packages).map_err(|_| invalid())? {
            let package = package.map_err(|_| invalid())?;
            let name = package.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if !package_name_matches(name) {
                continue;
            }
            if !optional_directory(&package.path())? {
                return Err(invalid());
            }
            let base = package.path().join("LocalCache/Roaming/Claude");
            for store in STORE_NAMES {
                visit_root(&base.join(store), &mut found)?;
            }
        }
    }
    let found_keys: HashSet<String> = found.keys().cloned().collect();
    for expected in expected_stores {
        let canonical = fs::canonicalize(expected).map_err(|_| invalid())?;
        if !found_keys.contains(&key(&canonical)) {
            return Err(invalid());
        }
    }
    let mut stores = vec![normal.clone()];
    stores.extend(found.into_values().filter(|path| key(path) != key(&normal)));
    Ok(stores)
}
