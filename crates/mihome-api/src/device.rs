use std::collections::HashMap;
use std::time::Duration;

use serde_json::Value;

use crate::client::MiHomeClient;
use crate::error::{error_message, MiHomeError};
use crate::spec::{EnumItem, SpecInfo, SpecProp};

/// Property value type (upstream allows exactly these five).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PropType {
    Bool,
    Int,
    UInt,
    Float,
    String,
}

impl PropType {
    pub fn parse(s: &str) -> Result<Self, MiHomeError> {
        match s {
            "bool" => Ok(Self::Bool),
            "int" => Ok(Self::Int),
            "uint" => Ok(Self::UInt),
            "float" => Ok(Self::Float),
            "string" => Ok(Self::String),
            other => Err(MiHomeError::InvalidParam(format!(
                "不支持的类型: {other}, 可选类型: bool, int, uint, float, string"
            ))),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::Int => "int",
            Self::UInt => "uint",
            Self::Float => "float",
            Self::String => "string",
        }
    }
}

/// `DevProp`.
#[derive(Debug, Clone)]
pub struct DevProp {
    pub name: String,
    pub desc: String,
    pub prop_type: PropType,
    /// Raw `rw` string, e.g. `"rw"`.
    pub rw: String,
    /// `(min, max, Option<step>)`.
    pub range: Option<(f64, f64, Option<f64>)>,
    pub value_list: Vec<EnumItem>,
    pub siid: i64,
    pub piid: i64,
    /// Display label of the owning MIoT service (灯/风扇/延时/…), resolved
    /// once at load time from [`SpecInfo::services`](crate::SpecInfo).
    pub service: String,
}

impl DevProp {
    pub fn readable(&self) -> bool {
        self.rw.contains('r')
    }
    pub fn writable(&self) -> bool {
        self.rw.contains('w')
    }

    pub fn from_spec(p: &SpecProp, service_label: &str) -> Result<Self, MiHomeError> {
        let range = p.range.as_ref().and_then(|r| {
            if r.len() >= 2 {
                Some((r[0], r[1], r.get(2).copied()))
            } else {
                None
            }
        });
        Ok(Self {
            name: p.name.clone(),
            desc: p.description.clone(),
            prop_type: PropType::parse(&p.prop_type)?,
            rw: p.rw.clone(),
            range,
            value_list: p.value_list.clone().unwrap_or_default(),
            siid: p.siid,
            piid: p.piid,
            service: service_label.to_string(),
        })
    }

    /// Returns the coerced JSON value ready to send.
    pub fn coerce(&self, value: &Value) -> Result<Value, MiHomeError> {
        let bad = |msg: String| MiHomeError::InvalidParam(msg);
        let coerced = match self.prop_type {
            PropType::Bool => match value {
                Value::Bool(b) => Value::Bool(*b),
                Value::Number(n) if n.as_i64() == Some(0) => Value::Bool(false),
                Value::Number(n) if n.as_i64() == Some(1) => Value::Bool(true),
                Value::String(s) if s.eq_ignore_ascii_case("true") => Value::Bool(true),
                Value::String(s) if s.eq_ignore_ascii_case("false") => Value::Bool(false),
                Value::String(s) if s == "0" => Value::Bool(false),
                Value::String(s) if s == "1" => Value::Bool(true),
                _ => return Err(bad(format!("无效布尔值: {value}"))),
            },
            PropType::Int | PropType::UInt => {
                let n = value
                    .as_i64()
                    .or_else(|| value.as_f64().map(|f| f as i64))
                    .or_else(|| value.as_str().and_then(|s| s.parse::<i64>().ok()))
                    .ok_or_else(|| bad(format!("无效整数值: {value}")))?;
                if self.prop_type == PropType::UInt && n < 0 {
                    return Err(bad(format!("无效值: {n} (uint 不能为负)")));
                }
                check_range_step(self, n as f64)?;
                Value::from(n)
            }
            PropType::Float => {
                let f = value
                    .as_f64()
                    .or_else(|| value.as_i64().map(|n| n as f64))
                    .or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
                    .ok_or_else(|| bad(format!("无效浮点值: {value}")))?;
                check_range_step(self, f)?;
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            }
            PropType::String => match value {
                Value::String(_) => value.clone(),
                _ => return Err(bad(format!("无效字符串值: {value}"))),
            },
        };
        if !self.value_list.is_empty() {
            let allowed: Vec<&Value> = self.value_list.iter().map(|e| &e.value).collect();
            if !allowed.iter().any(|a| value_eq(a, &coerced)) {
                return Err(bad(format!(
                    "无效值: {value}, 请使用 {:?}",
                    self.value_list
                )));
            }
        }
        Ok(coerced)
    }
}

fn value_eq(a: &Value, b: &Value) -> bool {
    match (a.as_i64(), b.as_i64()) {
        (Some(x), Some(y)) => x == y,
        _ => a == b,
    }
}

