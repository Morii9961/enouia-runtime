//! Durable Activity state belongs here, separate from Memory and collectors.

pub mod generation;

#[cfg(windows)]
mod lock;

#[cfg(windows)]
pub use lock::WindowsActivityLock;
