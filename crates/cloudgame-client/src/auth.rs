//! 会话持久化 + wry 登录窗（官方登录页，完成后抓 localStorage）。

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Session {
    pub device_num: String,
    pub phone: String,
    pub phone_token: String,
    /// CSDK_ACCESS_TOKEN（也作 checklgn 的 cToken 入参）
    pub ctoken: String,
    pub access_token: String,
    pub cuid: String,
    pub cname: String,
    /// 用户昵称（getUserInfo.lg），标题栏 / 标签页显示用；缺失时退回 cName
    #[serde(default)]
    pub nickname: Option<String>,
    /// USDK_LOGIN_RESULT 原文（checklgn 响应）
    pub usdk_login_result: String,
    /// GAME_CONFIG_INTERNAL 原文（含动态 appKey → autoLogin client_id）
    pub game_config: String,
}

impl Session {
    fn path() -> PathBuf {
        let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        p.push("dna-builder");
        let _ = std::fs::create_dir_all(&p);
        p.push("cloudgame-session.json");
        p
    }

    pub fn load() -> Self {
        let p = Self::path();
        let mut s: Self = std::fs::read_to_string(&p)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        if s.device_num.is_empty() {
            s.device_num = uuid::Uuid::new_v4().to_string();
            let _ = s.save();
        }
        s
    }

    pub fn save(&self) -> Result<()> {
        std::fs::write(Self::path(), serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    /// GAME_CONFIG_INTERNAL.appKey（autoLogin 的 client_id）。
    pub fn client_id(&self) -> String {
        serde_json::from_str::<Value>(&self.game_config)
            .ok()
            .and_then(|v| v.get("appKey").and_then(Value::as_str).map(str::to_string))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| config::APP_KEY.to_string())
    }

    /// 从 USDK_LOGIN_RESULT 取字段（兼容顶层与 data 包裹两种形态）。
    fn usdk_field(&self, key: &str) -> Option<String> {
        let v: Value = serde_json::from_str(&self.usdk_login_result).ok()?;
        let d = v.get("data").unwrap_or(&v);
        d.get(key).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string)
    }

    /// 游戏内 login 用的 accessToken：官方取 `sdkLoginResult.accessToken`（USDK token），
    /// 不是本地 CSDK_ACCESS_TOKEN。缺失时退回 CSDK token（去掉误存的引号）。
    pub fn game_access_token(&self) -> String {
        self.usdk_field("accessToken")
            .unwrap_or_else(|| self.access_token.trim_matches('"').to_string())
    }
}

/// 打开 wry 登录窗加载官方云游戏页，轮询 localStorage 抓登录态。
/// `profile_id` = 该账号在会话列表里的 id：WebView2 数据目录按账号隔离并长期保留
/// （同一账号重登复用 cookie，不同账号互不影响；新账号用新 id 即全新目录）。
/// 返回 (access_token, phone, phone_token, usdk_login_result, game_config, nickname)。
pub fn login_via_webview(profile_id: Option<&str>) -> Result<(String, String, String, String, String, String)> {
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tao::platform::run_return::EventLoopExtRunReturn;
    use tao::window::WindowBuilder;
    use wry::{WebContext, WebViewBuilder};

    let profile_dir = profile_id.map(|id| {
        let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        p.push("dna-builder");
        p.push("webview-login");
        let p = p.join(id);
        let _ = std::fs::create_dir_all(&p);
        p
    });

    let mut event_loop = EventLoopBuilder::new().build();
    let window = WindowBuilder::new()
        .with_title("云·二重螺旋 - 登录")
        .with_inner_size(tao::dpi::LogicalSize::new(1024.0, 640.0))
        .build(&event_loop)?;

    let init_script = r#"
setInterval(() => {
  try {
    const tok = localStorage.getItem('CSDK_ACCESS_TOKEN');
    const cache = localStorage.getItem('LOGIN_CACHE_INTERNAL');
    const usdk = localStorage.getItem('USDK_LOGIN_RESULT');
    const gc = localStorage.getItem('GAME_CONFIG_INTERNAL');
    if (tok && cache && usdk) {
      const c = typeof cache === 'string' ? JSON.parse(cache) : cache;
      window.ipc.postMessage(JSON.stringify({
        access_token: tok,
        phone: c.phone || '',
        phone_token: c.phoneToken || '',
        // 官方 LOGIN_CACHE_INTERNAL.cName = 登录接口返回的 username（人类可读昵称，不是 Uxxx 内部 ID）
        nickname: c.cName || c.nickName || '',
        usdk_login_result: typeof usdk === 'string' ? usdk : JSON.stringify(usdk),
        game_config: typeof gc === 'string' ? gc : JSON.stringify(gc || {}),
      }));
    }
  } catch (e) {}
}, 800);
"#;

    type Login = (String, String, String, String, String, String);
    let result = std::sync::Arc::new(std::sync::Mutex::new(None::<Login>));
    let result2 = result.clone();
    let mut web_ctx = WebContext::new(profile_dir.clone());
    let webview = WebViewBuilder::new_with_web_context(&mut web_ctx)
        .with_url(config::CLOUDGAME_PAGE_URL)
        .with_initialization_script(init_script)
        .with_ipc_handler(move |req| {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(req.body()) {
                let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
                *result2.lock().unwrap() = Some((
                    get("access_token"),
                    get("phone"),
                    get("phone_token"),
                    get("usdk_login_result"),
                    get("game_config"),
                    get("nickname"),
                ));
            }
        })
        .build(&window)?;

    let result3 = result.clone();
    event_loop.run_return(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;
        if result3.lock().unwrap().is_some() {
            *control_flow = ControlFlow::Exit;
        }
        if let tao::event::Event::WindowEvent {
            event: tao::event::WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });

    let taken = result.lock().unwrap().clone();
    drop(webview);
    drop(window);
    drop(web_ctx);
    match taken {
        Some(r) if !r.0.is_empty() => Ok(r),
        _ => bail!("登录窗口被关闭，未获取到登录态"),
    }
}

/// USDK_LOGIN_RESULT（checklgn 响应）→ Session 字段。
pub fn apply_usdk_result(session: &mut Session, usdk: &str) -> Result<()> {
    let v: Value = serde_json::from_str(usdk).unwrap_or(Value::Null);
    let d = if v.get("data").is_some() { v.get("data").unwrap() } else { &v };
    let get = |k: &str| d.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let get2 = |k: &str| get(&k.to_lowercase());
    session.ctoken = {
        let t = get("cToken");
        if t.is_empty() { get2("ctoken") } else { t }
    };
    session.cuid = {
        let u = get("cUid");
        if u.is_empty() { get2("cuid") } else { u }
    };
    session.cname = {
        let n = get("cName");
        if n.is_empty() { get2("cname") } else { n }
    };
    // checklgn 响应顶层也可能是 user 对象
    if session.cuid.is_empty() {
        if let Some(u) = d.get("user") {
            session.cuid = u.get("cUid").or_else(|| u.get("uid"))
                .and_then(|x| x.as_str().map(str::to_string).or_else(|| x.as_i64().map(|n| n.to_string())))
                .unwrap_or_default();
        }
    }
    session.save().context("保存 session")?;
    Ok(())
}
