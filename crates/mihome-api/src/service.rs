use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::client::{MiHomeClient, QrLoginData};
use crate::device::MiHomeDevice;
use crate::error::MiHomeError;
use crate::models::{
    ActionInfo, DeviceDetail, DeviceInfo, EnumOption, PropInfo, SceneInfo, ServiceInfo, StatusExtra,
};
use crate::spec::{get_device_info, SpecInfo};
use crate::spec_zh::{action_desc_zh, apply_fallback, prop_desc_zh};

const BATCH_SIZE: usize = 20;
const SPEC_WORKERS: usize = 8;

/// One extra-reading query: owning device, whether it is the air-quality
/// enum, and that enum's labels for resolving the raw value.
type ExtraRole = (String, bool, Vec<EnumOption>);

/// User-facing error: `.message` is shown directly.
#[derive(Debug, Clone)]
pub struct ServiceError {
    pub message: String,
}

impl ServiceError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ServiceError {}

fn wrap(err: impl std::fmt::Display, ctx: &str) -> ServiceError {
    ServiceError::new(format!("{ctx}: {err}"))
}

fn entry_str(e: &Value, key: &str) -> String {
    match e.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(v) if v.is_number() => v.to_string(),
        _ => String::new(),
    }
}

fn is_sub_device(did: &str) -> Option<u32> {
    // `<parent>.sN` suffix, N = siid of that gang.
    let (head, tail) = did.rsplit_once(".s")?;
    let _ = head;
    if tail.is_empty() || !tail.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    tail.parse::<u32>().ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumableItem {
    pub did: String,
    pub name: String,
    pub model: String,
    pub description: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub value: f64,
    pub threshold: Option<f64>,
    pub low: bool,
    pub updated: i64,
}

pub struct MiHomeService {
    client: MiHomeClient,
    device_cache: HashMap<String, MiHomeDevice>,
    /// did -> (model, spec_type, name), self-owned + shared merged.
    device_index: HashMap<String, (String, String, String)>,
    /// spec_type -> spec (`None` = confirmed missing, do not refetch).
    spec_cache: HashMap<String, Option<SpecInfo>>,
    product_page_names: HashMap<String, Option<String>>,
    icon_cache: HashMap<String, Option<String>>,
    home_ids: Option<HashMap<String, String>>,
    switch_diag_logged: HashSet<String>,
}

impl MiHomeService {
    pub fn new(auth_path: Option<&Path>) -> Result<Self, ServiceError> {
        let client = MiHomeClient::new(auth_path).map_err(|e| wrap(e, "初始化失败"))?;
        let mut svc = Self {
            client,
            device_cache: HashMap::new(),
            device_index: HashMap::new(),
            spec_cache: HashMap::new(),
            product_page_names: HashMap::new(),
            icon_cache: HashMap::new(),
            home_ids: None,
            switch_diag_logged: HashSet::new(),
        };
        svc.load_icon_cache();
        Ok(svc)
    }

    pub fn api_version() -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    fn cache_dir(&self) -> PathBuf {
        self.client.cache_dir().to_path_buf()
    }

    // ---------- login ----------

    pub fn login_status(&mut self) -> bool {
        self.client.available()
    }

    /// `None` = token refreshed, no QR needed; else the QR bundle.
    pub fn qr_login_begin(&mut self) -> Result<Option<QrLoginData>, ServiceError> {
        let data = self
            .client
            .qr_login_data()
            .map_err(|e| wrap(e, "获取登录二维码失败"))?;
        if data.refreshed {
            return Ok(None);
        }
        Ok(Some(data))
    }

    /// Long-poll for the scan (blocks up to ~2min: call off-thread).
    pub fn qr_login_wait(&mut self, data: &QrLoginData) -> Result<(), ServiceError> {
        self.client
            .complete_qr_login(data)
            .map_err(|e| wrap(e, "扫码登录未完成"))
    }

    // ---------- device list ----------

    /// All homes + shared devices with room attribution.
    pub fn list_devices(&mut self) -> Result<Vec<DeviceInfo>, ServiceError> {
        let homes = self
            .client
            .homes_list()
            .map_err(|e| wrap(e, "获取设备列表失败"))?;
        let mut devices = self
            .client
            .devices_list(None)
            .map_err(|e| wrap(e, "获取设备列表失败"))?;
        let shared = self
            .client
            .shared_devices_list()
            .map_err(|e| wrap(e, "获取设备列表失败"))?;
        if let (Some(arr), Some(extra)) = (devices.as_array_mut(), shared.as_array()) {
            arr.extend(extra.iter().cloned());
        }
        let mut location: HashMap<String, (String, String)> = HashMap::new();
        for home in homes.as_array().cloned().unwrap_or_default() {
            let home_name = entry_str(&home, "name");
            for room in home
                .get("roomlist")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
            {
                let room_name = entry_str(&room, "name");
                for did in room
                    .get("dids")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
                {
                    let did = match &did {
                        Value::String(s) => s.clone(),
                        v if v.is_number() => v.to_string(),
                        _ => continue,
                    };
                    location.insert(did, (home_name.clone(), room_name.clone()));
                }
            }
        }
        let mut out = vec![];
        for d in devices.as_array().cloned().unwrap_or_default() {
            let did = entry_str(&d, "did");
            let (home_name, room_name) = location
                .get(&did)
                .cloned()
                .unwrap_or_else(|| ("未知".to_string(), "未知".to_string()));
            out.push(DeviceInfo {
                did: did.clone(),
                name: {
                    let n = entry_str(&d, "name");
                    if n.is_empty() {
                        did
                    } else {
                        n
                    }
                },
                model: entry_str(&d, "model"),
                home_name,
                room_name,
                online: d.get("isOnline").and_then(|v| v.as_bool()).unwrap_or(false),
                spec_type: entry_str(&d, "spec_type"),
            });
        }
        out.sort_by(|a, b| {
            (&a.home_name, &a.room_name, &a.name).cmp(&(&b.home_name, &b.room_name, &b.name))
        });
        Ok(out)
    }

    // ---------- device detail / props / actions ----------

    fn get_device(&mut self, did: &str) -> Result<MiHomeDevice, ServiceError> {
        if !self.device_cache.contains_key(did) {
            if !self.device_index.contains_key(did) {
                self.refresh_device_index()?;
            }
            let entry = self.device_index.get(did).cloned().unwrap_or_default();
            if !entry.0.is_empty() && entry.1.is_empty() {
                return Err(ServiceError::new(
                    "该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板",
                ));
            }
            let dev = match MiHomeDevice::open(&mut self.client, Some(did), None) {
                Ok(dev) => dev,
                Err(MiHomeError::DeviceNotFound(_)) => self.build_shared_device(did)?,
                Err(MiHomeError::GetDeviceInfo(_)) => {
                    return Err(ServiceError::new(
                        "该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板",
                    ));
                }
                Err(e) => return Err(wrap(e, "加载设备信息失败")),
            };
            let dev = Self::patch_device_zh(dev);
            self.device_cache.insert(did.to_string(), dev);
        }
        Ok(self.device_cache.get(did).cloned().unwrap())
    }

    fn patch_device_zh(mut dev: MiHomeDevice) -> MiHomeDevice {
        for p in dev.prop_list.values_mut() {
            p.desc = prop_desc_zh(&p.name, &p.desc);
        }
        for a in dev.action_list.values_mut() {
            a.desc = action_desc_zh(&a.name, &a.desc);
        }
        dev
    }

    /// Hand-assemble a `MiHomeDevice` for shared devices (upstream's
    /// constructor only searches the self-owned list).
    fn build_shared_device(&mut self, did: &str) -> Result<MiHomeDevice, ServiceError> {
        if !self.device_index.contains_key(did) {
            self.refresh_device_index()?;
        }
        let (model, spec_type, name) = self.device_index.get(did).cloned().unwrap_or_default();
        if model.is_empty() {
            return Err(ServiceError::new(format!("未找到设备 {did}")));
        }
        if spec_type.is_empty() {
            return Err(ServiceError::new(
                "该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板",
            ));
        }
        let dir = self.cache_dir();
        let mut spec = get_device_info(&spec_type, Some(&dir)).map_err(|e| match e {
            MiHomeError::GetDeviceInfo(_) => ServiceError::new(
                "该设备无公开的功能规格（常见于仅蓝牙连接的产品），无法提供控制面板",
            ),
            other => wrap(other, "加载设备信息失败"),
        })?;
        apply_fallback(&mut spec);
        let name = if name.is_empty() {
            spec.name.clone()
        } else {
            name
        };
        MiHomeDevice::from_spec(did.to_string(), model, name, &spec)
            .map(Self::patch_device_zh)
            .map_err(|e| wrap(e, "加载设备信息失败"))
    }

    pub fn device_detail(&mut self, did: &str) -> Result<DeviceDetail, ServiceError> {
        let dev = self.get_device(did)?;
        let mut props = vec![];
        for (key, prop) in &dev.prop_list {
            // Alias keys (`-` -> `_`) point at clones in Rust: skip a `_`
            // key when its `-` twin exists (mirrors the id()-based dedup).
            if key.contains('_') && dev.prop_list.contains_key(&key.replace('_', "-")) {
                continue;
            }
            props.push(PropInfo {
                name: prop.name.clone(),
                desc: if prop.desc.is_empty() {
                    prop.name.clone()
                } else {
                    prop.desc.clone()
                },
                prop_type: prop.prop_type.as_str().to_string(),
                readable: prop.readable(),
                writable: prop.writable(),
                range: prop.range,
                value_list: if prop.value_list.is_empty() {
                    None
                } else {
                    Some(
                        prop.value_list
                            .iter()
                            .map(|e| EnumOption {
                                value: e.value.clone(),
                                description: e
                                    .desc_zh_cn
                                    .clone()
                                    .filter(|s| !s.is_empty())
                                    .unwrap_or_else(|| e.description.clone()),
                            })
                            .collect(),
                    )
                },
                siid: prop.siid,
                piid: prop.piid,
                service: prop.service.clone(),
            });
        }
        props.sort_by(|a, b| a.name.cmp(&b.name));
        let mut actions: Vec<ActionInfo> = dev
            .action_list
            .values()
            .map(|a| ActionInfo {
                name: a.name.clone(),
                desc: if a.desc.is_empty() {
                    a.name.clone()
                } else {
                    a.desc.clone()
                },
            })
            .collect();
        actions.sort_by(|a, b| a.name.cmp(&b.name));
        // Official layout: spec order, and only services that actually carry
        // something to render (specs list plenty of empty debug/factory ones).
        let mut services: Vec<ServiceInfo> = dev
            .services
            .iter()
            .filter(|s| {
                props.iter().any(|p| p.siid == s.siid)
                    || dev.action_list.values().any(|a| a.siid == s.siid)
            })
            .map(|s| ServiceInfo {
                siid: s.siid,
                name: if !s.desc_zh.is_empty() {
                    s.desc_zh.clone()
                } else if !s.name.is_empty() {
                    s.name.clone()
                } else {
                    s.class.clone()
                },
                class: s.class.clone(),
            })
            .collect();
        // A prop whose siid is not in the catalog would be unreachable in the
        // UI; give it a synthetic service so nothing silently disappears.
        for p in &props {
            if p.siid > 0 && !services.iter().any(|s| s.siid == p.siid) {
                services.push(ServiceInfo {
                    siid: p.siid,
                    name: p.service.clone(),
                    class: String::new(),
                });
            }
        }
        Ok(DeviceDetail {
            did: dev.did,
            name: dev.name,
            model: dev.model,
            props,
            actions,
            services,
        })
    }

    pub fn read_prop(&mut self, did: &str, name: &str) -> Result<Value, ServiceError> {
        let dev = self.get_device(did)?;
        dev.get(&mut self.client, name)
            .map_err(|e| wrap(e, &format!("读取属性 {name} 失败")))
    }

    /// Batch-read several props of one device in a single request.
    pub fn read_props(
        &mut self,
        did: &str,
        names: &[String],
    ) -> Result<HashMap<String, Option<Value>>, ServiceError> {
        let dev = self.get_device(did)?;
        let mut queries = vec![];
        let mut key_to_name: HashMap<(i64, i64), String> = HashMap::new();
        for name in names {
            if let Some(prop) = dev.prop_list.get(name) {
                if !prop.readable() {
                    continue;
                }
                queries.push(
                    serde_json::json!({"did": dev.did, "siid": prop.siid, "piid": prop.piid}),
                );
                key_to_name.insert((prop.siid, prop.piid), name.clone());
            }
        }
        let mut result: HashMap<String, Option<Value>> =
            key_to_name.values().map(|n| (n.clone(), None)).collect();
        for chunk in queries.chunks(BATCH_SIZE) {
            let rets = self
                .client
                .prop_get(&Value::Array(chunk.to_vec()))
                .map_err(|e| wrap(e, "批量读取属性失败"))?;
            for item in rets.as_array().cloned().unwrap_or_default() {
                let key = (
                    item.get("siid").and_then(|v| v.as_i64()).unwrap_or(-1),
                    item.get("piid").and_then(|v| v.as_i64()).unwrap_or(-1),
                );
                if let Some(name) = key_to_name.get(&key) {
                    result.insert(
                        name.clone(),
                        if item.get("code").and_then(|v| v.as_i64()) == Some(0) {
                            item.get("value").cloned()
                        } else {
                            None
                        },
                    );
                }
            }
        }
        Ok(result)
    }

    pub fn write_prop(&mut self, did: &str, name: &str, value: Value) -> Result<(), ServiceError> {
        let dev = self.get_device(did)?;
        dev.set(&mut self.client, name, &value)
            .map_err(|e| wrap(e, &format!("设置属性 {name} 失败")))
    }

    /// Speaker text actions go through the `_in` channel (mirrors
    /// `__main__.py` usage of `execute-text-directive`).
    pub fn run_action(
        &mut self,
        did: &str,
        name: &str,
        params: Option<Value>,
    ) -> Result<(), ServiceError> {
        const TEXT_ACTIONS: [&str; 4] = [
            "execute-text-directive",
            "play-text",
            "play-music",
            "play-radio",
        ];
        let dev = self.get_device(did)?;
        let mut run = |value: Option<Value>, extra: Vec<(String, Value)>| {
            dev.run_action(&mut self.client, name, value, &extra)
                .map_err(|e| wrap(e, &format!("执行动作 {name} 失败")))
        };
        if TEXT_ACTIONS.contains(&name) {
            let in_val = match params {
                Some(Value::Array(mut arr)) => {
                    if name == "execute-text-directive" && arr.len() == 1 {
                        arr.push(Value::from(0));
                    }
                    Value::Array(arr)
                }
                Some(single) if name == "execute-text-directive" => {
                    Value::Array(vec![single, Value::from(0)])
                }
                Some(single) => Value::Array(vec![single]),
                None => {
                    if name == "execute-text-directive" || name == "play-text" {
                        return Err(ServiceError::new(format!("动作 {name} 需要文本参数")));
                    }
                    return run(None, vec![]);
                }
            };
            return run(None, vec![("_in".to_string(), in_val)]);
        }
        match params {
            Some(Value::Array(arr)) => run(Some(Value::Array(arr)), vec![]),
            Some(single) => run(Some(Value::Array(vec![single])), vec![]),
            None => run(None, vec![]),
        }
    }

    // ---------- power (fast spec-direct path, no MiHomeDevice build) ----------

    pub fn power_state(&mut self, did: &str) -> Result<Option<bool>, ServiceError> {
        Ok(self.power_states(&[did.to_string()])?.remove(did).flatten())
    }

    /// Flip to the opposite of `current` (saves one cloud round-trip when
    /// the caller already knows the state).
    pub fn toggle_power(&mut self, did: &str, current: Option<bool>) -> Result<bool, ServiceError> {
        let current = match current {
            Some(c) => Some(c),
            None => self.power_state(did)?,
        };
        let current = current.ok_or_else(|| ServiceError::new("设备不支持开关控制或已离线"))?;
        let next = !current;
        self.set_power_state(did, next)?;
        Ok(next)
    }

    pub fn set_power_state(&mut self, did: &str, state: bool) -> Result<(), ServiceError> {
        let specs = self.specs_for(&[did.to_string()])?;
        let info = specs.get(did).and_then(|o| o.as_ref());
        let method = info.and_then(|i| Self::find_on_method(i, Some(did)));
        let method = method.ok_or_else(|| ServiceError::new("设备不支持开关控制"))?;
        let target = Self::switch_target(did);
        self.write_power(&target, method.0, method.1, state)
    }

    fn write_power(
        &mut self,
        did: &str,
        siid: i64,
        piid: i64,
        state: bool,
    ) -> Result<(), ServiceError> {
        let req = serde_json::json!({"did": did, "siid": siid, "piid": piid, "value": state});
        let ret = self
            .client
            .prop_set(&Value::Array(vec![req]))
            .map_err(|e| wrap(e, "设置开关状态失败"))?;
        let items = ret.as_array().cloned().unwrap_or_default();
        for item in items {
            if !item.is_object() {
                continue;
            }
            let code = item.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
            if code == 0 || code == 1 {
                continue;
            }
            let msg = item
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("未知错误");
            return Err(ServiceError::new(format!(
                "设置失败（{msg}，错误码 {code}）"
            )));
        }
        Ok(())
    }

    pub fn power_states(
        &mut self,
        dids: &[String],
    ) -> Result<HashMap<String, Option<bool>>, ServiceError> {
        let specs = self.specs_for(dids)?;
        let mut queries = vec![];
        let mut owners = vec![];
        let mut result: HashMap<String, Option<bool>> = HashMap::new();
        let mut method_of: HashMap<String, (i64, i64)> = HashMap::new();
        let mut target_of: HashMap<String, String> = HashMap::new();
        for did in dids {
            let info = specs.get(did).and_then(|o| o.as_ref());
            let method = info.and_then(|i| Self::find_on_method(i, Some(did)));
            match method {
                None => {
                    result.insert(did.clone(), None);
                    let spec_type = self
                        .device_index
                        .get(did)
                        .map(|e| e.1.clone())
                        .unwrap_or_default();
                    self.log_switch_failure(
                        did,
                        None,
                        &format!("规格无 on 属性或规格未取到（spec_type={spec_type:?}）"),
                        tracing::Level::DEBUG,
                    );
                }
                Some((siid, piid)) => {
                    method_of.insert(did.clone(), (siid, piid));
                    let target = Self::switch_target(did);
                    target_of.insert(did.clone(), target.clone());
                    queries.push(serde_json::json!({"did": target, "siid": siid, "piid": piid}));
                    owners.push(did.clone());
                }
            }
        }
        let mut failed: Vec<String> = vec![];
        for (chunk, owner_chunk) in queries.chunks(BATCH_SIZE).zip(owners.chunks(BATCH_SIZE)) {
            let rets = self
                .client
                .prop_get(&Value::Array(chunk.to_vec()))
                .map_err(|e| wrap(e, "批量读取设备状态失败"))?;
            let arr = rets.as_array().cloned().unwrap_or_default();
            let mut by_key: HashMap<(String, i64), &Value> = HashMap::new();
            for item in &arr {
                by_key.insert(
                    (
                        item.get("did")
                            .map(|v| v.to_string().trim_matches('"').to_string())
                            .unwrap_or_default(),
                        item.get("siid").and_then(|v| v.as_i64()).unwrap_or(-1),
                    ),
                    item,
                );
            }
            for (i, owner) in owner_chunk.iter().enumerate() {
                let (siid, _) = method_of[owner];
                let mut item = by_key.get(&(target_of[owner].clone(), siid)).copied();
                if item.is_none() {
                    item = arr.get(i);
                }
                match item {
                    Some(v) if v.get("code").and_then(|x| x.as_i64()) == Some(0) => {
                        let on = v.get("value").and_then(|x| x.as_bool()).unwrap_or(false);
                        result.insert(owner.clone(), Some(on));
                    }
                    // A failed read is NOT `None` (which means "confirmed no
                    // switch capability" and would drop the device from future
                    // polls forever) -- it is retried next round.
                    _ => failed.push(owner.clone()),
                }
            }
        }
        for did in &failed {
            if !result.contains_key(did) {
                self.log_switch_failure(
                    did,
                    method_of.get(did).copied(),
                    "读取失败",
                    tracing::Level::WARN,
                );
            }
        }
        Ok(result)
    }

    // ---------- virtual sub-device routing ----------

    /// Requests for `<parent>.sN` always go to the parent: the cloud answers
    /// child dids with `-704083036` after ~6s, while parent+siid takes ~50ms.
    fn switch_target(did: &str) -> String {
        match is_sub_device(did) {
            Some(_) => did
                .rsplit_once('.')
                .map(|(h, _)| h.to_string())
                .unwrap_or_else(|| did.to_string()),
            None => did.to_string(),
        }
    }

    /// Pick the writable bool `on` method, gang-aware for multi-gang panels.
    fn find_on_method(info: &SpecInfo, did: Option<&str>) -> Option<(i64, i64)> {
        let props: Vec<&crate::spec::SpecProp> = info
            .properties
            .iter()
            .filter(|p| {
                p.prop_type == "bool"
                    && p.rw.contains('w')
                    && (p.name == "on" || p.name.replace('_', "-").starts_with("on-"))
            })
            .collect();
        if props.is_empty() {
            return None;
        }
        if let Some(did) = did {
            if let Some(gang) = is_sub_device(did) {
                for p in &props {
                    if p.siid == gang as i64 {
                        return Some((p.siid, p.piid));
                    }
                }
                let idx = gang.saturating_sub(2) as usize;
                if let Some(p) = props.get(idx) {
                    return Some((p.siid, p.piid));
                }
            }
        }
        Some((props[0].siid, props[0].piid))
    }

    fn log_switch_failure(
        &mut self,
        did: &str,
        method: Option<(i64, i64)>,
        stage: &str,
        level: tracing::Level,
    ) {
        if !self.switch_diag_logged.insert(did.to_string()) {
            return;
        }
        let entry = self.device_index.get(did).cloned().unwrap_or_default();
        let (siid, piid) = method.unwrap_or((-1, -1));
        match level {
            tracing::Level::DEBUG => tracing::debug!(
                "开关状态读取失败 did={did} name={:?} model={:?} spec_type={:?} siid={siid} piid={piid} 阶段={stage}",
                entry.2, entry.0, entry.1
            ),
            _ => tracing::warn!(
                "开关状态读取失败 did={did} name={:?} model={:?} spec_type={:?} siid={siid} piid={piid} 阶段={stage}",
                entry.2, entry.0, entry.1
            ),
        }
    }

    // ---------- metrics ----------

    /// Batch temperature/humidity subtitle text (`28.3°C 60%`).
    pub fn read_metrics(
        &mut self,
        dids: &[String],
    ) -> Result<HashMap<String, Option<String>>, ServiceError> {
        let specs = self.specs_for(dids)?;
        let mut queries = vec![];
        let mut key_to_metric: HashMap<(String, i64, i64), (String, String)> = HashMap::new();
        let mut result: HashMap<String, Option<String>> = HashMap::new();
        for did in dids {
            let mut found: HashMap<String, (i64, i64)> = HashMap::new();
            if let Some(Some(info)) = specs.get(did) {
                for p in &info.properties {
                    let metric = if p.name == "temperature" {
                        Some("temperature")
                    } else if p.name == "relative-humidity" || p.name == "humidity" {
                        Some("humidity")
                    } else {
                        None
                    };
                    if let Some(m) = metric {
                        if p.rw.contains('r') && !found.contains_key(m) {
                            found.insert(m.to_string(), (p.siid, p.piid));
                        }
                    }
                }
            }
            if found.is_empty() {
                result.insert(did.clone(), None);
                continue;
            }
            for (metric, (siid, piid)) in &found {
                queries.push(serde_json::json!({"did": did, "siid": siid, "piid": piid}));
                key_to_metric.insert((did.clone(), *siid, *piid), (did.clone(), metric.clone()));
            }
        }
        let mut temps: HashMap<String, f64> = HashMap::new();
        let mut hums: HashMap<String, f64> = HashMap::new();
        for chunk in queries.chunks(BATCH_SIZE) {
            let rets = match self.client.prop_get(&Value::Array(chunk.to_vec())) {
                Ok(v) => v,
                Err(_) => return Ok(dids.iter().map(|d| (d.clone(), None)).collect()),
            };
            for item in rets.as_array().cloned().unwrap_or_default() {
                let key = (
                    item.get("did")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default(),
                    item.get("siid").and_then(|v| v.as_i64()).unwrap_or(-1),
                    item.get("piid").and_then(|v| v.as_i64()).unwrap_or(-1),
                );
                if let Some((did, metric)) = key_to_metric.get(&key) {
                    if item.get("code").and_then(|v| v.as_i64()) != Some(0) {
                        continue;
                    }
                    let f = item
                        .get("value")
                        .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|n| n as f64)));
                    if let Some(f) = f {
                        if metric == "temperature" {
                            temps.insert(did.clone(), f);
                        } else {
                            hums.insert(did.clone(), f);
                        }
                    }
                }
            }
        }
        for did in dids {
            result.insert(
                did.clone(),
                format_metrics_text(temps.get(did).copied(), hums.get(did).copied()),
            );
        }
        Ok(result)
    }

    /// Batch air-quality + curtain-position readings for the list cards.
    ///
    /// Mirrors [`Self::read_metrics`] (same batch reader, same "failed read
    /// keeps the device out of the result" rule) but for the two non-numeric
    /// signals the cards show: the `air-quality` enum and a position value.
    /// Devices whose spec declares neither are simply absent from the map.
    pub fn read_status_extras(
        &mut self,
        dids: &[String],
    ) -> Result<HashMap<String, StatusExtra>, ServiceError> {
        let specs = self.specs_for(dids)?;
        let mut queries = vec![];
        // (did, siid, piid) -> (did, is_air_quality, enum labels)
        let mut roles: HashMap<(String, i64, i64), ExtraRole> = HashMap::new();
        let mut out: HashMap<String, StatusExtra> = HashMap::new();
        for did in dids {
            let Some(Some(info)) = specs.get(did) else {
                continue;
            };
            let readable = |name: &str| {
                info.properties
                    .iter()
                    .find(|p| p.name == name && p.rw.contains('r'))
            };
            // `current-position` is the live reading; fall back to
            // `target-position` for openers that declare only the target.
            let position = readable("current-position").or_else(|| readable("target-position"));
            for (prop, is_air) in [(readable("air-quality"), true), (position, false)] {
                let Some(p) = prop else { continue };
                let labels: Vec<EnumOption> = if is_air {
                    p.value_list
                        .as_ref()
                        .map(|list| {
                            list.iter()
                                .map(|e| EnumOption {
                                    value: e.value.clone(),
                                    description: e
                                        .desc_zh_cn
                                        .clone()
                                        .filter(|s| !s.is_empty())
                                        .unwrap_or_else(|| e.description.clone()),
                                })
                                .collect()
                        })
                        .unwrap_or_default()
                } else {
                    vec![]
                };
                queries.push(serde_json::json!({"did": did, "siid": p.siid, "piid": p.piid}));
                roles.insert((did.clone(), p.siid, p.piid), (did.clone(), is_air, labels));
            }
        }
        for chunk in queries.chunks(BATCH_SIZE) {
            let rets = match self.client.prop_get(&Value::Array(chunk.to_vec())) {
                Ok(v) => v,
                // A failed batch must not blank the cards: keep whatever the
                // earlier chunks produced (the caller caches per-device).
                Err(_) => break,
            };
            for item in rets.as_array().cloned().unwrap_or_default() {
                if item.get("code").and_then(|v| v.as_i64()) != Some(0) {
                    continue;
                }
                let key = (
                    item.get("did")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default(),
                    item.get("siid").and_then(|v| v.as_i64()).unwrap_or(-1),
                    item.get("piid").and_then(|v| v.as_i64()).unwrap_or(-1),
                );
                let Some((did, is_air, labels)) = roles.get(&key) else {
                    continue;
                };
                let Some(value) = item.get("value") else {
                    continue;
                };
                let entry = out.entry(did.clone()).or_default();
                if *is_air {
                    let label = labels
                        .iter()
                        .find(|e| &e.value == value)
                        .map(|e| e.description.clone());
                    if let Some(label) = label {
                        entry.air_quality = Some(label);
                    }
                } else if let Some(n) = value.as_i64() {
                    entry.position = Some(n);
                }
            }
        }
        Ok(out)
    }

    // ---------- consumables ----------

    pub fn consumables(&mut self) -> Result<Vec<ConsumableItem>, ServiceError> {
        let raw = self
            .client
            .consumables(None)
            .map_err(|e| wrap(e, "读取耗材列表失败"))?;
        let mut out = vec![];
        for item in raw.as_array().cloned().unwrap_or_default() {
            if item
                .get("is_ignore")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                continue;
            }
            let detail = item.get("details").cloned().unwrap_or(Value::Null);
            let value = detail.get("value").and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_str()?.parse::<f64>().ok())
                    .or_else(|| v.as_i64().map(|n| n as f64))
            });
            let Some(value) = value else { continue };
            let threshold = detail
                .get("inadeq")
                .and_then(|v| v.as_str())
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .and_then(|v| v.get("val").cloned())
                .and_then(|v| {
                    v.as_f64()
                        .or_else(|| v.as_str()?.parse().ok())
                        .or_else(|| v.as_i64().map(|n| n as f64))
                });
            out.push(ConsumableItem {
                did: entry_str(&item, "did"),
                name: entry_str(&item, "name"),
                model: entry_str(&item, "model"),
                description: detail
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                type_name: detail
                    .get("type_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                value,
                threshold,
                low: threshold.map(|t| value < t).unwrap_or(false),
                updated: detail
                    .get("update_time")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
            });
        }
        Ok(out)
    }

    pub fn consumable_low_count(&mut self) -> Result<(usize, usize), ServiceError> {
        let items = self.consumables()?;
        Ok((items.len(), items.iter().filter(|i| i.low).count()))
    }

    // ---------- specs / index ----------

    fn specs_for(
        &mut self,
        dids: &[String],
    ) -> Result<HashMap<String, Option<SpecInfo>>, ServiceError> {
        if dids.iter().any(|d| !self.device_index.contains_key(d)) {
            self.refresh_device_index()?;
        }
        let mut result: HashMap<String, Option<SpecInfo>> = HashMap::new();
        let mut to_fetch: Vec<String> = vec![];
        for did in dids {
            let spec_type = self
                .device_index
                .get(did)
                .map(|e| e.1.clone())
                .unwrap_or_default();
            if spec_type.is_empty() {
                result.insert(did.clone(), None);
            } else if let Some(cached) = self.spec_cache.get(&spec_type) {
                result.insert(did.clone(), cached.clone());
            } else {
                to_fetch.push(spec_type);
            }
        }
        to_fetch.sort();
        to_fetch.dedup();
        if !to_fetch.is_empty() {
            let dir = self.cache_dir();
            let fetched: Vec<(String, Option<SpecInfo>)> = std::thread::scope(|s| {
                let mut handles = vec![];
                let chunk = to_fetch.len().div_ceil(SPEC_WORKERS);
                for part in to_fetch.chunks(chunk.max(1)) {
                    let part = part.to_vec();
                    let dir = dir.clone();
                    handles.push(s.spawn(move || {
                        part.into_iter()
                            .map(|st| {
                                let mut spec = get_device_info(&st, Some(&dir)).ok();
                                if let Some(info) = spec.as_mut() {
                                    apply_fallback(info);
                                }
                                (st, spec)
                            })
                            .collect::<Vec<_>>()
                    }));
                }
                handles
                    .into_iter()
                    .flat_map(|h| h.join().unwrap_or_default())
                    .collect()
            });
            for (spec_type, spec) in fetched {
                self.spec_cache.insert(spec_type, spec);
            }
            for did in dids {
                if !result.contains_key(did) {
                    let st = self
                        .device_index
                        .get(did)
                        .map(|e| e.1.clone())
                        .unwrap_or_default();
                    result.insert(
                        did.clone(),
                        self.spec_cache.get(&st).and_then(|o| o.clone()),
                    );
                }
            }
        }
        Ok(result)
    }

    /// Upsert merge of self-owned + shared lists (an occasionally-empty
    /// shared list must not wipe surviving entries).
    fn refresh_device_index(&mut self) -> Result<(), ServiceError> {
        let mut all = self
            .client
            .devices_list(None)
            .map_err(|e| wrap(e, "获取设备列表失败"))?;
        let shared = self
            .client
            .shared_devices_list()
            .map_err(|e| wrap(e, "获取设备列表失败"))?;
        if let (Some(arr), Some(extra)) = (all.as_array_mut(), shared.as_array()) {
            arr.extend(extra.iter().cloned());
        }
        for d in all.as_array().cloned().unwrap_or_default() {
            self.device_index.insert(
                entry_str(&d, "did"),
                (
                    entry_str(&d, "model"),
                    entry_str(&d, "spec_type"),
                    entry_str(&d, "name"),
                ),
            );
        }
        Ok(())
    }

    // ---------- scenes ----------

    fn home_ids_map(&mut self) -> Result<HashMap<String, String>, ServiceError> {
        if self.home_ids.is_none() {
            let homes = self
                .client
                .homes_list()
                .map_err(|e| wrap(e, "获取家庭列表失败"))?;
            let mut map = HashMap::new();
            for h in homes.as_array().cloned().unwrap_or_default() {
                map.insert(entry_str(&h, "name"), entry_str(&h, "id"));
            }
            self.home_ids = Some(map);
        }
        Ok(self.home_ids.clone().unwrap_or_default())
    }

    pub fn scene_list(&mut self, home_name: Option<&str>) -> Result<Vec<SceneInfo>, ServiceError> {
        let ids = self.home_ids_map()?;
        let home_id: Option<String> = match home_name {
            None => None,
            Some(name) => match ids.get(name) {
                Some(id) => Some(id.clone()),
                None => return Ok(vec![]),
            },
        };
        let scenes = self
            .client
            .scenes_list(home_id.as_deref())
            .map_err(|e| wrap(e, "获取场景列表失败"))?;
        let id_to_name: HashMap<String, String> = ids.into_iter().map(|(k, v)| (v, k)).collect();
        Ok(scenes
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|s| {
                let hid = {
                    let h = entry_str(&s, "home_id");
                    if h.is_empty() {
                        home_id.clone().unwrap_or_default()
                    } else {
                        h
                    }
                };
                SceneInfo {
                    scene_id: entry_str(&s, "scene_id"),
                    name: {
                        let n = entry_str(&s, "name");
                        if n.is_empty() {
                            "未命名场景".to_string()
                        } else {
                            n
                        }
                    },
                    home_id: hid.clone(),
                    home_name: id_to_name.get(&hid).cloned().unwrap_or_default(),
                }
            })
            .collect())
    }

    /// 小爱语音：文本指令发往指定音箱（缺省为首个在线小爱音箱）。
    pub fn speak(
        &mut self,
        text: &str,
        did: Option<&str>,
        quiet: bool,
    ) -> Result<(), ServiceError> {
        let text = text.trim().to_string();
        if text.is_empty() {
            return Err(ServiceError::new("指令文本不能为空"));
        }
        let target = match did.filter(|d| !d.is_empty()) {
            Some(d) => d.to_string(),
            None => self
                .list_devices()?
                .into_iter()
                .filter(|d| d.online && d.model.contains("wifispeaker"))
                .map(|d| d.did)
                .next()
                .ok_or_else(|| ServiceError::new("没有在线的小爱音箱"))?,
        };
        let params = serde_json::Value::Array(vec![
            serde_json::Value::String(text),
            serde_json::Value::from(if quiet { 1 } else { 0 }),
        ]);
        self.run_action(&target, "execute-text-directive", Some(params))
    }

    pub fn run_scene(&mut self, scene: &SceneInfo) -> Result<(), ServiceError> {
        let ok = self
            .client
            .run_scene(&scene.scene_id, &scene.home_id)
            .map_err(|e| wrap(e, &format!("执行场景「{}」失败", scene.name)))?;
        if !ok {
            return Err(ServiceError::new(format!("执行场景「{}」失败", scene.name)));
        }
        Ok(())
    }

    // ---------- icons ----------

    fn icon_cache_file(&self) -> PathBuf {
        self.cache_dir().join("icon_urls.json")
    }

    fn load_icon_cache(&mut self) {
        if let Ok(text) = std::fs::read_to_string(self.icon_cache_file()) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&text) {
                self.icon_cache = map.into_iter().map(|(k, v)| (k, Some(v))).collect();
            }
        }
    }

    fn save_icon_cache(&self) {
        let map: HashMap<&String, &String> = self
            .icon_cache
            .iter()
            .filter_map(|(k, v)| v.as_ref().map(|url| (k, url)))
            .collect();
        if let Ok(text) = serde_json::to_string_pretty(&map) {
            let _ = std::fs::write(self.icon_cache_file(), text);
        }
    }

    /// model -> CDN URL; only uncached models hit the network. Failures are
    /// remembered as `None` for the session (no retry storms on flaky nets).
    pub fn icon_urls(
        &mut self,
        models: &[String],
    ) -> Result<HashMap<String, String>, ServiceError> {
        if models.is_empty() {
            return Ok(HashMap::new());
        }
        let missing: Vec<String> = models
            .iter()
            .filter(|m| !self.icon_cache.contains_key(*m))
            .cloned()
            .collect();
        if !missing.is_empty() {
            for model in &missing {
                let url = self.client.icon_url(model).unwrap_or(None);
                self.icon_cache.insert(model.clone(), url);
            }
            self.save_icon_cache();
        }
        Ok(models
            .iter()
            .filter_map(|m| {
                self.icon_cache
                    .get(m)
                    .and_then(|o| o.clone())
                    .map(|u| (m.clone(), u))
            })
            .collect())
    }

    /// Download an icon into `<cache>/icons/` (cached on disk afterwards).
    pub fn icon_file(&self, model: &str, url: &str) -> Option<PathBuf> {
        let safe: String = model
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let ext = url
            .rsplit('?')
            .next()
            .unwrap_or("")
            .rsplit('.')
            .next()
            .unwrap_or("");
        let ext = if ext.len() <= 4 && ext.chars().all(|c| c.is_alphanumeric()) {
            ext
        } else {
            "png"
        };
        let path = self.cache_dir().join("icons").join(format!("{safe}.{ext}"));
        if path.exists() {
            return Some(path);
        }
        let bytes = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .ok()?
            .get(url)
            .send()
            .ok()?;
        if !bytes.status().is_success() {
            return None;
        }
        let data = bytes.bytes().ok()?;
        if data.is_empty() {
            return None;
        }
        std::fs::create_dir_all(path.parent()?).ok()?;
        std::fs::write(&path, &data).ok()?;
        Some(path)
    }

    // ---------- product names ----------

    /// Chinese product name from the miot-spec product page (for devices
    /// without a public spec). Any failure is cached as `None`: this is a
    /// display nicety that must never clog the serial job queue on retry.
    pub fn product_page_name(&mut self, model: &str) -> Option<String> {
        if let Some(cached) = self.product_page_names.get(model) {
            return cached.clone();
        }
        let name: Option<String> = (|| {
            let text = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .ok()?
                .get(format!("https://home.miot-spec.com/p/{model}"))
                .header("User-Agent", "Mozilla/5.0")
                .send()
                .ok()?;
            if !text.status().is_success() {
                return None;
            }
            let body = text.text().ok()?;
            let marker = r#"<script data-page="app" type="application/json">"#;
            let start = body.find(marker)? + marker.len();
            let end = body[start..].find("</script>")? + start;
            let data: Value = serde_json::from_str(&body[start..end]).ok()?;
            let name = data
                .get("props")?
                .get("product")?
                .get("name")?
                .as_str()?
                .to_string();
            if has_cjk(&name) {
                Some(name)
            } else {
                None
            }
        })();
        self.product_page_names
            .insert(model.to_string(), name.clone());
        name
    }

    /// dids 中确认无可控功能的设备（spec 缺失或零属性）。用于“隐藏无功能
    /// 设备”开关；全部命中缓存时不产生额外请求。
    pub fn devices_without_functions(
        &mut self,
        dids: &[String],
    ) -> Result<Vec<String>, ServiceError> {
        let specs = self.specs_for(dids)?;
        Ok(dids
            .iter()
            .filter(|did| {
                specs
                    .get(*did)
                    .and_then(|o| o.as_ref())
                    .map(|s| s.properties.is_empty())
                    .unwrap_or(true)
            })
            .cloned()
            .collect())
    }

    /// Whether the spec publishes controllable functions (`None` = not yet
    /// fetched; callers should treat as "has" until polling confirms).
    pub fn spec_has_published_functions(&self, spec_type: &str) -> Option<bool> {
        if spec_type.is_empty() {
            return Some(false);
        }
        self.spec_cache.get(spec_type).map(|o| {
            o.as_ref()
                .map(|s| !s.properties.is_empty())
                .unwrap_or(false)
        })
    }

    /// did -> spec Chinese product name, for devices whose cloud name is
    /// still the English default (reads only already-cached specs).
    pub fn localized_product_names(
        &self,
        dids: &[String],
        names: &HashMap<String, String>,
    ) -> HashMap<String, String> {
        let mut out = HashMap::new();
        for did in dids {
            let name = names.get(did).cloned().unwrap_or_default();
            if name.is_empty() || has_cjk(&name) {
                continue;
            }
            let spec_type = self
                .device_index
                .get(did)
                .map(|e| e.1.clone())
                .unwrap_or_default();
            let spec = if spec_type.is_empty() {
                None
            } else {
                self.spec_cache.get(&spec_type).and_then(|o| o.as_ref())
            };
            if let Some(spec) = spec {
                if has_cjk(&spec.name) && spec.name != name {
                    out.insert(did.clone(), spec.name.clone());
                }
            }
        }
        out
    }
}

fn has_cjk(s: &str) -> bool {
    s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// Temp/humidity subtitle (`28.3°C 60%`); `None` when both are missing.
pub fn format_metrics_text(temp: Option<f64>, hum: Option<f64>) -> Option<String> {
    let mut parts = vec![];
    if let Some(t) = temp {
        parts.push(format_temp(t));
    }
    if let Some(h) = hum {
        parts.push(format_humidity(h));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn format_temp(mut v: f64) -> String {
    if v.abs() > 60.0 {
        v /= 10.0;
    }
    format!("{v:.1}°C")
}

fn format_humidity(mut v: f64) -> String {
    if v > 100.0 {
        v /= 10.0;
    }
    format!("{v:.0}%")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_heuristic() {
        assert_eq!(
            format_metrics_text(Some(283.0), Some(683.0)).as_deref(),
            Some("28.3°C 68%")
        );
        assert_eq!(format_metrics_text(None, None), None);
    }

    #[test]
    fn sub_device_routing() {
        assert_eq!(MiHomeService::switch_target("123.s3"), "123");
        assert_eq!(MiHomeService::switch_target("123"), "123");
        assert_eq!(is_sub_device("123.s3"), Some(3));
        assert_eq!(is_sub_device("123"), None);
    }
}
