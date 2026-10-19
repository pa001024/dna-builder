//! 属性表：按键字符串有序的扁平 `Vec`，键为全局驻留的 `&'static str`。
//!
//! 与 `BTreeMap<String, f64>` 同序同语义（遍历按键升序），查找不分配；新键首次写入时驻留一次。
//! 内部为 `Arc<Vec<_>>` 写时复制：`clone()` 仅增加引用计数，属性求值里大量
//! 「克隆快照再局部改写」的路径不再复制整表。

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

static INTERNER: Mutex<Option<HashSet<&'static str>>> = Mutex::new(None);

/// 驻留属性名（进程级，只增不减；属性名集合由数据决定，规模有限）。
pub fn intern(name: &str) -> &'static str {
    let mut guard = INTERNER.lock().unwrap_or_else(|poison| poison.into_inner());
    let set = guard.get_or_insert_with(HashSet::new);
    if let Some(found) = set.get(name) {
        return found;
    }
    let leaked: &'static str = Box::leak(name.to_string().into_boxed_str());
    set.insert(leaked);
    leaked
}

#[derive(Clone, Default, PartialEq)]
pub struct AttrMap {
    entries: Arc<Vec<(&'static str, f64)>>,
}

impl std::fmt::Debug for AttrMap {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_map()
            .entries(self.entries.iter().map(|(k, v)| (k, v)))
            .finish()
    }
}

pub struct Entry<'a> {
    map: &'a mut AttrMap,
    index: Result<usize, usize>,
    key: Option<&'static str>,
}

impl<'a> Entry<'a> {
    pub fn or_insert(self, value: f64) -> &'a mut f64 {
        let index = match self.index {
            Ok(index) => index,
            Err(index) => {
                let key = self.key.expect("缺键时已驻留");
                Arc::make_mut(&mut self.map.entries).insert(index, (key, value));
                index
            }
        };
        &mut Arc::make_mut(&mut self.map.entries)[index].1
    }

    pub fn or_default(self) -> &'a mut f64 {
        self.or_insert(0.0)
    }
}

