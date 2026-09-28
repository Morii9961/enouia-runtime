//! Restricted transport of a committed Activity pending batch.

#[cfg(windows)]
pub mod acknowledgment;
#[cfg(windows)]
pub mod curl_fetch;
pub mod observation;
#[cfg(windows)]
pub mod public_fetch;

#[cfg(windows)]
pub mod ssh;
