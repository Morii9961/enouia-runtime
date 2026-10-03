"""Build an isolated design probe of existing pure Rust models, offline."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "target/design-probes/canonical-history-v1"
MARKER = "Enouia inert canonical-history design probe v1\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cargo", help="Installed Cargo binary; no installation or download")
    args = parser.parse_args()
    cargo = args.cargo or shutil.which("cargo")
    if not cargo:
        raise SystemExit("Cargo unavailable: pass --cargo with an installed binary")
    # Generated source/build products stay under the ignored, known target tree.
    if not BUILD.resolve().is_relative_to((ROOT / "target").resolve()) or not BUILD.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit("design build path escaped target")
    marker = BUILD / "design-probe.txt"
    if BUILD.exists() and (not marker.is_file() or marker.read_text(encoding="utf-8") != MARKER):
        raise SystemExit("refusing an unmarked existing build directory")
    BUILD.mkdir(parents=True, exist_ok=True)
    for name in ("design-probe.txt", "src", "src/main.rs", "Cargo.toml"):
        if not (BUILD / name).resolve().is_relative_to(BUILD.resolve()):
            raise SystemExit("generated design file escaped build directory")
    marker.write_text(MARKER, encoding="utf-8", newline="\n")
    (BUILD / "src").mkdir(exist_ok=True)
    manifest = f'''[package]
name = "enouia-canonical-history-design-probe"
version = "0.0.0"
edition = "2024"
publish = false

[workspace]

[dependencies]
enouia-memory = {{ path = "{(ROOT / 'crates/enouia-memory').as_posix()}" }}
enouia-session = {{ path = "{(ROOT / 'crates/enouia-session').as_posix()}" }}
serde = {{ version = "=1.0.229", features = ["derive"] }}
serde_json = "=1.0.151"

[profile.dev]
debug = false
'''
    (BUILD / "Cargo.toml").write_text(manifest, encoding="utf-8", newline="\n")
    shutil.copyfile(ROOT / "scripts/design/canonical-history-v1.rs", BUILD / "src/main.rs")
    subprocess.run([cargo, "run", "--offline", "--manifest-path", str(BUILD / "Cargo.toml"),
                    "--target-dir", str(ROOT / "target/design-probes/build"), "--",
                    str(ROOT / "tests/fixtures/backend/canonical-history-v1.json")], cwd=ROOT,
                   env=os.environ.copy(), check=True)


if __name__ == "__main__":
    main()
