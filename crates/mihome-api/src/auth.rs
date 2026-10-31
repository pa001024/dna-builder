use std::path::{Path, PathBuf};

use serde_json::{Map, Value};
use tracing::warn;

use crate::error::MiHomeError;

/// Default auth path: `~/.config/mijia-api/auth.json` (upstream default).
pub fn default_auth_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".config").join("mijia-api").join("auth.json")
}

/// Resolve the auth path: explicit file, explicit dir (`auth.json` inside),
/// or the upstream default.
pub fn resolve_auth_path(path: Option<&Path>) -> PathBuf {
    match path {
        None => default_auth_path(),
        Some(p) if p.is_dir() => p.join("auth.json"),
        Some(p) => p.to_path_buf(),
    }
}

/// In-memory auth data + atomic persistence.
#[derive(Debug, Clone)]
pub struct AuthStore {
    pub path: PathBuf,
    data: Map<String, Value>,
}

impl AuthStore {
    /// Open the store. A missing file yields an empty (logged-out) store.
    /// A corrupt file is isolated to `auth.json.corrupt` (like the Python GUI)
    /// so the app can start and ask for a fresh QR login.
    pub fn open(path: Option<&Path>) -> Result<Self, MiHomeError> {
        let path = resolve_auth_path(path);
        let data = match std::fs::read_to_string(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Map::new(),
            Err(e) => return Err(MiHomeError::Io(e)),
            Ok(text) => match serde_json::from_str::<Value>(&text) {
                Ok(Value::Object(map)) => map,
                _ => {
                    let corrupt = path.with_file_name("auth.json.corrupt");
                    let _ = std::fs::rename(&path, &corrupt);
                    warn!(
                        "认证文件损坏已隔离为 auth.json.corrupt，请重新扫码登录: {}",
                        path.display()
                    );
                    Map::new()
                }
            },
        };
        Ok(Self { path, data })
    }

    pub fn get_str(&self, key: &str) -> Option<String> {
        self.data
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::to_string)
    }

    pub fn get_i64(&self, key: &str) -> Option<i64> {
        self.data.get(key).and_then(|v| v.as_i64())
    }

    pub fn set(&mut self, key: &str, value: Value) {
        self.data.insert(key.to_string(), value);
    }

    pub fn contains_all(&self, keys: &[&str]) -> bool {
        keys.iter().all(|k| self.data.contains_key(*k))
    }

    /// Atomic save: write sibling tmp file then rename
    pub fn save(&mut self) -> Result<(), MiHomeError> {
        use std::io::Write;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(&Value::Object(self.data.clone()))?;
        {
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(text.as_bytes())?;
            f.sync_all()?;
        }
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn save_time_ms() -> i64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}