fn check_range_step(prop: &DevProp, v: f64) -> Result<(), MiHomeError> {
    if let Some((min, max, step)) = prop.range {
        if v < min || v > max {
            return Err(MiHomeError::InvalidParam(format!(
                "{v} 超出数值范围, 应该在 [{min}, {max}] 之间"
            )));
        }
        if let Some(step) = step {
            if step != 0.0 {
                let k = (v - min) / step;
                if (k - k.round()).abs() > 1e-9 {
                    return Err(MiHomeError::InvalidParam(format!(
                        "无效的值: {v}, 应该在范围 [{min}, {max}] 内且步长为 {step}"
                    )));
                }
            }
        }
    }
    Ok(())
}

/// `DevAction`.
#[derive(Debug, Clone)]
pub struct DevAction {
    pub name: String,
    pub desc: String,
    pub siid: i64,
    pub aiid: i64,
}

/// Capability snapshot + operations.
///
/// `sleep_time` mirrors the upstream 0.5s anti-rate-limit delay applied
/// after every get/set/action.
#[derive(Debug, Clone)]
pub struct MiHomeDevice {
    pub did: String,
    pub model: String,
    pub name: String,
    pub prop_list: HashMap<String, DevProp>,
    pub action_list: HashMap<String, DevAction>,
    /// Service catalog in spec order (the official layout grouping).
    pub services: Vec<crate::spec::SpecService>,
    pub sleep_time: Duration,
}

impl MiHomeDevice {
    pub fn from_spec(
        did: String,
        model: String,
        name: String,
        spec: &SpecInfo,
    ) -> Result<Self, MiHomeError> {
        let mut prop_list = HashMap::new();
        for p in &spec.properties {
            let label = spec.service_label(p.siid);
            let prop = DevProp::from_spec(p, &label)?;
            prop_list.insert(prop.name.clone(), prop.clone());
            if prop.name.contains('-') {
                prop_list.insert(prop.name.replace('-', "_"), prop);
            }
        }
        let action_list = spec
            .actions
            .iter()
            .map(|a| {
                (
                    a.name.clone(),
                    DevAction {
                        name: a.name.clone(),
                        desc: a.description.clone(),
                        siid: a.siid,
                        aiid: a.aiid,
                    },
                )
            })
            .collect();
        Ok(Self {
            did,
            model,
            name,
            prop_list,
            action_list,
            services: spec.services.clone(),
            sleep_time: Duration::from_millis(500),
        })
    }


    /// Looks the device up in the account device list (self-owned first,
    /// then the shared-device index path is handled by the caller via
    /// [`MiHomeDevice::from_spec`]), then loads its spec.
    pub fn open(
        client: &mut MiHomeClient,
        did: Option<&str>,
        dev_name: Option<&str>,
    ) -> Result<Self, MiHomeError> {
        if did.is_none() && dev_name.is_none() {
            return Err(MiHomeError::InvalidParam(
                "必须提供 did 或 dev_name 参数之一".to_string(),
            ));
        }
        let devices = client.devices_list(None)?;
        let arr = devices.as_array().cloned().unwrap_or_default();
        let get_str =
            |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        if let Some(did) = did {
            let matches: Vec<&Value> = arr.iter().filter(|d| get_str(d, "did") == did).collect();
            if matches.is_empty() {
                return Err(MiHomeError::DeviceNotFound(did.to_string()));
            }
            if matches.len() > 1 {
                return Err(MiHomeError::MultipleDevicesFound(format!(
                    "找到多个 did 为 '{did}' 的设备"
                )));
            }
            let m = matches[0];
            Self::open_for_entry(
                client,
                &get_str(m, "did"),
                &get_str(m, "model"),
                &get_str(m, "name"),
                m,
            )
        } else {
            let name = dev_name.unwrap_or("");
            let matches: Vec<&Value> = arr.iter().filter(|d| get_str(d, "name") == name).collect();
            if matches.is_empty() {
                return Err(MiHomeError::DeviceNotFound(name.to_string()));
            }
            if matches.len() > 1 {
                return Err(MiHomeError::MultipleDevicesFound(format!(
                    "找到多个 dev_name 为 '{name}' 的设备，请使用 did 参数指定具体设备或者修改设备名称以区分"
                )));
            }
            let m = matches[0];
            Self::open_for_entry(
                client,
                &get_str(m, "did"),
                &get_str(m, "model"),
                &get_str(m, "name"),
                m,
            )
        }
    }

