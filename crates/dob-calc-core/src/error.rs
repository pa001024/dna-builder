//! 计算错误：中文 message（沿仓库惯例）。

/// CharBuild 计算全流程的错误。
#[derive(Debug, thiserror::Error)]
pub enum CalcError {
    /// 角色 id 未在角色表中找到。
    #[error("未知角色：{0}")]
    UnknownChar(String),
    /// 怪物 id 未在怪物表中找到（TS 严格口径：不回落默认怪）。
    #[error("未知怪物：{0}")]
    UnknownMonster(String),
    /// MOD id 未在 MOD 表中找到（下线 MOD 不跳过，直接报错）。
    #[error("未知 MOD：{0}")]
    UnknownMod(String),
    /// 武器 id 未在武器表中找到。
    #[error("未知武器：{0}")]
    UnknownWeapon(String),
    /// BUFF 名未在 BUFF 表中找到（下线 BUFF 不跳过，直接报错）。
    #[error("未知 BUFF：{0}")]
    UnknownBuff(String),
    /// 构筑配置（`BuildRequest`）解析失败。
    #[error("构筑配置解析失败：{0}")]
    ConfigParse(String),
    /// 数据包模块 JSON 解析失败。
    #[error("模块数据解析失败：{0}")]
    ModulesParse(String),
    /// 目标表达式词法/语法/求值错误。
    #[error("表达式错误：{0}")]
    Expression(String),
    /// 动态 code（JS 子集）执行失败。
    #[error("动态代码执行失败：{0}")]
    CodeExec(String),
    /// 会话句柄无效（未打开、已关闭或数据包已更换）。
    #[error("构筑求值会话已失效（数据包可能已更换）")]
    InvalidSession,
    /// JSON 序列化/反序列化错误。
    #[error("JSON 错误：{0}")]
    Json(#[from] serde_json::Error),
}
