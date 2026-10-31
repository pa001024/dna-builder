use serde::{Deserialize, Serialize};

/// Device list entry: the minimal field set the UI needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub did: String,
    pub name: String,
    pub model: String,
    pub home_name: String,
    pub room_name: String,
    pub online: bool,
    /// Cloud-issued spec URN; empty for devices with no public spec
    /// (watches, third-party BLE gear, ...).
    #[serde(default)]
    pub spec_type: String,
}

/// One enum option with its (Chinese-preferred) description.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumOption {
    pub value: serde_json::Value,
    #[serde(default)]
    pub description: String,
}

/// One property's metadata; the control factory picks a widget from this.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropInfo {
    pub name: String,
    pub desc: String,
    /// bool / int / uint / float / string
    #[serde(rename = "type")]
    pub prop_type: String,
    pub readable: bool,
    pub writable: bool,
    /// (min, max, Option<step>) from the spec `value-range`.
    #[serde(default)]
    pub range: Option<(f64, f64, Option<f64>)>,
    #[serde(default)]
    pub value_list: Option<Vec<EnumOption>>,
    /// MIoT service this property belongs to (灯 2.1 / 风扇 4.1 ...).
    ///
    /// `siid` alone decides the group; `service` is the human label so API
    /// consumers and the UI do not have to carry a second lookup table.
    #[serde(default)]
    pub siid: i64,
    #[serde(default)]
    pub piid: i64,
    #[serde(default)]
    pub service: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionInfo {
    pub name: String,
    pub desc: String,
}

/// One MIoT service the device declares, in spec order.
///
/// This is the device's official layout: 米家 APP draws one card per service,
/// which is the only way to tell a fan light's two `on` switches (lamp vs
/// fan) apart. `siid` joins the props; `name` is already Chinese when the
/// spec (or the fallback table) provides it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub siid: i64,
    pub name: String,
    /// Service class slug (`light`, `fan`, `delay`, ...).
    #[serde(default)]
    pub class: String,
}

/// Everything the device control panel needs after opening a device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDetail {
    pub did: String,
    pub name: String,
    pub model: String,
    pub props: Vec<PropInfo>,
    pub actions: Vec<ActionInfo>,
    /// Services in spec order; only those carrying properties/actions.
    #[serde(default)]
    pub services: Vec<ServiceInfo>,
}

/// Extra per-device readings the list cards show beyond temp/humidity.
///
/// Only fields the device's spec actually declares get filled; `None` means
/// "this device has nothing to report" (not a failed read), matching the
/// `power_states` `Option` convention.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatusExtra {
    /// `air-quality` enum, resolved to its Chinese description (空气优/良/…).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub air_quality: Option<String>,
    /// Curtain/window-opener `current-position`, 0 = fully closed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<i64>,
}

/// Manual scene created in 米家 APP → 智能 → 手动控制.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneInfo {
    pub scene_id: String,
    pub name: String,
    pub home_id: String,
    #[serde(default)]
    pub home_name: String,
}

/// Speaker test shared by the audio bar and the voice entry: substring match
/// (not `xiaomi`-prefixed) so third-party speakers (`wifispeaker`) qualify.
pub fn is_speaker(device: &DeviceInfo) -> bool {
    device.model.contains("wifispeaker")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speaker_matches_third_party() {
        let d = DeviceInfo {
            did: "1".into(),
            name: "x".into(),
            model: "xiaodu.wifispeaker.x".into(),
            home_name: "家".into(),
            room_name: "客厅".into(),
            online: true,
            spec_type: String::new(),
        };
        assert!(is_speaker(&d));
    }
}
