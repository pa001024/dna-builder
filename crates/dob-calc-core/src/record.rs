//! 原始记录的柔性取值层。
//!
//! 数据包里的记录是**中文键名的动态对象**（`{"名称":"炽灼","攻击":0.15,…}`），
//! 同一个字段在不同模块里含义相同但键名不同，且属性键集合完全由数据决定
//! （MOD 的 `攻击`/`生命`、BUFF 的 `昂扬`/`增伤`/`召唤物伤害`……）。
//!
//! 上游 TS 里这些记录就是 `unknown` + 索引访问（`mod[attribute]`），
//! 因此这里也用「键值包」而不是强类型 struct：强类型一遇到数据更新加了新词条就会漏值。
//! 取值语义逐条对齐 JS：
//! - 数字：`typeof value === "number"`（字符串数字**不**算数值，与 JS 一致）；
//! - 文本：`String(value)`，`null`/缺失得到空串；
//! - 列表：非数组一律空列表。

use serde_json::{Map, Value};

use crate::attrmap::AttrMap;

/// 一条原始记录（柔性键值包）。
///
/// 共享不可变：clone 只增引用计数；嵌套对象 / 对象数组在构建时一次性包成子记录，
/// `obj` / `objs` 直接取共享子记录而不复制 JSON。
#[derive(Debug, Clone, Default)]
pub struct Record {
    inner: std::sync::Arc<RecordInner>,
}

#[derive(Debug, Clone, Default)]
struct RecordInner {
    map: Map<String, Value>,
    objs: std::collections::HashMap<String, Record>,
    lists: std::collections::HashMap<String, Vec<Record>>,
}

impl PartialEq for Record {
    fn eq(&self, other: &Self) -> bool {
        self.inner.map == other.inner.map
    }
}

impl RecordInner {
    fn index_key(&mut self, key: &str) {
        self.objs.remove(key);
        self.lists.remove(key);
        match self.map.get(key) {
            Some(Value::Object(child)) => {
                self.objs
                    .insert(key.to_string(), Record::from_map(child.clone()));
            }
            Some(Value::Array(items)) if items.iter().any(Value::is_object) => {
                self.lists.insert(
                    key.to_string(),
                    items.iter().map(Record::from_value).collect(),
                );
            }
            _ => {}
        }
    }
}

impl Record {
    /// 包一个 JSON 对象；非对象得到空记录（与上游「字段缺失」的兜底一致）。
    pub fn from_value(value: &Value) -> Self {
        match value {
            Value::Object(map) => Self::from_map(map.clone()),
            _ => Self::default(),
        }
    }

    /// 从 `serde_json::Map` 构建。
    pub fn from_map(map: Map<String, Value>) -> Self {
        let mut inner = RecordInner {
            map,
            ..Default::default()
        };
        let keys: Vec<String> = inner
            .map
            .iter()
            .filter(|(_, value)| value.is_object() || value.is_array())
            .map(|(key, _)| key.clone())
            .collect();
        for key in keys {
            inner.index_key(&key);
        }
        Self {
            inner: std::sync::Arc::new(inner),
        }
    }

    /// 是否为空记录。
    pub fn is_empty(&self) -> bool {
        self.inner.map.is_empty()
    }

    /// 该键是否存在（含显式 `null`）。
    pub fn contains(&self, key: &str) -> bool {
        self.inner.map.contains_key(key)
    }

    /// 原始值。
    pub fn value(&self, key: &str) -> Option<&Value> {
        self.inner.map.get(key)
    }

    /// 取出内部 JSON 对象（与 `from_value` 互逆）。
    pub fn into_value(self) -> Value {
        Value::Object(self.into_map())
    }

