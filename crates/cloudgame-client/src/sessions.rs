//! 多账号会话列表（cloudgame-sessions.json），进程退出后保留。
//! `--id <profile>` 决定本进程使用哪个账号；不带参数时用 `default`（上次启动的账号）。

use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::auth::Session;

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    /// 上次为该账号选择的节点（空 = 自动测速选优）
    #[serde(default)]
    pub node: String,
    pub session: Session,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub sessions: Vec<Profile>,
    /// 上次启动的账号。旧版本字段名是 active，用 alias 兼容。
    #[serde(default, alias = "active")]
    pub default: String,
}

impl Store {
    fn dir() -> PathBuf {
        let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        p.push("dna-builder");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    fn path() -> PathBuf {
        Self::dir().join("cloudgame-sessions.json")
    }

    pub fn load() -> Self {
        let mut store: Store = std::fs::read_to_string(Self::path())
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        if store.default.is_empty() {
            if let Some(p) = store.sessions.first() {
                store.default = p.id.clone();
            }
        }
        store
    }

    pub fn save(&self) -> Result<()> {
        std::fs::write(Self::path(), serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    /// 读-改-写：多个窗口同时运行时，避免用内存里的旧列表覆盖别人刚写入的账号。
    pub fn mutate<R>(f: impl FnOnce(&mut Store) -> R) -> R {
        let mut s = Self::load();
        let r = f(&mut s);
        let _ = s.save();
        r
    }

    pub fn get(&self, id: &str) -> Option<&Profile> {
        self.sessions.iter().find(|p| p.id == id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut Profile> {
        self.sessions.iter_mut().find(|p| p.id == id)
    }

    pub fn default_profile(&self) -> Option<&Profile> {
        self.get(&self.default).or_else(|| self.sessions.first())
    }

    /// 新增账号（自动生成 id），不改变 default。
    pub fn add(&mut self, name: String, session: Session) -> String {
        self.add_with_id(uuid::Uuid::new_v4().to_string(), name, session)
    }

    /// 用调用方预先生成的 id 新增账号（浏览器 profile 目录跟随该 id）。
    pub fn add_with_id(&mut self, id: String, name: String, session: Session) -> String {
        self.sessions.push(Profile { id: id.clone(), name, node: String::new(), session });
        id
    }

    /// 更新指定账号的会话数据与显示名（保留节点选择）。
    pub fn update(&mut self, id: &str, session: Session) {
        if let Some(p) = self.get_mut(id) {
            p.name = display_name(&session);
            p.session = session;
        }
    }

    pub fn set_node(&mut self, id: &str, node: String) {
        if let Some(p) = self.get_mut(id) {
            p.node = node;
        }
    }

    pub fn remove(&mut self, id: &str) {
        self.sessions.retain(|p| p.id != id);
        if self.default == id {
            self.default = self.sessions.first().map(|p| p.id.clone()).unwrap_or_default();
        }
    }

    pub fn tabs(&self) -> Vec<(String, String)> {
        self.sessions.iter().map(|p| (p.id.clone(), mask_phone(&p.name))).collect()
    }
}

/// 登录缓存里的 cName 是 `U346603733A` 这类内部 ID，不能当昵称显示。
pub fn is_internal_name(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else { return false };
    if first != 'U' && first != 'u' {
        return false;
    }
    let rest = &s[1..];
    rest.len() >= 6
        && rest.chars().all(|c| c.is_ascii_alphanumeric())
        && rest.chars().filter(|c| c.is_ascii_digit()).count() >= 6
}

/// 显示用：11 位手机号中间四位打码（17800001111 → 178****1111）。
/// 只用于界面标签，落盘/内存里的 `Profile.name` 保留原文。
pub fn mask_phone(s: &str) -> String {
    let b = s.as_bytes();
    if b.len() == 11 && b.iter().all(u8::is_ascii_digit) {
        format!("{}****{}", &s[..3], &s[7..])
    } else {
        s.to_string()
    }
}

pub fn display_name(s: &Session) -> String {
    if let Some(n) = s.nickname.as_deref().filter(|n| !n.is_empty() && !is_internal_name(n)) {
        n.to_string()
    } else if !s.cname.is_empty() && !is_internal_name(&s.cname) {
        s.cname.clone()
    } else if !s.phone.is_empty() {
        s.phone.clone()
    } else if !s.cuid.is_empty() {
        format!("账号 {}", s.cuid)
    } else {
        "新会话".into()
    }
}
