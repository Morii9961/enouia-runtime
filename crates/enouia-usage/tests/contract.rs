use enouia_usage::{bounded_json, contract, count::Token, time};
use std::fs;
use std::path::PathBuf;

#[test]
fn both_frozen_dashboard_corpora_and_all_hashes() {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../contracts/usage/dashboard");
    let mut fixtures = 0;
    for version in ["1.0", "1.1"] {
        let root = base.join(version);
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(root.join("SHA256.json")).unwrap()).unwrap();
        for (name, hash) in manifest.as_object().unwrap() {
            let bytes = fs::read(root.join(name)).unwrap();
            assert_eq!(
                enouia_common::sha256_hex(&bytes),
                hash.as_str().unwrap(),
                "frozen file bytes changed"
            );
            if name.starts_with("fixtures/") {
                assert_eq!(
                    contract::parse(&bytes).is_ok(),
                    name.starts_with("fixtures/valid-"),
                    "fixture outcome: {name}"
                );
                fixtures += 1;
            }
        }
    }
    assert_eq!(fixtures, 39);
}

#[test]
fn decimal_arithmetic_and_bounds_do_not_round() {
    let a = Token::parse("9007199254740993").unwrap();
    let b = Token::from_u64(9);
    assert_eq!(a.add(&b).unwrap().as_str(), "9007199254741002");
    assert_eq!(a.add(&b).unwrap().sub(&a).unwrap(), b);
    assert!(Token::zero().sub(&b).is_err());
    assert!(Token::parse(&"9".repeat(78)).unwrap().add(&b).is_err());
    for bad in ["", "00", "+1", "1e3", "1.0", "-1"] {
        assert!(Token::parse(bad).is_err());
    }
    assert!(serde_json::from_str::<Token>("9007199254740993").is_err());
}

#[test]
fn midnight_and_calendar_offsets_are_explicit() {
    assert_eq!(
        time::shanghai_day("2030-02-03T15:59:59.999Z").unwrap(),
        "2030-02-03"
    );
    assert_eq!(
        time::shanghai_day("2030-02-03T16:00:00Z").unwrap(),
        "2030-02-04"
    );
    assert_eq!(
        time::shanghai_day("2030-02-04T00:00:00+08:00").unwrap(),
        "2030-02-04"
    );
    assert!(time::date_days("2100-02-29").is_err());
    assert!(time::date_days("2000-02-29").is_ok());
    for value in [
        "2030-02-03T16:00:00",
        "2030-02-03T25:00:00Z",
        "2030-02-30T01:00:00Z",
    ] {
        assert!(time::timestamp(value).is_err());
    }
    assert_eq!(
        time::range("2030-01-31", "2030-02-02").unwrap(),
        ["2030-01-31", "2030-02-01"]
    );
}

#[test]
fn hostile_transport_has_fixed_errors_before_dom_allocation() {
    assert!(bounded_json(&vec![b' '; 1024 * 1024 + 1], 1024 * 1024).is_err());
    assert!(
        bounded_json(
            format!("{}0{}", "[".repeat(33), "]".repeat(33)).as_bytes(),
            1024
        )
        .is_err()
    );
    assert!(contract::parse(b"{private malformed content}").is_err());
    assert!(contract::parse(&[0xff]).is_err());
}
