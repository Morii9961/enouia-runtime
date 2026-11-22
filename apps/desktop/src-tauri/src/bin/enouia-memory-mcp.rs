//! ADR-043: Runtime's copy of Memory's stdio bridge (ADR-MEM-166), built at the
//! pinned revision and shipped beside the desktop executable. Claude Code or
//! Codex start it from their MCP configuration; it connects to the Agent's pipe.
fn main() {
    if enouia_memory_host::mcp::bridge::run(std::env::args_os().skip(1)).is_err() {
        eprintln!("agent_launch_or_transport_failed");
        std::process::exit(2);
    }
}
