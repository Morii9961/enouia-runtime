"""Offline isolated Context/Mock composition; no Runtime handler or Vault."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "target/design-probes/mock-continuity-v1"
MARKER = "Enouia inert pure Mock continuity design probe v1\n"


def require(condition, label):
    if not condition:
        raise ValueError(label)


def verify_bytes():
    corpus = json.loads((ROOT / "tests/fixtures/backend/mock-continuity-v1.json").read_text(encoding="utf-8"))
    vectors = json.loads((ROOT / "tests/fixtures/backend/mock-continuity-bytes-v1.json").read_text(encoding="utf-8"))
    require(set(vectors) == {"schema_version", "evidence", "objects"} and type(vectors["schema_version"]) is int and vectors["schema_version"] == 1, "byte envelope")
    require(vectors["evidence"] == "synthetic_pure_mock_exact_bytes", "byte evidence")
    frames = {}
    hashes = {}
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate byte-frame key")
            result[key] = value
        return result
    for item in vectors["objects"]:
        require(set(item) == {"kind", "base64", "byte_length", "sha256"}, "byte fields")
        kind = item["kind"]
        require(kind in {"capsule", "request", "response"} and kind not in frames, "byte identity")
        raw = base64.b64decode(item["base64"], validate=True)
        require(base64.b64encode(raw).decode("ascii") == item["base64"], "base64 canonical")
        require(type(item["byte_length"]) is int and len(raw) == item["byte_length"], "byte length")
        sha = hashlib.sha256(raw).hexdigest()
        require(sha == item["sha256"], "Python byte hash")
        require(raw == corpus["expected"][kind + "_bytes"].encode("utf-8"), "frozen typed Rust bytes")
        require(not raw.startswith(b"\xef\xbb\xbf") and raw.endswith(b"\n") == (kind != "capsule"), "frame BOM/LF")
        frame = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)
        compact = json.dumps(frame, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        require(raw == compact + (b"\n" if kind != "capsule" else b""), "selected compact bytes")
        frames[kind], hashes[kind] = frame, sha
    require(set(frames) == {"capsule", "request", "response"}, "three byte frames")
    capsule, request, response = (frames[k] for k in ("capsule", "request", "response"))
    require(request["capsule"] == capsule and response["capsule_id"] == capsule["capsule_id"] and response["request_id"] == request["request_id"], "request/capsule/response identity")
    require(response["consumed_capsule_sha256"] == hashes["capsule"], "Rust/Python consumed SHA parity")
    length = next(i["byte_length"] for i in vectors["objects"] if i["kind"] == "capsule")
    require(response["consumed_bytes"] == length and capsule["budget"]["estimated_tokens"] == length + 256 <= capsule["budget"]["max_tokens"] <= 32768, "consumption/budget")
    print(f"PASS DESIGN byte bindings: 3 exact frames; {length}-byte no-LF capsule; independent Python/Rust SHA/length agreement")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cargo", help="Installed Cargo path; no downloads")
    parser.add_argument("--emit-data", action="store_true", help="Authoring only: emit inert output under target, without claiming frozen equality")
    args = parser.parse_args()
    cargo = args.cargo or shutil.which("cargo")
    if not cargo:
        raise SystemExit("Cargo unavailable: pass an installed binary with --cargo")
    # The input domain history is independently replayed before its final model
    # becomes the starting point for this selected composition.
    subprocess.run([sys.executable, str(ROOT / "scripts/check-canonical-history-design.py"), "--cargo", cargo], cwd=ROOT, check=True)
    if not BUILD.resolve().is_relative_to((ROOT / "target").resolve()) or not BUILD.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit("design build escaped target")
    marker = BUILD / "design-probe.txt"
    if BUILD.exists() and (not marker.is_file() or marker.read_text(encoding="utf-8") != MARKER):
        raise SystemExit("refusing unmarked build directory")
    BUILD.mkdir(parents=True, exist_ok=True)
    for name in ("design-probe.txt", "src", "src/main.rs", "Cargo.toml", "output-v1.json"):
        if not (BUILD / name).resolve().is_relative_to(BUILD.resolve()):
            raise SystemExit("generated file escaped design build")
    marker.write_text(MARKER, encoding="utf-8", newline="\n")
    (BUILD / "src").mkdir(exist_ok=True)
    paths = "\n".join(f'{name} = {{ path = "{(ROOT / "crates" / name).as_posix()}" }}' for name in
                      ("enouia-memory", "enouia-session", "enouia-context", "enouia-provider", "enouia-common"))
    manifest = f'''[package]
name = "enouia-mock-continuity-design-probe"
version = "0.0.0"
edition = "2024"
publish = false

[workspace]

[dependencies]
{paths}
serde = {{ version = "=1.0.229", features = ["derive"] }}
serde_json = "=1.0.151"

[profile.dev]
debug = false
'''
    (BUILD / "Cargo.toml").write_text(manifest, encoding="utf-8", newline="\n")
    shutil.copyfile(ROOT / "scripts/design/mock-continuity-v1.rs", BUILD / "src/main.rs")
    command = [cargo, "run", "--offline", "--manifest-path", str(BUILD / "Cargo.toml"), "--target-dir",
               str(ROOT / "target/design-probes/build"), "--", str(ROOT / "tests/fixtures/backend/mock-continuity-v1.json"),
               str(ROOT / "tests/fixtures/backend/canonical-history-v1.json")]
    if args.emit_data:
        command.append(str(BUILD / "output-v1.json"))
    subprocess.run(command, cwd=ROOT, env=os.environ.copy(), check=True)
    if not args.emit_data:
        verify_bytes()


if __name__ == "__main__":
    main()
