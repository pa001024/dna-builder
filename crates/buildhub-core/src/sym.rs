//! Identifier interning: `Sym` values are interned at load time (spec §2.1 #3).

use alloc::{string::{String, ToString}, vec::Vec};
use hashbrown::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Sym(pub u32);

#[derive(Default, Debug)]
pub struct Interner {
    map: HashMap<String, Sym>,
    names: Vec<String>,
}

impl Interner {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn intern(&mut self, s: &str) -> Sym {
        if let Some(&id) = self.map.get(s) {
            return id;
        }
        let id = Sym(self.names.len() as u32);
        self.names.push(s.to_string());
        self.map.insert(s.to_string(), id);
        id
    }

    pub fn name(&self, sym: Sym) -> &str {
        &self.names[sym.0 as usize]
    }

    pub fn try_name(&self, sym: Sym) -> Option<&str> {
        self.names.get(sym.0 as usize).map(|s| s.as_str())
    }

    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    pub fn find(&self, s: &str) -> Option<Sym> {
        self.map.get(s).copied()
    }

    /// Clone for a host boundary: symbol ids must stay identical across a load.
    pub fn clone_for_host(&self) -> Self {
        Self { map: self.map.clone(), names: self.names.clone() }
    }

    /// Seed the table with a fixed order so symbol ids are stable across runs.
    pub fn seed<'a, I: IntoIterator<Item = &'a str>>(&mut self, names: I) {
        for n in names {
            self.intern(n);
        }
    }
}
