//! Windows-only bounded process execution. Domain protocols stay in their crates.

#[cfg(windows)]
mod cowork;
#[cfg(windows)]
mod job;
#[cfg(windows)]
mod runner;
#[cfg(windows)]
mod session;

#[cfg(windows)]
pub use cowork::discover_claude_stores;
#[cfg(windows)]
pub use runner::WindowsProcessRunner;
#[cfg(windows)]
pub use session::WindowsJsonLineSession;
