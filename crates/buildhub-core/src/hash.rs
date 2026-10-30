//! Structural hashing for data-set versions and memo keys (spec §4.2, §6.1).

use alloc::{format, string::String};
pub fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

pub fn hex(h: u64) -> String {
    format!("{h:016x}")
}
