//! sdk-api 签名与 usdk AES 信封（对应 index.js 的 hN/pN/dN 与 JP/QP）。

use std::collections::BTreeMap;

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as B64, Engine};

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// sdk-api sign：字段排序 join `k=v&`，追加 `&appKey`，md5 hex 后换位 [1↔13,5↔17,7↔23]。
pub fn sdk_sign(fields: &BTreeMap<String, String>, app_key: &str) -> String {
    let mut s = fields
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    s.push('&');
    s.push_str(app_key);
    let mut chars: Vec<char> = format!("{:x}", md5::compute(s)).chars().collect();
    for (a, b) in [(1usize, 13usize), (5, 17), (7, 23)] {
        if a < chars.len() && b < chars.len() {
            chars.swap(a, b);
        }
    }
    chars.into_iter().collect()
}

/// usdk base64 换位：长度 >51 时 swap [1↔33,10↔42,18↔50,19↔51]。
pub fn swap_b64(s: &str) -> String {
    let mut chars: Vec<u8> = s.as_bytes().to_vec();
    if chars.len() > 51 {
        for (a, b) in [(1usize, 33usize), (10, 42), (18, 50), (19, 51)] {
            chars.swap(a, b);
        }
    }
    String::from_utf8_lossy(&chars).into_owned()
}

pub fn aes_encrypt_b64(plain: &[u8], key: &[u8; 32], iv: &[u8; 16]) -> String {
    let enc = Aes256CbcEnc::new_from_slices(key, iv).expect("key/iv len");
    let buf = enc.encrypt_padded_vec_mut::<Pkcs7>(plain);
    B64.encode(buf)
}

/// usdk 响应解包（对应 QP）：JSON → unswap+b64+JSON → unswap+b64+AES+JSON。
pub fn usdk_decode_response(raw: &str, key: &[u8; 32], iv: &[u8; 16]) -> Result<serde_json::Value> {
    if let Ok(v) = serde_json::from_str(raw) {
        return Ok(v);
    }
    let unswapped = swap_b64(raw);
    let decoded = B64.decode(unswapped.trim())?;
    if let Ok(v) = serde_json::from_slice(&decoded) {
        return Ok(v);
    }
    let dec = Aes256CbcDec::new_from_slices(key, iv).expect("key/iv len");
    let plain = dec
        .decrypt_padded_vec_mut::<Pkcs7>(&decoded)
        .map_err(|e| anyhow::anyhow!("usdk aes decrypt failed: {e}"))?;
    Ok(serde_json::from_slice(&plain)?)
}
