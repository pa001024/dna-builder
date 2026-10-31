use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use sha1::{Digest as _, Sha1};
use sha2::Sha256;

use crate::error::MiHomeError;

/// RC4-KSA + PRGA with the first `discard` keystream bytes dropped.
fn rc4_crypt(key: &[u8], data: &[u8], discard: usize) -> Vec<u8> {
    let mut s = [0u8; 256];
    for (i, slot) in s.iter_mut().enumerate() {
        *slot = i as u8;
    }
    let mut j: u8 = 0;
    for i in 0..256 {
        j = j.wrapping_add(s[i]).wrapping_add(key[i % key.len()]);
        s.swap(i, j as usize);
    }
    let mut i: u8 = 0;
    j = 0;
    let mut out = Vec::with_capacity(data.len());
    let mut skip = discard;
    // Interleave discard + data so a single PRGA pass covers both.
    let total = discard + data.len();
    let mut data_idx = 0;
    for _ in 0..total {
        i = i.wrapping_add(1);
        j = j.wrapping_add(s[i as usize]);
        s.swap(i as usize, j as usize);
        let k = s[(s[i as usize].wrapping_add(s[j as usize])) as usize];
        if skip > 0 {
            skip -= 1;
        } else {
            out.push(data[data_idx] ^ k);
            data_idx += 1;
        }
    }
    out
}

fn b64decode(input: &str) -> Result<Vec<u8>, MiHomeError> {
    B64.decode(input)
        .map_err(|e| MiHomeError::Crypto(e.to_string()))
}

pub fn gen_nonce() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    // Mirror `(getrandbits(64) - 2**63)` as an i64, then 8-byte big-endian.
    let rand_part = rand::random::<u64>().wrapping_sub(1 << 63) as i64;
    let mut b = rand_part.to_be_bytes().to_vec();
    // `part2 = millis // 60000` as minimal big-endian bytes.
    let part2 = millis / 60000;
    let full = part2.to_be_bytes();
    let first = full.iter().position(|&x| x != 0).unwrap_or(7);
    b.extend_from_slice(&full[first..]);
    B64.encode(&b)
}

pub fn signed_nonce(ssecret_b64: &str, nonce_b64: &str) -> Result<String, MiHomeError> {
    let mut h = Sha256::new();
    h.update(b64decode(ssecret_b64)?);
    h.update(b64decode(nonce_b64)?);
    Ok(B64.encode(h.finalize()))
}

/// `params` must be in insertion order (we use a `Vec` of pairs at call sites
/// or a `serde_json::Map`, which preserves insertion order).
pub fn enc_signature(
    uri: &str,
    method: &str,
    signed_nonce: &str,
    params: &[(String, String)],
) -> String {
    let mut parts = Vec::with_capacity(params.len() + 3);
    parts.push(method.to_uppercase());
    parts.push(uri.to_string());
    for (k, v) in params {
        parts.push(format!("{k}={v}"));
    }
    parts.push(signed_nonce.to_string());
    let text = parts.join("&");
    let mut h = Sha1::new();
    h.update(text.as_bytes());
    B64.encode(h.finalize())
}

pub fn generate_enc_params(
    uri: &str,
    method: &str,
    signed_nonce: &str,
    nonce: &str,
    params: &mut Vec<(String, String)>,
    ssecurity: &str,
) -> Result<Vec<(String, String)>, MiHomeError> {
    params.push((
        "rc4_hash__".to_string(),
        enc_signature(uri, method, signed_nonce, params),
    ));
    let key = b64decode(signed_nonce)?;
    for (_, v) in params.iter_mut() {
        let enc = rc4_crypt(&key, v.as_bytes(), 1024);
        *v = B64.encode(&enc);
    }
    params.push((
        "signature".to_string(),
        enc_signature(uri, method, signed_nonce, params),
    ));
    params.push(("ssecurity".to_string(), ssecurity.to_string()));
    params.push(("_nonce".to_string(), nonce.to_string()));
    Ok(params.clone())
}

pub fn encrypt_rc4(password_b64: &str, payload: &str) -> Result<String, MiHomeError> {
    let key = b64decode(password_b64)?;
    Ok(B64.encode(rc4_crypt(&key, payload.as_bytes(), 1024)))
}

pub fn decrypt_rc4(password_b64: &str, payload_b64: &str) -> Result<Vec<u8>, MiHomeError> {
    let key = b64decode(password_b64)?;
    let data = b64decode(payload_b64)?;
    Ok(rc4_crypt(&key, &data, 1024))
}

/// RC4, then UTF-8 or gzip.
pub fn decrypt(ssecurity_b64: &str, nonce_b64: &str, payload: &str) -> Result<String, MiHomeError> {
    let signed = signed_nonce(ssecurity_b64, nonce_b64)?;
    let raw = decrypt_rc4(&signed, payload)?;
    match String::from_utf8(raw.clone()) {
        Ok(text) => Ok(text),
        Err(_) => {
            use flate2::read::GzDecoder;
            use std::io::Read;
            let mut dec = GzDecoder::new(&raw[..]);
            let mut text = String::new();
            dec.read_to_string(&mut text)
                .map_err(|e| MiHomeError::Crypto(e.to_string()))?;
            Ok(text)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rc4_roundtrip_with_discard() {
        let key = b"test-key-123";
        let data = b"hello mijia world";
        let enc = rc4_crypt(key, data, 1024);
        assert_ne!(enc, data);
        let dec = rc4_crypt(key, &enc, 1024);
        assert_eq!(dec, data);
    }

    #[test]
    fn nonce_is_base64_and_signed_nonce_stable() {
        let n = gen_nonce();
        assert!(!n.is_empty());
        let s1 = signed_nonce("c2VjcmV0", "bm9uY2U=").unwrap();
        let s2 = signed_nonce("c2VjcmV0", "bm9uY2U=").unwrap();
        assert_eq!(s1, s2);
    }
}
