//! Source of the table:
//! <https://github.com/XiaoMi/ha_xiaomi_home/blob/main/custom_components/xiaomi_home/miot/i18n/zh-Hans.json>

use thiserror::Error;

/// Cloud `code` -> Chinese message.
pub fn error_message(code: i64) -> &'static str {
    match code {
        -10000 => "未知错误",
        -10001 => "服务不可用",
        -10002 => "参数无效",
        -10003 => "资源不足",
        -10004 => "内部错误",
        -10005 => "权限不足",
        -10006 => "执行超时",
        -10007 => "设备离线或者不存在",
        -10020 => "未授权OAuth2",
        -10030 => "无效的token（HTTP）",
        -10040 => "无效的消息格式",
        -10050 => "无效的证书",
        -704000000 => "未知错误",
        -704010000 => "未授权（设备可能被删除）",
        -704014006 => "没找到设备描述",
        -704030013 => "Property不可读",
        -704030023 => "Property不可写",
        -704030033 => "Property不可订阅",
        -704040002 => "Service不存在",
        -704040003 => "Property不存在",
        -704040004 => "Event不存在",
        -704040005 => "Action不存在",
        -704040999 => "功能未上线",
        -704042001 => "Device不存在",
        -704042011 => "设备离线",
        -704053036 => "设备操作超时",
        -704053100 => "设备在当前状态下无法执行此操作",
        -704083036 => "设备操作超时",
        -704090001 => "Device不存在",
        -704220008 => "无效的ID",
        -704220025 => "Action参数个数不匹配",
        -704220035 => "Action参数错误",
        -704220043 => "Property值错误",
        -704222034 => "Action返回值错误",
        -705004000 => "未知错误",
        -705004501 => "未知错误",
        -705201013 => "Property不可读",
        -705201015 => "Action执行错误",
        -705201023 => "Property不可写",
        -705201033 => "Property不可订阅",
        -706012000 => "未知错误",
        -706012013 => "Property不可读",
        -706012015 => "Action执行错误",
        -706012023 => "Property不可写",
        -706012033 => "Property不可订阅",
        -706012043 => "Property值错误",
        -706014006 => "没找到设备描述",
        _ => "未知错误",
    }
}

/// All failure modes of the protocol layer.
#[derive(Debug, Error)]
pub enum MiHomeError {
    #[error("登录失败 code: {code}, message: {message}")]
    Login { code: i64, message: String },
    #[error("接口失败 code: {code}, message: {message}")]
    Api { code: i64, message: String },
    #[error("未找到 did 为 '{0}' 的设备，请检查 did 是否正确")]
    DeviceNotFound(String),
    #[error("{0}")]
    MultipleDevicesFound(String),
    #[error("获取设备 '{dev}' 的属性 '{prop}' 时失败, code: {code}, message: {message}")]
    DeviceGet {
        dev: String,
        prop: String,
        code: i64,
        message: String,
    },
    #[error("设置设备 '{dev}' 的属性 '{prop}' 时失败, code: {code}, message: {message}")]
    DeviceSet {
        dev: String,
        prop: String,
        code: i64,
        message: String,
    },
    #[error("执行设备 '{dev}' 的动作 '{action}' 时失败, code: {code}, message: {message}")]
    DeviceAction {
        dev: String,
        action: String,
        code: i64,
        message: String,
    },
    #[error("获取设备规格 '{0}' 的设备信息失败")]
    GetDeviceInfo(String),
    #[error("必须提供 spec_type 参数（设备规格类型 URN），可从设备列表的 spec_type 字段获取")]
    MissingSpecType,
    #[error("HTTP 错误: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误: {0}")]
    Json(#[from] serde_json::Error),
    #[error("加密错误: {0}")]
    Crypto(String),
    #[error("参数错误: {0}")]
    InvalidParam(String),
}

impl MiHomeError {
    pub fn login(code: i64, message: impl Into<String>) -> Self {
        Self::Login {
            code,
            message: message.into(),
        }
    }
    pub fn api(code: i64, message: impl Into<String>) -> Self {
        Self::Api {
            code,
            message: message.into(),
        }
    }
}
