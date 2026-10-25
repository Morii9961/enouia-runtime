use crate::{Error, Result};
use serde::{Deserialize, Deserializer, Serialize};
use std::cmp::Ordering;
use std::collections::BTreeMap;

/// Protocol decimal, at most 78 digits. Arithmetic never passes through f64.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct Token(String);

impl Token {
    pub fn parse(value: &str) -> Result<Self> {
        if value.is_empty()
            || value.len() > 78
            || !value.bytes().all(|b| b.is_ascii_digit())
            || (value.len() > 1 && value.starts_with('0'))
        {
            return Err(Error::InvalidCounts);
        }
        Ok(Self(value.to_owned()))
    }
    pub fn zero() -> Self {
        Self("0".into())
    }
    pub fn from_u64(value: u64) -> Self {
        Self(value.to_string())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn is_zero(&self) -> bool {
        self.0 == "0"
    }
    pub fn add(&self, other: &Self) -> Result<Self> {
        let a = self.0.as_bytes();
        let b = other.0.as_bytes();
        let mut out = Vec::with_capacity(a.len().max(b.len()) + 1);
        let mut carry = 0;
        for i in 0..a.len().max(b.len()) {
            let digit = a.len().checked_sub(i + 1).map_or(0, |j| a[j] - b'0')
                + b.len().checked_sub(i + 1).map_or(0, |j| b[j] - b'0')
                + carry;
            out.push(b'0' + digit % 10);
            carry = digit / 10;
        }
        if carry != 0 {
            out.push(b'0' + carry);
        }
        if out.len() > 78 {
            return Err(Error::Overflow);
        }
        out.reverse();
        Ok(Self(
            String::from_utf8(out).map_err(|_| Error::InvalidCounts)?,
        ))
    }
    pub fn sub(&self, other: &Self) -> Result<Self> {
        if self < other {
            return Err(Error::InvalidCounts);
        }
        let a = self.0.as_bytes();
        let b = other.0.as_bytes();
        let mut out = Vec::with_capacity(a.len());
        let mut borrow = 0_i16;
        for i in 0..a.len() {
            let mut digit = i16::from(a[a.len() - i - 1] - b'0')
                - borrow
                - b.len()
                    .checked_sub(i + 1)
                    .map_or(0, |j| i16::from(b[j] - b'0'));
            borrow = i16::from(digit < 0);
            if digit < 0 {
                digit += 10;
            }
            out.push(b'0' + digit as u8);
        }
        while out.len() > 1 && out.last() == Some(&b'0') {
            out.pop();
        }
        out.reverse();
        Ok(Self(
            String::from_utf8(out).map_err(|_| Error::InvalidCounts)?,
        ))
    }
}
impl Ord for Token {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0
            .len()
            .cmp(&other.0.len())
            .then_with(|| self.0.cmp(&other.0))
    }
}
impl PartialOrd for Token {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl<'de> Deserialize<'de> for Token {
    fn deserialize<D: Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let value = String::deserialize(d)?;
        Self::parse(&value).map_err(|_| serde::de::Error::custom("invalid_count"))
    }
}

pub const INPUT_KEYS: [&str; 6] = [
    "input_uncached",
    "input_cache_read",
    "input_cache_write_5m",
    "input_cache_write_1h",
    "input_cache_write_30m",
    "input_cache_write_unknown",
];
pub const COUNT_KEYS: [&str; 9] = [
    "input_total",
    "input_uncached",
    "input_cache_read",
    "input_cache_write_5m",
    "input_cache_write_1h",
    "input_cache_write_30m",
    "input_cache_write_unknown",
    "output_total",
    "output_reasoning_subset",
];
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Counts(pub BTreeMap<String, Option<Token>>);
impl Default for Counts {
    fn default() -> Self {
        Self(COUNT_KEYS.map(|k| (k.to_owned(), None)).into())
    }
}
impl Counts {
    pub fn get(&self, key: &str) -> Option<&Token> {
        self.0.get(key).and_then(Option::as_ref)
    }
    pub fn set(&mut self, key: &str, value: Option<Token>) {
        self.0.insert(key.to_owned(), value);
    }
    pub fn validate(&self) -> Result<()> {
        if self.0.len() != COUNT_KEYS.len() || COUNT_KEYS.iter().any(|k| !self.0.contains_key(*k)) {
            return Err(Error::InvalidCounts);
        }
        if let Some(total) = self.get("input_total") {
            let mut sum = Token::zero();
            let mut complete = true;
            for key in INPUT_KEYS {
                if let Some(n) = self.get(key) {
                    sum = sum.add(n)?;
                } else {
                    complete = false;
                }
            }
            if &sum > total || (complete && &sum != total) {
                return Err(Error::InvalidCounts);
            }
        }
        if let (Some(output), Some(reasoning)) = (
            self.get("output_total"),
            self.get("output_reasoning_subset"),
        ) && reasoning > output
        {
            return Err(Error::InvalidCounts);
        }
        Ok(())
    }
    /// Unknown propagates; a known subtotal is never promoted to a complete sum.
    pub fn add(&self, other: &Self) -> Result<Self> {
        let mut result = Self::default();
        for key in COUNT_KEYS {
            result.set(
                key,
                match (self.get(key), other.get(key)) {
                    (Some(a), Some(b)) => Some(a.add(b)?),
                    _ => None,
                },
            );
        }
        result.validate()?;
        Ok(result)
    }
}
