//! Durable Activity state belongs here, separate from Memory and collectors.

#[cfg(windows)]
mod lock;

#[cfg(windows)]
pub use lock::WindowsActivityLock;
