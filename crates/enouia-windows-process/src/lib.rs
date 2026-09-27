//! Windows-only bounded process sessions. Domain protocols stay in their crates.

#[cfg(windows)]
mod session;

#[cfg(windows)]
pub use session::WindowsJsonLineSession;