    fn open_for_entry(
        client: &mut MiHomeClient,
        did: &str,
        model: &str,
        name: &str,
        entry: &Value,
    ) -> Result<Self, MiHomeError> {
        let spec_type = entry
            .get("spec_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut spec = client.spec_info(spec_type)?;
        // The shared-device path always ran the fallback; this one did not, so
        // untranslated specs (Apple/Google flavoured, no `comment`) reached the
        // UI as English slugs. Same fill-in for both paths now.
        crate::spec_zh::apply_fallback(&mut spec);
        let dev_name = if name.is_empty() {
            spec.name.clone()
        } else {
            name.to_string()
        };
        Self::from_spec(did.to_string(), model.to_string(), dev_name, &spec)
    }

    pub fn get(&self, client: &mut MiHomeClient, name: &str) -> Result<Value, MiHomeError> {
        let prop = self.prop_list.get(name).ok_or_else(|| {
            MiHomeError::InvalidParam(format!(
                "不支持的属性: {name}, 可用属性: {:?}",
                self.prop_keys()
            ))
        })?;
        if !prop.readable() {
            return Err(MiHomeError::InvalidParam(format!("属性 {name} 不可读取")));
        }
        let query = serde_json::json!({"did": self.did, "siid": prop.siid, "piid": prop.piid});
        let result = client.prop_get_single(&query)?;
        let code = result.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
        if code != 0 {
            return Err(MiHomeError::DeviceGet {
                dev: self.name.clone(),
                prop: name.to_string(),
                code,
                message: error_message(code).to_string(),
            });
        }
        std::thread::sleep(self.sleep_time);
        Ok(result.get("value").cloned().unwrap_or(Value::Null))
    }

    pub fn set(
        &self,
        client: &mut MiHomeClient,
        name: &str,
        value: &Value,
    ) -> Result<(), MiHomeError> {
        let prop = self.prop_list.get(name).ok_or_else(|| {
            MiHomeError::InvalidParam(format!(
                "不支持的属性: {name}, 可用属性: {:?}",
                self.prop_keys()
            ))
        })?;
        if !prop.writable() {
            return Err(MiHomeError::InvalidParam(format!("属性 {name} 不可写入")));
        }
        let coerced = prop.coerce(value)?;
        let req = serde_json::json!({"did": self.did, "siid": prop.siid, "piid": prop.piid, "value": coerced});
        let result = client.prop_set_single(&req)?;
        let code = result.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
        if code == 1 {
            tracing::warn!(
                "网关已经接收指令，无法判断是否设置成功: {} -> {name}, 值: {value}",
                self.name
            );
        } else if code != 0 {
            return Err(MiHomeError::DeviceSet {
                dev: self.name.clone(),
                prop: name.to_string(),
                code,
                message: error_message(code).to_string(),
            });
        }
        std::thread::sleep(self.sleep_time);
        Ok(())
    }

    pub fn run_action(
        &self,
        client: &mut MiHomeClient,
        name: &str,
        value: Option<Value>,
        extra: &[(String, Value)],
    ) -> Result<(), MiHomeError> {
        let act = self.action_list.get(name).ok_or_else(|| {
            MiHomeError::InvalidParam(format!(
                "不支持的动作: {name}, 可用动作: {:?}",
                self.action_list.keys().collect::<Vec<_>>()
            ))
        })?;
        let mut req = serde_json::json!({"did": self.did, "siid": act.siid, "aiid": act.aiid});
        if let Some(v) = value {
            req["value"] = v;
        }
        for (k, v) in extra {
            let key = k.strip_prefix('_').unwrap_or(k);
            if ["did", "siid", "aiid", "value"].contains(&key) {
                return Err(MiHomeError::InvalidParam(format!("无效的参数: {k}")));
            }
            req[key] = v.clone();
        }
        let result = client.action_single(&req)?;
        let code = result.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
        if code == 1 {
            tracing::warn!(
                "网关已经接收指令，无法判断是否执行成功: {} -> {name}",
                self.name
            );
        } else if code != 0 {
            return Err(MiHomeError::DeviceAction {
                dev: self.name.clone(),
                action: name.to_string(),
                code,
                message: error_message(code).to_string(),
            });
        }
        std::thread::sleep(self.sleep_time);
        Ok(())
    }

    fn prop_keys(&self) -> Vec<&str> {
        let mut keys: Vec<&str> = self.prop_list.keys().map(|s| s.as_str()).collect();
        keys.sort();
        keys
    }
}

impl std::fmt::Display for MiHomeDevice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "{} ({})", self.name, self.model)?;
        writeln!(f, "Properties:")?;
        let mut seen = std::collections::HashSet::new();
        let mut props: Vec<&DevProp> = self.prop_list.values().collect();
        props.sort_by(|a, b| a.name.cmp(&b.name));
        for p in props {
            let ptr = p as *const DevProp;
            if !seen.insert(ptr) || p.name.contains('_') {
                continue;
            }
            writeln!(f, "  {}: {}", p.name, p.desc)?;
        }
        writeln!(f, "Actions:")?;
        let mut acts: Vec<&DevAction> = self.action_list.values().collect();
        acts.sort_by(|a, b| a.name.cmp(&b.name));
        for a in acts {
            writeln!(f, "  {}: {}", a.name, a.desc)?;
        }
        Ok(())
    }
}
