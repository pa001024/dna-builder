use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::debug;

use crate::error::MiHomeError;

/// Upstream cache format version (`device_info_version = 2`).
///
/// Deliberately NOT bumped for the service catalog: this cache directory is
/// shared with the Python CLI/GUI, and a version bump would make each side
/// refetch everything the other just wrote (an endless flap). The catalog is
/// gated by its own [`SERVICES_VERSION`] marker instead, which upstream
/// simply ignores.
pub const SPEC_CACHE_VERSION: i64 = 2;

/// `services[]` completeness marker: 0/absent = written before the catalog
/// existed, refetch once to fill it in.
pub const SERVICES_VERSION: i64 = 1;
const SPEC_INSTANCE_URL: &str = "https://miot-spec.org/miot-spec-v2/instance";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumItem {
    pub value: Value,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc_zh_cn: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecProp {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_type")]
    #[serde(rename = "type")]
    pub prop_type: String,
    #[serde(default)]
    pub rw: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_list: Option<Vec<EnumItem>>,
    pub siid: i64,
    pub piid: i64,
}

fn default_type() -> String {
    "string".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecAction {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub siid: i64,
    pub aiid: i64,
}

/// One MIoT service (`urn:miot-spec-v2:service:light:...`).
///
/// The instance document groups every property/action under a service, and
/// that grouping *is* the official layout: a fan light's `on-2` belongs to
/// `light` and `on-4` to `fan`. The flat `properties` list upstream keeps
/// throws that away (both become "开关"), so the grouping is retained here
/// and surfaced as `PropInfo::service`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecService {
    pub siid: i64,
    /// Service class from the URN (`light`, `fan`, `filter`, `delay`, ...).
    #[serde(default)]
    pub class: String,
    /// English description from the instance document.
    #[serde(default)]
    pub name: String,
    /// Chinese `comment`, when the spec supplies one (灯/风扇/滤芯).
    #[serde(default)]
    pub desc_zh: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpecInfo {
    pub version: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub spec_type: String,
    #[serde(default)]
    pub properties: Vec<SpecProp>,
    #[serde(default)]
    pub actions: Vec<SpecAction>,
    /// Service catalog in spec order (device-information excluded).
    #[serde(default)]
    pub services: Vec<SpecService>,
    /// See [`SERVICES_VERSION`]; 0 for files written by an older version.
    #[serde(default)]
    pub services_v: i64,
}

impl SpecInfo {
    pub fn service(&self, siid: i64) -> Option<&SpecService> {
        self.services.iter().find(|s| s.siid == siid)
    }

    /// Display label of the service owning `siid`: Chinese when known (that is
    /// what 米家 APP shows), else the English description, else the class slug.
    pub fn service_label(&self, siid: i64) -> String {
        match self.service(siid) {
            Some(s) if !s.desc_zh.is_empty() => s.desc_zh.clone(),
            Some(s) if !s.name.is_empty() => s.name.clone(),
            Some(s) => s.class.clone(),
            None => String::new(),
        }
    }
}

fn cache_file(cache_dir: &Path, spec_type: &str) -> PathBuf {
    cache_dir.join(format!("{}.json", spec_type.replace(':', "_")))
}

use std::path::PathBuf;

pub fn get_device_info(spec_type: &str, cache_dir: Option<&Path>) -> Result<SpecInfo, MiHomeError> {
    if spec_type.is_empty() {
        return Err(MiHomeError::MissingSpecType);
    }
    if let Some(dir) = cache_dir {
        let file = cache_file(dir, spec_type);
        if file.exists() {
            match std::fs::read_to_string(&file)
                .ok()
                .and_then(|t| serde_json::from_str::<SpecInfo>(&t).ok())
            {
                Some(info)
                    if info.version == SPEC_CACHE_VERSION
                        && info.services_v == SERVICES_VERSION =>
                {
                    return Ok(info)
                }
                _ => {
                    debug!("设备信息缓存损坏/版本不匹配，重新获取: {}", file.display());
                    let _ = std::fs::remove_file(&file);
                }
            }
        }
    }
    let http = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()?;
    let resp = http
        .get(SPEC_INSTANCE_URL)
        .query(&[("type", spec_type)])
        .header("User-Agent", "mijiaAPI/5.0.0")
        .send()?;
    if !resp.status().is_success() {
        return Err(MiHomeError::GetDeviceInfo(spec_type.to_string()));
    }
    let content: Value = resp.json()?;
    let description = content.get("description").and_then(|v| v.as_str());
    let services = content.get("services").and_then(|v| v.as_array());
    let (Some(_), Some(services)) = (description, services) else {
        return Err(MiHomeError::GetDeviceInfo(spec_type.to_string()));
    };

    let mut info = SpecInfo {
        version: SPEC_CACHE_VERSION,
        name: description.unwrap_or_default().to_string(),
        spec_type: spec_type.to_string(),
        properties: vec![],
        actions: vec![],
        services: vec![],
        services_v: SERVICES_VERSION,
    };
    for svc in services {
        let svc_type = svc.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if svc_type.split(':').nth(3) == Some("device-information") {
            continue;
        }
        let siid = svc.get("iid").and_then(|v| v.as_i64()).unwrap_or(0);
        // Service URNs are `urn:miot-spec-v2:service:<class>:...`; the
        // vendor-custom ones use `urn:xiaomi-spec:service:...`, same shape.
        info.services.push(SpecService {
            siid,
            class: svc_type.split(':').nth(3).unwrap_or("").to_string(),
            name: svc
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            desc_zh: svc
                .get("comment")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        });
        for prop in svc
            .get("properties")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
        {
            let piid = prop.get("iid").and_then(|v| v.as_i64()).unwrap_or(0);
            let format = prop
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("string");
            let prop_type = if format.starts_with("int") {
                "int"
            } else if format.starts_with("uint") {
                "uint"
            } else {
                format
            }
            .to_string();
            let access = prop
                .get("access")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let has = |s: &str| access.iter().any(|v| v.as_str() == Some(s));
            let rw = format!(
                "{}{}",
                if has("read") { "r" } else { "" },
                if has("write") { "w" } else { "" }
            );
            let desc = prop
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let comment = prop.get("comment").and_then(|v| v.as_str()).unwrap_or("");
            let description = if comment.is_empty() {
                desc.to_string()
            } else {
                format!("{desc} / {comment}")
            };
            let range = prop
                .get("value-range")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_f64()).collect::<Vec<_>>());
            let value_list = prop
                .get("value-list")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .map(|e| EnumItem {
                            value: e.get("value").cloned().unwrap_or(Value::Null),
                            description: e
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            desc_zh_cn: e
                                .get("comment")
                                .and_then(|v| v.as_str())
                                .map(str::to_string),
                        })
                        .collect::<Vec<_>>()
                });
            let name = prop
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .split(':')
                .nth(3)
                .unwrap_or("")
                .to_string();
            info.properties.push(SpecProp {
                name,
                description,
                prop_type,
                rw,
                range,
                value_list,
                siid,
                piid,
            });
        }
        for act in svc
            .get("actions")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
        {
            let aiid = act.get("iid").and_then(|v| v.as_i64()).unwrap_or(0);
            let desc = act
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let comment = act.get("comment").and_then(|v| v.as_str()).unwrap_or("");
            let description = if comment.is_empty() {
                desc.to_string()
            } else {
                format!("{desc} / {comment}")
            };
            let name = act
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .split(':')
                .nth(3)
                .unwrap_or("")
                .to_string();
            info.actions.push(SpecAction {
                name,
                description,
                siid,
                aiid,
            });
        }
    }

    deduplicate_prop_names(&mut info.properties);
    deduplicate_action_names(&mut info.actions);

    if let Some(dir) = cache_dir {
        let file = cache_file(dir, spec_type);
        let _ = std::fs::create_dir_all(dir);
        if let Ok(text) = serde_json::to_string_pretty(&info) {
            let _ = std::fs::write(&file, text);
            debug!("缓存设备信息到: {}", file.display());
        }
    }
    Ok(info)
}

