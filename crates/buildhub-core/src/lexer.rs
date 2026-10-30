//! Lexer for BHL (spec §3.3). UTF-8 source, indentation-insensitive.

use alloc::{format, string::{String, ToString}, vec::Vec};
use crate::diag::{Diag, DResult, Pos};

#[derive(Clone, Debug, PartialEq)]
pub enum Tok {
    Num(f64),
    Sym(String),
    Str(String),
    Ident(String),
    // keywords
    Schema,
    Type,
    Fn,
    Const,
    Module,
    Import,
    From,
    Let,
    In,
    If,
    Then,
    Else,
    Match,
    True,
    False,
    Not,
    Some,
    None,
    Ok,
    Err,
    // punctuation
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    Comma,
    Colon,
    Semi,
    Dot,
    DotDot,
    Pipe,
    Bar,
    Arrow,
    FatArrow,
    Eq,
    EqEq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Plus,
    Minus,
    Star,
    Slash,
    SlashSlash,
    Percent,
    AndAnd,
    OrOr,
    Underscore,
    At,
    Amp,
    Eof,
}

impl Tok {
    pub fn describe(&self) -> String {
        match self {
            Tok::Num(n) => format!("number `{n}`"),
            Tok::Sym(s) => format!("symbol `{s}`"),
            Tok::Str(s) => format!("string `{s}`"),
            Tok::Ident(s) => format!("identifier `{s}`"),
            Tok::Eof => "end of file".to_string(),
            other => format!("`{}`", other.text()),
        }
    }

    pub fn text(&self) -> &'static str {
        match self {
            Tok::Schema => "schema",
            Tok::Type => "type",
            Tok::Fn => "fn",
            Tok::Const => "const",
            Tok::Module => "module",
            Tok::Import => "import",
            Tok::From => "from",
            Tok::Let => "let",
            Tok::In => "in",
            Tok::If => "if",
            Tok::Then => "then",
            Tok::Else => "else",
            Tok::Match => "match",
            Tok::True => "true",
            Tok::False => "false",
            Tok::Not => "not",
            Tok::Some => "some",
            Tok::None => "none",
            Tok::Ok => "ok",
            Tok::Err => "err",
            Tok::LParen => "(",
            Tok::RParen => ")",
            Tok::LBrace => "{",
            Tok::RBrace => "}",
            Tok::LBracket => "[",
            Tok::RBracket => "]",
            Tok::Comma => ",",
            Tok::Colon => ":",
            Tok::Semi => ";",
            Tok::Dot => ".",
            Tok::DotDot => "..",
            Tok::Pipe => "|",
            Tok::Bar => "||",
            Tok::Arrow => "->",
            Tok::FatArrow => "=>",
            Tok::Eq => "=",
            Tok::EqEq => "==",
            Tok::Ne => "!=",
            Tok::Lt => "<",
            Tok::Le => "<=",
            Tok::Gt => ">",
            Tok::Ge => ">=",
            Tok::Plus => "+",
            Tok::Minus => "-",
            Tok::Star => "*",
            Tok::Slash => "/",
            Tok::SlashSlash => "//",
            Tok::Percent => "%",
            Tok::AndAnd => "&&",
            Tok::OrOr => "or",
            Tok::Underscore => "_",
            Tok::At => "@",
            Tok::Amp => "&",
            Tok::Num(_) | Tok::Sym(_) | Tok::Str(_) | Tok::Ident(_) | Tok::Eof => "<literal>",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Token {
    pub tok: Tok,
    pub pos: Pos,
}

pub struct Lexer<'a> {
    src: &'a [u8],
    idx: usize,
    line: u32,
    col: u32,
    file: String,
    toks: Vec<Token>,
}

impl<'a> Lexer<'a> {
    pub fn new(src: &'a str, file: impl Into<String>) -> Self {
        Self { src: src.as_bytes(), idx: 0, line: 1, col: 1, file: file.into(), toks: Vec::new() }
    }

    fn peek(&self) -> Option<u8> {
        self.src.get(self.idx).copied()
    }

    fn peek_at(&self, n: usize) -> Option<u8> {
        self.src.get(self.idx + n).copied()
    }

    fn bump(&mut self) -> Option<u8> {
        let c = self.peek()?;
        self.idx += 1;
        if c == b'\n' {
            self.line += 1;
            self.col = 1;
        } else if c & 0xc0 != 0x80 {
            self.col += 1;
        }
        Some(c)
    }