    /// 写入一个键（覆盖同名的旧值）。
    ///
    /// 用于**运行时补全**数据包里没有的派生字段，例如同律武器的 `技能`
    /// （上游在 `CharBuild.set char` 里从角色技能筛出来拼一份）。
    pub fn insert(&mut self, key: &str, value: Value) {
        let inner = std::sync::Arc::make_mut(&mut self.inner);
        inner.map.insert(key.to_string(), value);
        inner.index_key(key);
    }

    /// 取数字；非数字（含字符串数字、`null`、缺失）返回 `None`。
    pub fn num(&self, key: &str) -> Option<f64> {
        match self.inner.map.get(key) {
            Some(Value::Number(number)) => number.as_f64(),
            _ => None,
        }
    }

    /// 取数字，缺失按 `fallback`。
    pub fn num_or(&self, key: &str, fallback: f64) -> f64 {
        self.num(key).unwrap_or(fallback)
    }

    /// 取整数 id；JSON 整数直接取，整数值浮点截断取整，其余（小数/字符串/`null`/缺失）返回 `None`。
    pub fn id(&self, key: &str) -> Option<i64> {
        match self.inner.map.get(key) {
            Some(Value::Number(number)) => {
                if let Some(integer) = number.as_i64() {
                    return Some(integer);
                }
                if let Some(unsigned) = number.as_u64() {
                    return i64::try_from(unsigned).ok();
                }
                let float = number.as_f64()?;
                if float.is_finite()
                    && float.fract() == 0.0
                    && float.abs() < 9.007_199_254_740_992e15
                {
                    Some(float as i64)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// 取文本；`null` 与缺失得到空串，其余按 JS `String(value)` 转写。
    pub fn text(&self, key: &str) -> String {
        match self.inner.map.get(key) {
            None | Some(Value::Null) => String::new(),
            Some(Value::String(text)) => text.clone(),
            Some(Value::Bool(flag)) => flag.to_string(),
            Some(Value::Number(number)) => number_text(number),
            // JS 对对象/数组调 `String()` 会得到 `[object Object]` / 逗号拼接；
            // 这里保留 JSON 形态，便于排查数据问题。
            Some(other) => other.to_string(),
        }
    }

    /// 取字符串数组；标量会包成单元素列表（对齐 `dbStringList` 的宽松语义）。
    pub fn texts(&self, key: &str) -> Vec<String> {
        match self.inner.map.get(key) {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|item| match item {
                    Value::Null => None,
                    Value::String(text) => Some(text.clone()),
                    Value::Number(number) => Some(number_text(number)),
                    Value::Bool(flag) => Some(flag.to_string()),
                    _ => None,
                })
                .collect(),
            Some(Value::Null) | None => Vec::new(),
            // 标量（含字符串）包成单元素列表，与 `dbStringList` 的宽松语义一致
            Some(Value::String(text)) => {
                if text.is_empty() {
                    Vec::new()
                } else {
                    vec![text.clone()]
                }
            }
            Some(Value::Number(number)) => vec![number_text(number)],
            Some(Value::Bool(flag)) => vec![flag.to_string()],
            // 对象既不取值也不猜字段
            Some(_) => Vec::new(),
        }
    }

    /// 取数字列表；标量包成单元素列表（对齐 `dbNumSeries`）。
    pub fn nums(&self, key: &str) -> Vec<f64> {
        match self.inner.map.get(key) {
            Some(Value::Array(items)) => items.iter().filter_map(Value::as_f64).collect(),
            Some(Value::Number(number)) => number.as_f64().into_iter().collect(),
            _ => Vec::new(),
        }
    }

    /// 取嵌套记录；非对象得到空记录。
    pub fn obj(&self, key: &str) -> Record {
        self.inner.objs.get(key).cloned().unwrap_or_default()
    }

    /// 借用嵌套记录（非对象得到 `None`）。
    pub fn obj_ref(&self, key: &str) -> Option<&Record> {
        self.inner.objs.get(key)
    }

    /// 取记录列表；非数组得到空列表。
    pub fn objs(&self, key: &str) -> Vec<Record> {
        match self.inner.lists.get(key) {
            Some(items) => items.clone(),
            None => match self.inner.map.get(key) {
                Some(Value::Array(items)) => items.iter().map(Record::from_value).collect(),
                _ => Vec::new(),
            },
        }
    }

    /// 借用记录列表（仅含对象元素的数组；其余返回空切片）。
    pub fn objs_ref(&self, key: &str) -> &[Record] {
        self.inner.lists.get(key).map(Vec::as_slice).unwrap_or(&[])
    }

    /// 全部数值型键值对（按键升序，保证遍历确定性）。
    ///
    /// 对应上游 `Object.keys(source)` 后逐个 `typeof value === "number"` 判定，
    /// 区别只在顺序：属性求和与顺序无关，唯一顺序敏感的 `baseValue` 展示值不使用本方法。
    pub fn numeric_entries(&self) -> Vec<(String, f64)> {
        self.inner
            .map
            .iter()
            .filter_map(|(key, value)| value.as_f64().map(|number| (key.clone(), number)))
            .collect()
    }

    /// 全部键（按升序）。
    pub fn keys(&self) -> Vec<String> {
        self.inner.map.keys().cloned().collect()
    }

    /// 按 `[[a, b], …]` 形态取数字二元组列表（自定义变量、MOD 条件等）。
    pub fn pairs(&self, key: &str) -> Vec<[f64; 2]> {
        match self.inner.map.get(key) {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|item| {
                    let inner = item.as_array()?;
                    if inner.len() < 2 {
                        return None;
                    }
                    Some([inner[0].as_f64()?, inner[1].as_f64()?])
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    /// 取「条件」三元组列表 `[[属性, 运算符, 值], …]`（MOD 的 `生效.条件`）。
    ///
    /// 值可能是数字，也可能是字符串运算符之外的比较值；非数字一律当 0
    /// （与上游把 `value` 直接当数字比较的语义一致——比较失败即条件不成立）。
    pub fn conditions(&self, key: &str) -> Vec<(String, String, f64)> {
        match self.inner.map.get(key) {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|item| {
                    let inner = item.as_array()?;
                    let attr = inner.first()?.as_str()?.to_string();
                    let operator = inner.get(1)?.as_str()?.to_string();
                    let value = inner.get(2).and_then(Value::as_f64).unwrap_or(0.0);
                    Some((attr, operator, value))
                })
                .collect(),
            _ => Vec::new(),
        }
    }

    /// 是否含任意数值属性（对齐上游 `typeof value === "number"` 的扫描）。
    pub fn has_any_number(&self) -> bool {
        self.inner
            .map
            .values()
            .any(|value| value.as_f64().is_some())
    }

    /// 转回可变 JSON 对象。
    pub fn into_map(self) -> Map<String, Value> {
        match std::sync::Arc::try_unwrap(self.inner) {
            Ok(inner) => inner.map,
            Err(shared) => shared.map.clone(),
        }
    }

    /// 借用底层 map。
    pub fn as_map(&self) -> &Map<String, Value> {
        &self.inner.map
    }

    /// 文本借用（仅字符串值；其余返回 `None`）。
    pub fn str_ref(&self, key: &str) -> Option<&str> {
        match self.inner.map.get(key) {
            Some(Value::String(text)) => Some(text.as_str()),
            _ => None,
        }
    }
    /// 字符串借用；缺失/`null`/非字符串一律得空串（`text` 的无分配版本）。
    pub fn str_or_empty(&self, key: &str) -> &str {
        match self.inner.map.get(key) {
            Some(Value::String(text)) => text.as_str(),
            _ => "",
        }
    }

    /// 文本相等比较；语义与 `text(key) == expected` 一致但字符串值不分配。
    ///
    /// 数字仍经 `number_text` 转写后比较（与 `text` 同口径），布尔按
    /// `"true"`/`"false"` 比较；`null`/缺失视为空串。
    #[allow(clippy::cmp_owned)]
    pub fn text_eq(&self, key: &str, expected: &str) -> bool {
        match self.inner.map.get(key) {
            None | Some(Value::Null) => expected.is_empty(),
            Some(Value::String(text)) => text == expected,
            Some(Value::Bool(flag)) => (*flag && expected == "true") || (!flag && expected == "false"),
            Some(Value::Number(number)) => number_text(number) == expected,
            Some(other) => other.to_string() == expected,
        }
    }

    /// 全部键借用遍历（按升序；`keys` 的无分配版本，只遍历不收集时用）。
    pub fn keys_ref(&self) -> impl Iterator<Item = &str> + '_ {
        self.inner.map.keys().map(String::as_str)
    }

    /// 数值型键值借用遍历（按键升序）。
    pub fn numeric_iter(&self) -> impl Iterator<Item = (&str, f64)> + '_ {
        self.inner
            .map
            .iter()
            .filter_map(|(key, value)| value.as_f64().map(|number| (key.as_str(), number)))
    }
}

/// 数值 → 文本，对齐 JS `Number.prototype.toString()`
/// （整数值不带小数点，`-0` 写作 `0`）。
pub fn number_text(number: &serde_json::Number) -> String {
    if let Some(integer) = number.as_i64() {
        return integer.to_string();
    }
    if let Some(unsigned) = number.as_u64() {
        return unsigned.to_string();
    }
    match number.as_f64() {
        Some(0.0) => "0".to_string(),
        Some(float) if float.fract() == 0.0 && float.abs() < 1e15 => format!("{}", float as i64),
        Some(float) => format!("{}", float),
        None => number.to_string(),
    }
}

/// 往属性表累加一条记录的全部数值属性；对应上游 `accumulate`。
pub fn accumulate(target: &mut AttrMap, source: &Record) {
    for (key, value) in source.numeric_entries() {
        *target.entry(key).or_insert(0.0) += value;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_numbers_only_for_real_numbers() {
        let record = Record::from_value(&json!({ "攻击": 0.15, "文本数字": "1.5", "空": null }));
        assert_eq!(record.num("攻击"), Some(0.15));
        // 字符串数字不算数值，与 JS `typeof` 判定一致
        assert_eq!(record.num("文本数字"), None);
        assert_eq!(record.num("空"), None);
        assert_eq!(record.num("缺失"), None);
        assert_eq!(record.num_or("文本数字", 2.0), 2.0);
    }

    #[test]
    fn texts_accepts_scalar_and_list() {
        let record = Record::from_value(&json!({ "列表": ["a", "b", 3], "标量": "x", "空": null }));
        assert_eq!(record.texts("列表"), vec!["a", "b", "3"]);
        assert_eq!(record.texts("标量"), vec!["x"]);
        assert!(record.texts("空").is_empty());
    }

    #[test]
    fn nums_accepts_scalar_and_list() {
        let record = Record::from_value(&json!({ "列表": [1, 2.5], "标量": 7 }));
        assert_eq!(record.nums("列表"), vec![1.0, 2.5]);
        assert_eq!(record.nums("标量"), vec![7.0]);
    }

    #[test]
    fn numeric_entries_skips_non_numbers() {
        let record =
            Record::from_value(&json!({ "名称": "炽灼", "攻击": 0.15, "生效": {"条件": []} }));
        assert_eq!(record.numeric_entries(), vec![("攻击".to_string(), 0.15)]);
    }

    #[test]
    fn number_text_matches_js() {
        assert_eq!(number_text(&serde_json::Number::from(3)), "3");
        assert_eq!(
            number_text(&serde_json::Number::from_f64(1.5).unwrap()),
            "1.5"
        );
        assert_eq!(
            number_text(&serde_json::Number::from_f64(-0.0).unwrap()),
            "0"
        );
    }
}