fn count_names(names: &[String]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for n in names {
        *counts.entry(n.clone()).or_insert(0) += 1;
    }
    counts
}

fn prop_names(props: &[SpecProp]) -> Vec<String> {
    props.iter().map(|p| p.name.clone()).collect()
}

fn action_names(actions: &[SpecAction]) -> Vec<String> {
    actions.iter().map(|a| a.name.clone()).collect()
}

fn deduplicate_prop_names(props: &mut [SpecProp]) {
    let counts = count_names(&prop_names(props));
    for p in props.iter_mut() {
        if counts.get(&p.name).copied().unwrap_or(0) > 1 {
            p.name = format!("{}-{}", p.name, p.siid);
        }
    }
    let counts = count_names(&prop_names(props));
    for p in props.iter_mut() {
        if counts.get(&p.name).copied().unwrap_or(0) > 1 {
            p.name = format!("{}-{}", p.name, p.piid);
        }
    }
}

fn deduplicate_action_names(actions: &mut [SpecAction]) {
    let counts = count_names(&action_names(actions));
    for a in actions.iter_mut() {
        if counts.get(&a.name).copied().unwrap_or(0) > 1 {
            a.name = format!("{}-{}", a.name, a.siid);
        }
    }
    let counts = count_names(&action_names(actions));
    for a in actions.iter_mut() {
        if counts.get(&a.name).copied().unwrap_or(0) > 1 {
            a.name = format!("{}-{}", a.name, a.aiid);
        }
    }
}
