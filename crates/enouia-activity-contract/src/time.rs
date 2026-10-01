//! Deterministic ISO date/time parsing for the v1 wire boundary.

pub fn date_parts(value: &str) -> Option<(i64, u32, u32)> {
    let b = value.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let year = digits(&b[..4])? as i64;
    let month = digits(&b[5..7])?;
    let day = digits(&b[8..10])?;
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => return None,
    };
    (day >= 1 && day <= max_day).then_some((year, month, day))
}

fn digits(b: &[u8]) -> Option<u32> {
    b.iter().try_fold(0_u32, |n, c| {
        c.is_ascii_digit().then(|| n * 10 + u32::from(c - b'0'))
    })
}

// Proleptic Gregorian days since 1970-01-01; valid for year 0000..9999.
fn days_since_epoch(year: i64, month: u32, day: u32) -> i64 {
    let y = year - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = i64::from(month) + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + i64::from(day) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Convert a Unix instant to the same UTC+08 calendar label as Asia/Shanghai
/// for the modern Activity acquisition window. Dates outside the wire format
/// are rejected rather than wrapped or fabricated.
pub fn shanghai_date(unix_ms: i64) -> Option<String> {
    let shifted = unix_ms.checked_add(8 * 3_600_000)?;
    calendar_date(shifted)
}

fn calendar_date(unix_ms: i64) -> Option<String> {
    let z = unix_ms.div_euclid(86_400_000).checked_add(719_468)?;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (0..=9999)
        .contains(&year)
        .then(|| format!("{year:04}-{month:02}-{day:02}"))
}

/// Exact UTC wire form, with no dependency on the host's local timezone.
pub fn format_utc_millis(unix_ms: i64) -> Option<String> {
    let date = calendar_date(unix_ms)?;
    let time = unix_ms.rem_euclid(86_400_000);
    Some(format!(
        "{date}T{:02}:{:02}:{:02}.{:03}Z",
        time / 3_600_000,
        time / 60_000 % 60,
        time / 1_000 % 60,
        time % 1_000
    ))
}

/// Accepts date-only ISO or an ISO timestamp with an explicit UTC offset.
/// Local-zone strings are intentionally excluded because they are ambiguous across machines.
pub fn parse_timestamp(value: &str) -> Option<i64> {
    let b = value.as_bytes();
    let (year, month, day) = date_parts(value.get(..10)?)?;
    let base = days_since_epoch(year, month, day) * 86_400_000;
    if b.len() == 10 {
        return Some(base);
    }
    if b.len() < 17 || b[10] != b'T' || b[13] != b':' {
        return None;
    }
    let hour = digits(&b[11..13])?;
    let minute = digits(&b[14..16])?;
    if hour > 23 || minute > 59 {
        return None;
    }
    let mut index = 16;
    let mut second = 0;
    let mut millis = 0;
    if b.get(index) == Some(&b':') {
        second = digits(b.get(index + 1..index + 3)?)?;
        if second > 59 {
            return None;
        }
        index += 3;
        if b.get(index) == Some(&b'.') {
            index += 1;
            let start = index;
            while b.get(index).is_some_and(u8::is_ascii_digit) {
                if index - start < 3 {
                    millis = millis * 10 + u32::from(b[index] - b'0');
                }
                index += 1;
            }
            if index == start {
                return None;
            }
            for _ in 0..3_usize.saturating_sub((index - start).min(3)) {
                millis *= 10;
            }
        }
    }
    let offset_minutes = match b.get(index)? {
        b'Z' if index + 1 == b.len() => 0_i64,
        sign @ (b'+' | b'-') if index + 6 == b.len() && b[index + 3] == b':' => {
            let oh = digits(&b[index + 1..index + 3])?;
            let om = digits(&b[index + 4..index + 6])?;
            if oh > 23 || om > 59 {
                return None;
            }
            let minutes = i64::from(oh * 60 + om);
            if *sign == b'+' { minutes } else { -minutes }
        }
        _ => return None,
    };
    Some(
        base + i64::from(hour * 3_600_000 + minute * 60_000 + second * 1_000 + millis)
            - offset_minutes * 60_000,
    )
}

/// Moriium's `new Date(value).toISOString() === value` wire form.
pub fn exact_utc_millis(value: &str) -> Option<i64> {
    let b = value.as_bytes();
    if b.len() != 24 || b[19] != b'.' || b[23] != b'Z' {
        return None;
    }
    digits(&b[20..23])?;
    parse_timestamp(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formatting_round_trips_across_epoch_leap_and_year_boundaries() {
        for time in [
            "0000-01-01T00:00:00.000Z",
            "1969-12-31T23:59:59.999Z",
            "1970-01-01T00:00:00.000Z",
            "2000-02-29T23:59:59.123Z",
            "2026-09-30T16:00:00.001Z",
            "9999-12-31T23:59:59.999Z",
        ] {
            assert_eq!(
                format_utc_millis(exact_utc_millis(time).unwrap()).as_deref(),
                Some(time)
            );
        }
        assert!(format_utc_millis(i64::MAX).is_none());
        assert!(format_utc_millis(i64::MIN).is_none());
    }

    #[test]
    fn dates_are_real_and_offsets_compare_as_instants() {
        assert!(date_parts("2028-02-29").is_some());
        assert!(date_parts("2027-02-29").is_none());
        assert!(date_parts("1900-02-29").is_none());
        assert!(date_parts("2000-02-29").is_some());
        assert_eq!(parse_timestamp("1970-01-01"), Some(0));
        assert_eq!(parse_timestamp("1970-01-01T08:00:00.000+08:00"), Some(0));
        assert_eq!(parse_timestamp("1970-01-01T00:00:00.000Z"), Some(0));
        assert!(parse_timestamp("2026-09-26T08:00:00").is_none());
        assert!(exact_utc_millis("2026-09-26T08:00:00+00:00").is_none());
        assert_eq!(shanghai_date(-8 * 3_600_000), Some("1970-01-01".to_owned()));
        assert_eq!(shanghai_date(0), Some("1970-01-01".to_owned()));
        assert_eq!(shanghai_date(16 * 3_600_000), Some("1970-01-02".to_owned()));
        assert_eq!(
            shanghai_date(1_790_409_600_000),
            Some("2026-09-26".to_owned())
        );
    }
}
