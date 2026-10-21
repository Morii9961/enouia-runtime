//! Private usage facts. No Activity state, Memory, network, or scheduler dependency.
pub mod adapter;
pub mod contract;
pub mod count;
#[cfg(windows)]
pub mod export;
pub mod identity;
#[cfg(windows)]
pub mod safety;
#[cfg(windows)]
pub mod scan;
#[cfg(windows)]
pub mod store;
pub mod time;

use serde::{Deserialize, Serialize};

/// Only fixed codes cross an error boundary; never format source or SQL errors.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Error {
    InvalidJson,
    InvalidSchema,
    InvalidCounts,
    CounterReset,
    InvalidDate,
    Overflow,
    UnsupportedSource,
    Conflict,
    UnsafePath,
    BudgetExceeded,
    Cancelled,
    Busy,
    StorageFailed,
    Unconfigured,
}

pub type Result<T> = std::result::Result<T, Error>;

/// Enforce the byte/depth budgets before allocating a JSON DOM. No input echo.
pub fn bounded_json(bytes: &[u8], limit: usize) -> Result<serde_json::Value> {
    if bytes.len() > limit {
        return Err(Error::BudgetExceeded);
    }
    let mut depth = 0_u32;
    let mut quoted = false;
    let mut escaped = false;
    for &byte in bytes {
        if quoted {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                quoted = false;
            }
        } else if byte == b'"' {
            quoted = true;
        } else if byte == b'{' || byte == b'[' {
            depth += 1;
            if depth > 32 {
                return Err(Error::BudgetExceeded);
            }
        } else if byte == b'}' || byte == b']' {
            depth = depth.checked_sub(1).ok_or(Error::InvalidJson)?;
        }
    }
    serde_json::from_slice(bytes).map_err(|_| Error::InvalidJson)
}
