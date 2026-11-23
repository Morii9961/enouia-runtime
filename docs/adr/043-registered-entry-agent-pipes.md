# ADR-043 — Agent pipes in the registered entry

Date: 2026-11-23. Status: implemented for R4.3 gate D (D1b); activated on merge after synthetic verification. Requires pin ≥ Memory ADR-MEM-166. Completes ADR-041's "not yet in this slice".

Morii authorized gate D: Claude Code and Codex read the library through local MCP and may add notes, correction requests and forget requests (ADR-041 grants, ADR-042 queue). Memory provides the combined Agent protocol, enrollment, grant-backed permits and their renewal, the stop signal and the stdio bridge (ADR-MEM-161, 163, 165, 166). Runtime only listens and stops.

## Decision

- While the registered library is open, Runtime runs one listener per Agent named in its local `registered-agents.json`. The pipe name is `sha256("enouia-runtime-agent-pipe-1|vault|principal|automation-agent-v1")`, stable across restarts, so the Agent's MCP configuration never changes.
- On each connection Runtime reads the client process id, enrolls it with `memory:read` and `source:read`, builds a reader and the note, correction and forget writers under the Agent's active grant (permit valid at most five minutes, renewed in place by Memory), and serves `mcp::agent::native::serve_connection`. A revoked, inactive or expired grant refuses the connection. After a connection ends the listener creates a fresh pipe instance.
- Locking, exiting or a grant change (register, renew, update scope, revoke) stops the listeners through the stop flag within one 250 ms slice; grant changes then restart them for the current Agents.
- Runtime builds Memory's bridge (`mcp::bridge::run`) as its own `enouia-memory-mcp.exe` at the same pin. Settings shows, for each registered Agent, the Claude Code command and the Codex `config.toml` entry with the bridge path beside the running Runtime, the protocol, the pipe and the vault id, and says when the bridge is missing.
- Several sessions per Agent (amended 2026-11-23, Memory ADR-MEM-169): Runtime keeps four shared listening instances of each Agent's pipe name (`Pipe::listen_shared`, up to eight allowed), each serving one connection and then replaced, so up to four sessions of the same Agent are connected at once; the bridge waits up to five seconds when all are busy. Settings says so.

## Installation

Tauri's NSIS bundle installs every binary of the package, so the installer places `enouia-memory-mcp.exe` beside the installed Runtime and removes it on uninstall (the ownership template check still passes). Running the installer stays with Morii's acceptance (gate G); the candidate directory also carries the bridge next to the executable.

## Verification

Synthetic: a native test registers Claude Code on a Morii-layout fixture, connects through the real pipe with Memory's client, initializes, lists the read tools plus the three request tools, then locks and observes the connection end and the listener gone. A DOM fixture covers the configuration text; the registered native smoke runs the built bridge with the arguments Settings shows and lists the tools. Real library: connecting a real Agent follows the first real grant, which Morii confirms during acceptance.
