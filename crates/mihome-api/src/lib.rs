pub mod auth;
pub mod client;
pub mod crypto;
pub mod device;
pub mod error;
pub mod models;
pub mod service;
pub mod spec;
pub mod spec_zh;

pub use auth::AuthStore;
pub use client::MiHomeClient;
pub use device::{DevAction, DevProp, MiHomeDevice, PropType};
pub use error::{error_message, MiHomeError};
pub use models::{
    is_speaker, ActionInfo, DeviceDetail, DeviceInfo, EnumOption, PropInfo, SceneInfo, ServiceInfo,
    StatusExtra,
};
pub use service::{format_metrics_text, MiHomeService, ServiceError};
pub use spec::{get_device_info, SpecAction, SpecInfo, SpecProp, SpecService};

/// Upstream protocol version this crate tracks (`mijiaAPI>=5,<6`).
pub const API_TRACK: &str = "5.x";
