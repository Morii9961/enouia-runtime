//! Durable Activity state belongs here, separate from Memory and collectors.

pub mod generation;

#[cfg(windows)]
mod lock;
#[cfg(windows)]
pub mod reader;
#[cfg(windows)]
pub mod writer;

#[cfg(windows)]
pub use lock::{ActivityLockGuard, WindowsActivityLock};