    fn pos(&self) -> Pos {
        Pos::new(self.line, self.col)
    }

    fn err(&self, pos: Pos, msg: impl Into<String>) -> Diag {
        Diag::new("BHC-E100", self.file.clone(), pos, msg)
    }

    fn skip_trivia(&mut self) -> DResult<()> {
        loop {
            match self.peek() {
                Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n') => {
                    self.bump();
                }
                Some(b'#') => {
                    while let Some(c) = self.peek() {
                        if c == b'\n' {
                            break;
                        }
                        self.bump();
                    }
                }
                Some(b'/') if self.peek_at(1) == Some(b'/') => {
                    while let Some(c) = self.peek() {
                        if c == b'\n' {
                            break;
                        }
                        self.bump();
                    }
                }
                _ => return Ok(()),
            }
        }
    }

    fn push(&mut self, tok: Tok, pos: Pos) {
        self.toks.push(Token { tok, pos });
    }

    pub fn run(mut self) -> DResult<Vec<Token>> {
        loop {
            self.skip_trivia()?;
            let pos = self.pos();
            let c = match self.peek() {
                None => {
                    self.push(Tok::Eof, pos);
                    return Ok(self.toks);
                }
                Some(c) => c,
            };
            match c {
                b'0'..=b'9' => self.lex_number(pos)?,
                b'a'..=b'z' | b'A'..=b'Z' | b'_' | 0x80..=0xff => self.lex_word(pos),
                b'"' => self.lex_string(pos)?,
                _ => self.lex_punct(pos)?,
            }
        }
    }

