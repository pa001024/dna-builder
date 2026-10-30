//! Machine-readable diagnostics (spec §6.3). Codes are grouped by stage:
//! E1xx compile, E2xx load, E3xx eval, E4xx capability.

use alloc::{format, string::String};
use core::fmt;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct Pos {
    pub line: u32,
    pub col: u32,
}

impl Pos {
    pub fn new(line: u32, col: u32) -> Self {
        Self { line, col }
    }
}

impl fmt::Display for Pos {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.line, self.col)
    }
}

#[derive(Clone, Debug)]
pub struct Diag {
    pub code: &'static str,
    pub message: String,
    pub file: String,
    pub pos: Pos,
    pub note: Option<String>,
}

impl Diag {
    pub fn new(code: &'static str, file: impl Into<String>, pos: Pos, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), file: file.into(), pos, note: None }
    }

    pub fn with_note(mut self, note: impl Into<String>) -> Self {
        self.note = Some(note.into());
        self
    }

    pub fn to_json(&self) -> String {
        let mut s = String::from("{");
        s.push_str(&format!("\"code\":{}", json_str(self.code)));
        s.push_str(&format!(",\"message\":{}", json_str(&self.message)));
        s.push_str(&format!(",\"file\":{}", json_str(&self.file)));
        s.push_str(&format!(",\"line\":{},\"col\":{}", self.pos.line, self.pos.col));
        if let Some(n) = &self.note {
            s.push_str(&format!(",\"note\":{}", json_str(n)));
        }
        s.push('}');
        s
    }
}

impl fmt::Display for Diag {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}:{}: {}: {}", self.file, self.pos.line, self.pos.col, self.code, self.message)?;
        if let Some(n) = &self.note {
            write!(f, " ({n})")?;
        }
        Ok(())
    }
}

impl core::error::Error for Diag {}

pub fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub type DResult<T> = Result<T, Diag>;