impl AttrMap {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            entries: Arc::new(Vec::with_capacity(capacity)),
        }
    }

    #[inline]
    fn find(&self, key: &str) -> Result<usize, usize> {
        self.entries
            .binary_search_by(|(probe, _)| (*probe).cmp(key))
    }

    #[inline]
    pub fn get(&self, key: &str) -> Option<&f64> {
        self.find(key).ok().map(|index| &self.entries[index].1)
    }

    #[inline]
    pub fn get_mut(&mut self, key: &str) -> Option<&mut f64> {
        match self.find(key) {
            Ok(index) => Some(&mut Arc::make_mut(&mut self.entries)[index].1),
            Err(_) => None,
        }
    }

    #[inline]
    pub fn contains_key(&self, key: &str) -> bool {
        self.find(key).is_ok()
    }

    pub fn insert(&mut self, key: impl AsRef<str>, value: f64) -> Option<f64> {
        let key = key.as_ref();
        match self.find(key) {
            Ok(index) => Some(std::mem::replace(
                &mut Arc::make_mut(&mut self.entries)[index].1,
                value,
            )),
            Err(index) => {
                Arc::make_mut(&mut self.entries).insert(index, (intern(key), value));
                None
            }
        }
    }

    /// 已驻留键的写入（免查驻留表）。热路径的字面量键走这里。
    #[inline]
    pub fn insert_static(&mut self, key: &'static str, value: f64) -> Option<f64> {
        match self.find(key) {
            Ok(index) => Some(std::mem::replace(
                &mut Arc::make_mut(&mut self.entries)[index].1,
                value,
            )),
            Err(index) => {
                Arc::make_mut(&mut self.entries).insert(index, (key, value));
                None
            }
        }
    }

    pub fn entry(&mut self, key: impl AsRef<str>) -> Entry<'_> {
        let key = key.as_ref();
        let index = self.find(key);
        let key = index.is_err().then(|| intern(key));
        Entry {
            map: self,
            index,
            key,
        }
    }

    /// 已驻留键的 `entry`（热路径字面量 / `AttrMap` 自身键，免查驻留表）。
    pub fn entry_static(&mut self, key: &'static str) -> Entry<'_> {
        let index = self.find(key);
        Entry {
            map: self,
            index,
            key: Some(key),
        }
    }

    pub fn remove(&mut self, key: &str) -> Option<f64> {
        match self.find(key) {
            Ok(index) => Some(Arc::make_mut(&mut self.entries).remove(index).1),
            Err(_) => None,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn clear(&mut self) {
        if Arc::strong_count(&self.entries) == 1 {
            Arc::make_mut(&mut self.entries).clear();
        } else {
            self.entries = Arc::new(Vec::new());
        }
    }

    pub fn iter(&self) -> impl DoubleEndedIterator<Item = (&'static str, &f64)> + '_ {
        self.entries.iter().map(|(key, value)| (*key, value))
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (&'static str, &mut f64)> + '_ {
        Arc::make_mut(&mut self.entries)
            .iter_mut()
            .map(|(key, value)| (*key, value))
    }

    pub fn keys(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.entries.iter().map(|(key, _)| *key)
    }

    pub fn values(&self) -> impl Iterator<Item = &f64> + '_ {
        self.entries.iter().map(|(_, value)| value)
    }

    pub fn retain(&mut self, mut keep: impl FnMut(&str, &mut f64) -> bool) {
        Arc::make_mut(&mut self.entries).retain_mut(|(key, value)| keep(key, value));
    }

    /// 按键升序的原始条目。
    pub fn entries(&self) -> &[(&'static str, f64)] {
        &self.entries
    }

    pub fn to_btree(&self) -> std::collections::BTreeMap<String, f64> {
        self.entries
            .iter()
            .map(|(key, value)| (key.to_string(), *value))
            .collect()
    }
}

impl<K: AsRef<str>> FromIterator<(K, f64)> for AttrMap {
    fn from_iter<I: IntoIterator<Item = (K, f64)>>(iter: I) -> Self {
        let mut map = AttrMap::new();
        for (key, value) in iter {
            map.insert(key, value);
        }
        map
    }
}

impl<K: AsRef<str>> Extend<(K, f64)> for AttrMap {
    fn extend<I: IntoIterator<Item = (K, f64)>>(&mut self, iter: I) {
        for (key, value) in iter {
            self.insert(key, value);
        }
    }
}

impl IntoIterator for AttrMap {
    type Item = (String, f64);
    type IntoIter = std::iter::Map<
        std::vec::IntoIter<(&'static str, f64)>,
        fn((&'static str, f64)) -> (String, f64),
    >;
    fn into_iter(self) -> Self::IntoIter {
        Arc::try_unwrap(self.entries)
            .unwrap_or_else(|shared| (*shared).clone())
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
    }
}

impl<'a> IntoIterator for &'a AttrMap {
    type Item = (&'static str, &'a f64);
    type IntoIter = std::iter::Map<
        std::slice::Iter<'a, (&'static str, f64)>,
        fn(&'a (&'static str, f64)) -> (&'static str, &'a f64),
    >;
    fn into_iter(self) -> Self::IntoIter {
        self.entries.iter().map(|(key, value)| (*key, value))
    }
}

impl serde::Serialize for AttrMap {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(self.entries.len()))?;
        for (key, value) in self.entries.iter() {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordered_like_btreemap() {
        let mut map = AttrMap::new();
        map.insert("暴击", 1.0);
        map.insert("攻击", 2.0);
        *map.entry("暴击").or_insert(0.0) += 1.0;
        *map.entry("暴伤").or_insert(0.0) += 3.0;
        let reference: std::collections::BTreeMap<String, f64> =
            [("暴击", 2.0), ("攻击", 2.0), ("暴伤", 3.0)]
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect();
        assert_eq!(map.to_btree(), reference);
        assert_eq!(map.remove("攻击"), Some(2.0));
        assert!(!map.contains_key("攻击"));
    }
}
