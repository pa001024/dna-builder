//! 会话表：一次建表、多次求值。
//!
//! 建表（几万条记录建索引）是百毫秒级固定成本，求值只要十毫秒级，因此 wasm 侧
//! 走「会话句柄」复用已建好的表。rlib 调用方自定缓存策略，不经过这里。
//! 锁内只 clone `Arc`，求值在锁外执行，「求值期间被 close」不会悬垂。

use std::collections::HashMap;
use std::sync::LazyLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::Value;

use crate::error::CalcError;
use crate::tables::{BuildTables, TableBuilder};

/// 建表所需的记录模块（7 记录模块 + 潜质）。
///
/// 键名与数据包模块键一致（如 `char.data`）；两种形态都接受：
/// 直接 `{ "char.data": [...] }`，或包一层 `{ "modules": {...}, "petTraits": [...] }`。
/// `CommonLevelUp` / `MOB_LEVEL_UP` 不由调用方喂，见 `const_tables`。
#[derive(Debug, Default)]
pub struct ModulesJson {
    /// `char.data` 记录数组。
    pub char_data: Vec<Value>,
    /// `mod.data` 记录数组。
    pub mod_data: Vec<Value>,
    /// `weapon.data` 记录数组。
    pub weapon_data: Vec<Value>,
    /// `buff.data` 记录数组。
    pub buff_data: Vec<Value>,
    /// `effect.data` 记录数组。
    pub effect_data: Vec<Value>,
    /// `monster.data` 记录数组。
    pub monster_data: Vec<Value>,
    /// `pet.data` 记录数组。
    pub pet_data: Vec<Value>,
    /// 潜质档位数组（`petTraits`，缺失时回落到 `petEntrys`）。
    pub pet_traits: Vec<Value>,
}

impl ModulesJson {
    /// 从模块 JSON 解析记录清单；顶层非对象时返回 [`CalcError::ModulesParse`]。
    pub fn from_json(modules_json: &str) -> Result<Self, CalcError> {
        let root: Value = serde_json::from_str(modules_json)
            .map_err(|error| CalcError::ModulesParse(format!("模块 JSON 解析失败：{error}")))?;
        let obj = root
            .as_object()
            .ok_or_else(|| CalcError::ModulesParse("模块 JSON 顶层应是对象".to_string()))?;
        let modules = obj.get("modules").and_then(Value::as_object).unwrap_or(obj);
        let get = |key: &str| -> Vec<Value> {
            modules
                .get(key)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        };
        Ok(Self {
            char_data: get("char.data"),
            mod_data: get("mod.data"),
            weapon_data: get("weapon.data"),
            buff_data: get("buff.data"),
            effect_data: get("effect.data"),
            monster_data: get("monster.data"),
            pet_data: get("pet.data"),
            pet_traits: obj
                .get("petTraits")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_else(|| get("petEntrys")),
        })
    }
}

/// 已加载的数据包表（跨多次求值复用）；构建一次较贵，调用方应缓存。
#[derive(Debug)]
pub struct BuildPayload {
    /// 建好的查表索引。
    pub tables: BuildTables,
}

impl BuildPayload {
    /// 从调用方注好的模块 JSON 建表。
    pub fn from_json(modules_json: &str) -> Result<Self, CalcError> {
        let modules = ModulesJson::from_json(modules_json)?;
        let tables = TableBuilder::build(&modules)?;
        Ok(Self { tables })
    }

    /// 用已构建的表直接构造（供测试在内存中装配）。
    pub fn from_tables(tables: BuildTables) -> Self {
        Self { tables }
    }
}

static SESSIONS: Sessions = Sessions::new();

struct Sessions {
    next: AtomicU64,
    map: LazyLock<Mutex<HashMap<u64, Arc<BuildPayload>>>>,
}
// 计算会话注册表（线程局部：`BuildContext` 含 `Rc` 缓存，非 `Send`）。
// wasm 主路径单线程，无影响；native 多线程下句柄只在创建线程有效。
thread_local! {
    static CALC_NEXT: std::cell::Cell<u64> = const { std::cell::Cell::new(1) };
    static CALC_MAP: std::cell::RefCell<HashMap<u64, crate::evaluate::CalcSession>> =
        std::cell::RefCell::new(HashMap::new());
}

impl Sessions {
    const fn new() -> Self {
        // 0 留给「无效句柄」。
        Self {
            next: AtomicU64::new(1),
            map: LazyLock::new(|| Mutex::new(HashMap::new())),
        }
    }

    fn insert(&self, payload: BuildPayload) -> u64 {
        let mut id = self.next.fetch_add(1, Ordering::Relaxed);
        if id == 0 {
            // 计数器回绕时跳过 0（实践中不会发生）。
            id = self.next.fetch_add(1, Ordering::Relaxed);
        }
        self.map.lock().unwrap().insert(id, Arc::new(payload));
        id
    }

    fn remove(&self, id: u64) {
        if id != 0 {
            self.map.lock().unwrap().remove(&id);
        }
    }

    fn with<T, F: FnOnce(&BuildPayload) -> T>(&self, id: u64, action: F) -> Result<T, CalcError> {
        let payload = self.map.lock().unwrap().get(&id).cloned();
        match payload {
            Some(payload) => Ok(action(&payload)),
            None => Err(CalcError::InvalidSession),
        }
    }
}

fn next_calc_id() -> u64 {
    let take = || {
        CALC_NEXT.with(|next| {
            let id = next.get();
            next.set(id.wrapping_add(1));
            id
        })
    };
    let id = take();
    // 0 留给「无效句柄」，计数器回绕时再取一次（实践中不会发生）。
    if id == 0 { take() } else { id }
}

/// 建计算会话并返回句柄（`tables` 按 `Arc` 共享）。
pub(crate) fn insert_calc_session(tables: &BuildTables) -> u64 {
    let id = next_calc_id();
    CALC_MAP.with(|map| {
        map.borrow_mut()
            .insert(id, crate::evaluate::CalcSession::new(tables))
    });
    id
}

/// 在计算会话里执行 `action`；句柄无效时返回 [`CalcError::InvalidSession`]。
pub(crate) fn with_calc_session<T, F: FnOnce(&mut crate::evaluate::CalcSession) -> T>(
    id: u64,
    action: F,
) -> Result<T, CalcError> {
    CALC_MAP.with(|map| {
        let mut borrowed = map.borrow_mut();
        match borrowed.get_mut(&id) {
            Some(session) => Ok(action(session)),
            None => Err(CalcError::InvalidSession),
        }
    })
}

/// 关闭计算会话；重复关闭安全。
pub(crate) fn remove_calc_session(id: u64) {
    if id != 0 {
        CALC_MAP.with(|map| {
            map.borrow_mut().remove(&id);
        });
    }
}

/// 建表并返回会话句柄。
pub(crate) fn insert_payload(payload: BuildPayload) -> u64 {
    SESSIONS.insert(payload)
}

/// 取出会话执行 `action`；句柄无效时返回 [`CalcError::InvalidSession`]。
pub(crate) fn with_payload<T, F: FnOnce(&BuildPayload) -> T>(
    id: u64,
    action: F,
) -> Result<T, CalcError> {
    SESSIONS.with(id, action)
}

/// 关闭会话并释放其表；重复关闭安全。
pub(crate) fn remove_payload(id: u64) {
    SESSIONS.remove(id);
}