    fn lex_number(&mut self, pos: Pos) -> DResult<()> {
        let start = self.idx;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                self.bump();
            } else {
                break;
            }
        }
        if self.peek() == Some(b'.') && self.peek_at(1).is_some_and(|c| c.is_ascii_digit()) {
            self.bump();
            while let Some(c) = self.peek() {
                if c.is_ascii_digit() {
                    self.bump();
                } else {
                    break;
                }
            }
        }
        // exponent
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            let save = (self.idx, self.line, self.col);
            self.bump();
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.bump();
            }
            if self.peek().is_some_and(|c| c.is_ascii_digit()) {
                while let Some(c) = self.peek() {
                    if c.is_ascii_digit() {
                        self.bump();
                    } else {
                        break;
                    }
                }
            } else {
                self.idx = save.0;
                self.line = save.1;
                self.col = save.2;
            }
        }
        let text = core::str::from_utf8(&self.src[start..self.idx]).map_err(|e| self.err(pos, e.to_string()))?;
        let n: f64 = text.parse().map_err(|_| self.err(pos, format!("invalid number literal `{text}`")))?;
        self.push(Tok::Num(n), pos);
        Ok(())
    }

    fn lex_word(&mut self, pos: Pos) {
        let start = self.idx;
        // Identifiers are UTF-8: game data routinely keys attributes in the game's own script.
        while let Some(c) = self.peek() {
            if c.is_ascii_alphanumeric() || c == b'_' || c >= 0x80 {
                self.bump();
            } else {
                break;
            }
        }
        let word = core::str::from_utf8(&self.src[start..self.idx]).unwrap_or("").to_string();
        // `sym"..."` / `named"..."` are handled at the string level by the parser (Sym token).
        let tok = match word.as_str() {
            "schema" => Tok::Schema,
            "type" => Tok::Type,
            "fn" => Tok::Fn,
            "const" => Tok::Const,
            "module" => Tok::Module,
            "import" => Tok::Import,
            "from" => Tok::From,
            "let" => Tok::Let,
            "in" => Tok::In,
            "if" => Tok::If,
            "then" => Tok::Then,
            "else" => Tok::Else,
            "match" => Tok::Match,
            "true" => Tok::True,
            "false" => Tok::False,
            "not" => Tok::Not,
            "some" => Tok::Some,
            "none" => Tok::None,
            "ok" => Tok::Ok,
            "err" => Tok::Err,
            "_" => Tok::Underscore,
            "sym" | "named" if self.peek() == Some(b'"') => {
                // Produce a Sym literal token by lexing the following string.
                let spos = self.pos();
                if let Err(e) = self.lex_string(spos) {
                    // Surface via a poisoned token; parser reports on next use.
                    self.push(Tok::Ident(format!("<lex-error:{}>", e.message)), pos);
                    return;
                }
                let last = self.toks.pop().expect("just pushed");
                if let Tok::Str(s) = last.tok {
                    self.push(Tok::Sym(s), pos);
                } else {
                    self.push(last.tok, pos);
                }
                return;
            }
            _ => Tok::Ident(word),
        };
        self.push(tok, pos);
    }

    fn lex_string(&mut self, pos: Pos) -> DResult<()> {
        // Collect raw bytes between escapes, then decode once so multi-byte UTF-8 survives.
        self.bump(); // opening quote
        let mut buf: Vec<u8> = Vec::new();
        let mut out = String::new();
        loop {
            match self.bump() {
                None => return Err(self.err(pos, "unterminated string literal")),
                Some(b'"') => {
                    out.push_str(&self.decode(&buf, pos)?);
                    break;
                }
                Some(b'\\') => {
                    out.push_str(&self.decode(&buf, pos)?);
                    buf.clear();
                    match self.bump() {
                        Some(b'n') => out.push('\n'),
                        Some(b't') => out.push('\t'),
                        Some(b'r') => out.push('\r'),
                        Some(b'"') => out.push('"'),
                        Some(b'\\') => out.push('\\'),
                        Some(c) => return Err(self.err(pos, format!("unknown escape `\\{}`", c as char))),
                        None => return Err(self.err(pos, "unterminated string escape")),
                    }
                }
                Some(c) => buf.push(c),
            }
        }
        self.push(Tok::Str(out), pos);
        Ok(())
    }

    fn decode(&self, bytes: &[u8], pos: Pos) -> DResult<String> {
        core::str::from_utf8(bytes)
            .map(|s| s.to_string())
            .map_err(|e| self.err(pos, format!("invalid UTF-8 in string literal: {e}")))
    }

    fn lex_punct(&mut self, pos: Pos) -> DResult<()> {
        let c = self.bump().unwrap();
        let two = |a: u8, b: u8| c == a && self.peek() == Some(b);
        let tok = match c {
            b'(' => Tok::LParen,
            b')' => Tok::RParen,
            b'{' => Tok::LBrace,
            b'}' => Tok::RBrace,
            b'[' => Tok::LBracket,
            b']' => Tok::RBracket,
            b',' => Tok::Comma,
            b':' => Tok::Colon,
            b';' => Tok::Semi,
            b'@' => Tok::At,
            b'&' => {
                if two(b'&', b'&') {
                    self.bump();
                    Tok::AndAnd
                } else {
                    return Err(self.err(pos, "unexpected `&` (use `&&`)"));
                }
            }
            b'|' => {
                if two(b'|', b'|') {
                    self.bump();
                    Tok::Bar
                } else {
                    Tok::Pipe
                }
            }
            b'.' => {
                // `..` is two dots; `two('.', '.')` would also fire on a single '.'.
                if self.peek() == Some(b'.') {
                    self.bump();
                    Tok::DotDot
                } else {
                    Tok::Dot
                }
            }
            b'-' => {
                if two(b'-', b'>') {
                    self.bump();
                    Tok::Arrow
                } else {
                    Tok::Minus
                }
            }
            b'=' => {
                if two(b'=', b'=') {
                    self.bump();
                    Tok::EqEq
                } else if two(b'=', b'>') {
                    self.bump();
                    Tok::FatArrow
                } else {
                    Tok::Eq
                }
            }
            b'!' => {
                if two(b'!', b'=') {
                    self.bump();
                    Tok::Ne
                } else {
                    return Err(self.err(pos, "unexpected `!` (use `not`)"));
                }
            }
            b'<' => {
                if two(b'<', b'=') {
                    self.bump();
                    Tok::Le
                } else {
                    Tok::Lt
                }
            }
            b'>' => {
                if two(b'>', b'=') {
                    self.bump();
                    Tok::Ge
                } else {
                    Tok::Gt
                }
            }
            b'+' => Tok::Plus,
            b'*' => Tok::Star,
            b'/' => {
                if two(b'/', b'/') {
                    self.bump();
                    Tok::SlashSlash
                } else {
                    Tok::Slash
                }
            }
            b'%' => Tok::Percent,
            other => return Err(self.err(pos, format!("unexpected character `{}`", other as char))),
        };
        self.push(tok, pos);
        Ok(())
    }
}
