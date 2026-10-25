use crate::{Error, Result};

pub fn date_days(value: &str) -> Result<i64> {
    let b = value.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || b.iter()
            .enumerate()
            .any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit())
    {
        return Err(Error::InvalidDate);
    }
    let y: i64 = value[0..4].parse().map_err(|_| Error::InvalidDate)?;
    let m: i64 = value[5..7].parse().map_err(|_| Error::InvalidDate)?;
    let d: i64 = value[8..10].parse().map_err(|_| Error::InvalidDate)?;
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let maximum = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    if !(2000..=2199).contains(&y) || d < 1 || d > maximum {
        return Err(Error::InvalidDate);
    }
    let y = y - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yo = y - era * 400;
    let mp = m + if m > 2 { -3 } else { 9 };
    Ok(era * 146097 + yo * 365 + yo / 4 - yo / 100 + (153 * mp + 2) / 5 + d - 1 - 719468)
}
pub fn format_day(days: i64) -> String {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}
/// Supported RFC3339 seconds/fraction, with an explicit offset. No guessed timezone.
pub fn timestamp(value: &str) -> Result<i64> {
    let b = value.as_bytes();
    if b.len() < 20 || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return Err(Error::InvalidDate);
    }
    let day = date_days(&value[..10])?;
    let number = |a: usize, z: usize| -> Result<i64> {
        if !b[a..z].iter().all(u8::is_ascii_digit) {
            return Err(Error::InvalidDate);
        }
        value[a..z].parse().map_err(|_| Error::InvalidDate)
    };
    let h = number(11, 13)?;
    let m = number(14, 16)?;
    let s = number(17, 19)?;
    if h > 23 || m > 59 || s > 59 {
        return Err(Error::InvalidDate);
    }
    let mut end = 19;
    if b.get(end) == Some(&b'.') {
        end += 1;
        let start = end;
        while b.get(end).is_some_and(u8::is_ascii_digit) {
            end += 1;
        }
        if end == start || end - start > 9 {
            return Err(Error::InvalidDate);
        }
    }
    let offset = match b.get(end) {
        Some(b'Z') if end + 1 == b.len() => 0,
        Some(sign @ (b'+' | b'-')) if end + 6 == b.len() && b[end + 3] == b':' => {
            let h = number(end + 1, end + 3)?;
            let m = number(end + 4, end + 6)?;
            if h > 23 || m > 59 {
                return Err(Error::InvalidDate);
            }
            (h * 3600 + m * 60) * if *sign == b'+' { 1 } else { -1 }
        }
        _ => return Err(Error::InvalidDate),
    };
    Ok(day * 86400 + h * 3600 + m * 60 + s - offset)
}
pub fn shanghai_day(value: &str) -> Result<String> {
    Ok(format_day((timestamp(value)? + 28800).div_euclid(86400)))
}
pub fn range(start: &str, end: &str) -> Result<Vec<String>> {
    let a = date_days(start)?;
    let b = date_days(end)?;
    if b <= a || b - a > 366 {
        return Err(Error::InvalidDate);
    }
    Ok((a..b).map(format_day).collect())
}
