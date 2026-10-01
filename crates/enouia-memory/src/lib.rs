//! Pure Memory contracts and explicit review. No Activity, filesystem, index or provider access.
mod ledger;
mod record;

pub use ledger::*;
pub use record::*;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidationError {
    pub code: &'static str,
    pub field: &'static str,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.field)
    }
}
impl std::error::Error for ValidationError {}

pub(crate) fn require(
    ok: bool,
    code: &'static str,
    field: &'static str,
) -> Result<(), ValidationError> {
    if ok {
        Ok(())
    } else {
        Err(ValidationError { code, field })
    }
}

/// Fixed opaque identifier format; production allocation belongs to the Vault adapter.
pub fn valid_id(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|tail| {
        tail.len() == 32
            && tail
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IdKind {
    Memory,
    Source,
    Candidate,
    Session,
    Turn,
    Project,
}

/// Adapter must fill all 128 bits using OS cryptographic entropy, or fail.
pub trait IdEntropy {
    fn random_128(&mut self) -> Result<[u8; 16], ValidationError>;
}

pub fn allocate_id(kind: IdKind, entropy: &mut impl IdEntropy) -> Result<String, ValidationError> {
    let prefix = match kind {
        IdKind::Memory => "mem_",
        IdKind::Source => "src_",
        IdKind::Candidate => "cand_",
        IdKind::Session => "ses_",
        IdKind::Turn => "turn_",
        IdKind::Project => "prj_",
    };
    let bytes = entropy.random_128()?;
    let mut id = String::with_capacity(prefix.len() + 32);
    id.push_str(prefix);
    for byte in bytes {
        use std::fmt::Write;
        write!(&mut id, "{byte:02x}").expect("String formatting");
    }
    Ok(id)
}

/// Canonical UTC milliseconds, real Gregorian dates, years 0001..9999.
pub fn valid_timestamp(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 24
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return false;
    }
    let number = |start: usize, end: usize| -> Option<u32> {
        b[start..end].iter().try_fold(0, |n, digit| {
            digit
                .is_ascii_digit()
                .then(|| n * 10 + u32::from(digit - b'0'))
        })
    };
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second), Some(_)) = (
        number(0, 4),
        number(5, 7),
        number(8, 10),
        number(11, 13),
        number(14, 16),
        number(17, 19),
        number(20, 23),
    ) else {
        return false;
    };
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    year > 0 && day > 0 && day <= days && hour < 24 && minute < 60 && second < 60
}
