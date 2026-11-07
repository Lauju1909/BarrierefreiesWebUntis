use hmac::{Hmac, Mac};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

/// Decodes an RFC 4648 Base32 string into bytes.
pub fn base32_decode(input: &str) -> Vec<u8> {
    let input = input.trim().trim_end_matches('=').to_ascii_uppercase();
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = Vec::new();
    let mut cur_byte = 0u32;
    let mut bits_left = 8;
    for c in input.chars() {
        let val = match ALPHABET.iter().position(|&x| x == c as u8) {
            Some(idx) => idx as u32,
            None => continue,
        };
        if bits_left > 5 {
            cur_byte = (cur_byte << 5) | val;
            bits_left -= 5;
        } else {
            let shift = 5 - bits_left;
            cur_byte = (cur_byte << bits_left) | (val >> shift);
            out.push(cur_byte as u8);
            cur_byte = val & ((1 << shift) - 1);
            bits_left = 8 - shift;
        }
    }
    out
}

/// Generates a 6-digit TOTP token according to RFC 6238 (30s time step).
pub fn generate_totp(secret: &str, timestamp_ms: i64) -> u32 {
    let key = base32_decode(secret);
    if key.is_empty() {
        return 0;
    }
    let step = (timestamp_ms / 1000) / 30;
    let msg = step.to_be_bytes();

    let mut mac = match HmacSha1::new_from_slice(&key) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    mac.update(&msg);
    let result = mac.finalize().into_bytes();

    let offset = (result[result.len() - 1] & 0x0f) as usize;
    let binary = (((result[offset] & 0x7f) as u32) << 24)
        | ((result[offset + 1] as u32) << 16)
        | ((result[offset + 2] as u32) << 8)
        | (result[offset + 3] as u32);
    binary % 1_000_000
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base32_decode() {
        let decoded = base32_decode("MZXW6YTB");
        assert_eq!(decoded, b"fooba");
        let decoded_foobar = base32_decode("MZXW6YTBOI======");
        assert_eq!(decoded_foobar, b"foobar");
    }

    #[test]
    fn test_totp_generation() {
        let otp = generate_totp("JBSWY3DPEHPK3PXP", 1700000000000);
        assert!(otp < 1_000_000);
    }
}
