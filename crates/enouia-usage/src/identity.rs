//! Domain-separated HMAC-SHA256 identifiers. Raw source IDs never leave parsing.
use enouia_common::sha256_hex;

pub struct IdentityKey(pub(crate) [u8; 32]);
impl IdentityKey {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
    pub fn digest(&self, domain: &str, parts: &[&[u8]]) -> String {
        let mut message = Vec::new();
        for part in std::iter::once(domain.as_bytes()).chain(parts.iter().copied()) {
            message.extend_from_slice(&(part.len() as u64).to_be_bytes());
            message.extend_from_slice(part);
        }
        self.hmac(&message)
    }
    fn hmac(&self, message: &[u8]) -> String {
        let mut inner = [0x36_u8; 64];
        let mut outer = [0x5c_u8; 64];
        for i in 0..32 {
            inner[i] ^= self.0[i];
            outer[i] ^= self.0[i];
        }
        let mut bytes = inner.to_vec();
        bytes.extend_from_slice(message);
        let hashed = sha256_hex(&bytes);
        let mut bytes = outer.to_vec();
        for pair in hashed.as_bytes().as_chunks::<2>().0 {
            let digit = |n: u8| if n <= b'9' { n - b'0' } else { n - b'a' + 10 };
            bytes.push(digit(pair[0]) * 16 + digit(pair[1]));
        }
        sha256_hex(&bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::IdentityKey;
    #[test]
    fn hmac_reference_vector_and_domain_separation() {
        let mut bytes = [0_u8; 32];
        bytes[..20].fill(0x0b);
        let key = IdentityKey::from_bytes(bytes);
        assert_eq!(
            key.hmac(b"Hi There"),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        assert_ne!(
            key.digest("codex", &[b"a", b"bc"]),
            key.digest("codex", &[b"ab", b"c"])
        );
        assert_ne!(
            key.digest("codex", &[b"id"]),
            key.digest("claude", &[b"id"])
        );
    }
}
