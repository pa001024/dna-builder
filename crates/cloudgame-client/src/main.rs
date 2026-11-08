//! 云·二重螺旋 云游戏原生客户端：登录 / 会话 / 传输 / 解码 / 自绘窗口。
// release 构建为纯 GUI 程序（无控制台窗口），debug 保留控制台便于看日志。
#![cfg_attr(all(not(debug_assertions), not(test)), windows_subsystem = "windows")]

mod api;
mod auth;
mod config;
mod control;
mod input;
mod loading;
mod media;
mod nodes;
mod probe;
mod proto;
mod render;
mod sessions;
mod sign;
mod transport;
mod ui;
mod wgc;

use std::sync::{Arc, Mutex};

/// 渲染线程命令：Attach 带上窗口句柄后建交换链；top 为顶部自绘标题栏高度。
enum RenderCmd {
    Attach { hwnd: isize, w: u32, h: u32, top: u32 },
    Resize { w: u32, h: u32, top: u32 },
    /// 覆盖层（slot 0=标题栏，1=控制中心面板）：窗口坐标 + BGRA
    Overlay { slot: u8, x: u32, y: u32, w: u32, h: u32, pixels: Vec<u8> },
    ClearOverlay { slot: u8 },
    /// 没有新视频帧时用最后一帧重画一次（断流后显示断线卡片/标题栏变化）
    Repaint,
}

use anyhow::{bail, Context, Result};
use serde_json::Value;
use winit::event::{ElementState, Event, WindowEvent};
use winit::event_loop::{ControlFlow, EventLoop};
use winit::window::{CursorGrabMode, Window};

use crate::wgc::{WgcCmd, WgcEngine, WgcEvent};

struct Frame {
    w: u32,
    h: u32,
    bgra: Vec<u8>,
}

/// 自绘标题栏物理高度（0 = 全屏）；WM_NCHITTEST 用它判断标题栏区域。
static TITLE_H: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
/// 控制中心展开时整条标题栏交给客户端（点击先关面板）。
static PANEL_OPEN_UI: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// 游戏捕获鼠标时标题栏不响应系统拖动/双击，键鼠交给游戏。
static MOUSE_CAPTURED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// --ui-preview 的测试图（BGRA）：蓝灰渐变 + 网格，便于看清视频区与标题栏的分界。
fn preview_frame(w: u32, h: u32) -> Frame {
    let mut bgra = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let o = ((y * w + x) * 4) as usize;
            let grid = if x % 120 < 2 || y % 120 < 2 { 24 } else { 0 };
            bgra[o] = (48 + (y * 90 / h) as u8).saturating_add(grid);
            bgra[o + 1] = (34 + (x * 60 / w) as u8).saturating_add(grid);
            bgra[o + 2] = (26 + (y * 30 / h) as u8).saturating_add(grid);
            bgra[o + 3] = 255;
        }
    }
    Frame { w, h, bgra }
}

/// 会话建立放到独立线程：窗口先起 loading 页，排队/连接进度通过 loading 文案反馈。
fn spawn_startup<F, Fut>(f: F)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<()>> + 'static,
{
    let handle = tokio::runtime::Handle::current();
    let _ = std::thread::Builder::new().name("startup".into()).spawn(move || {
        if let Err(e) = handle.block_on(f()) {
            tracing::error!("startup failed: {e:#}");
            loading::set_notice(&format!("启动失败：{e}"));
        }
    });
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env()
            .add_directive("cloudgame_client=info".parse().unwrap()))
        .init();
    tracing::info!("cloudgame-client starting");

    // ---------- 1. 登录态 ----------
    let argv: Vec<String> = std::env::args().collect();
    let flag = |name: &str| argv.iter().any(|a| a == name);
    let arg_value = |name: &str| argv.iter().position(|a| a == name).and_then(|i| argv.get(i + 1).cloned());

    // 重连/切号时旧进程要先退出让服务端释放实例，新进程延迟启动
    if let Some(ms) = arg_value("--delay-start").and_then(|v| v.parse::<u64>().ok()).filter(|ms| *ms <= 10_000) {
        std::thread::sleep(std::time::Duration::from_millis(ms));
    }

    let mut store = sessions::Store::load();
    let new_session = flag("--new-session");
    // --id 指定本窗口使用哪个账号（多开）；不带给上次启动的账号（store.default）
    let want_id = arg_value("--id").or_else(|| arg_value("--session"));
    let current_id: Option<String> = if new_session {
        None
    } else {
        want_id
            .filter(|id| store.get(id).is_some())
            .or_else(|| Some(store.default.clone()).filter(|id| store.get(id).is_some()))
    };
    // 记录"上次启动的账号"：下次不带 --id 时直接进这个号
    if let Some(id) = &current_id {
        if store.default != *id {
            store.default = id.clone();
            let _ = store.save();
        }
    }
    let mut session = current_id
        .as_deref()
        .and_then(|id| store.get(id))
        .map(|p| p.session.clone())
        .unwrap_or_default();
    if session.device_num.is_empty() {
        session.device_num = uuid::Uuid::new_v4().to_string();
    }
    let api = api::SdkApi::new(session.device_num.clone());

    // --probe：抓官方客户端真实协议字节
    if flag("--probe") {
        let msgs = probe::capture(&session)?;
        std::fs::write("probe-capture.json", msgs.join("\n"))?;
        tracing::info!("probe captured {} msgs -> probe-capture.json", msgs.len());
        return Ok(());
    }

    // --ui-preview：只起自绘窗口检查标题栏/控件，不连接会话
    if flag("--ui-preview") {
        let (tx, _rx) = std::sync::mpsc::channel();
        ui::init(tx.clone());
        ui::set_stream_size(1920, 1080);
        ui::set_sessions(
            vec![
                ui::SessionTab { id: "demo".into(), name: "测试账号".into() },
                ui::SessionTab { id: "demo2".into(), name: "另一个账号".into() },
            ],
            "demo".into(),
        );
        let frame = Arc::new(Mutex::new(if flag("--loading") {
            None
        } else {
            Some(preview_frame(1920, 1080))
        }));
        let (rtx, _rrx) = std::sync::mpsc::channel();
        return run_window(
            tx,
            frame,
            Arc::new(std::sync::atomic::AtomicU8::new(0)),
            Arc::new(Mutex::new((1920, 1080))),
            Arc::new(Mutex::new((1600, 860))),
            rtx,
            Arc::new(std::sync::atomic::AtomicBool::new(false)),
            tokio::sync::mpsc::unbounded_channel().0,
            sessions::Store::default(),
            // 预览模式没有真实账号：id 留空，避免 AboutToWait 的「账号已删除」检查直接退出
            String::new(),
        );
    }

    // --add-account：独立登录窗（按新 id 隔离的 webview profile），只追加账号后退出；
    // 原窗口与本账号的登录态完全不受影响
    if flag("--add-account") {
        let mut s = auth::Session::default();
        s.device_num = uuid::Uuid::new_v4().to_string();
        let id = uuid::Uuid::new_v4().to_string();
        tracing::info!("新增账号：打开独立登录窗 id={id}");
        let login = auth::login_via_webview(Some(&id));
        let (tok, phone, ptok, usdk, gc, nick) = match login {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("新增账号登录窗失败: {e:#}");
                return Err(e);
            }
        };
        s.access_token = tok.clone();
        s.ctoken = tok;
        s.phone = phone;
        s.phone_token = ptok;
        s.usdk_login_result = usdk.clone();
        s.game_config = gc;
        s.nickname = Some(nick).filter(|n| !n.is_empty() && !sessions::is_internal_name(n));
        if let Err(e) = auth::apply_usdk_result(&mut s, &usdk) {
            tracing::warn!("新增账号登录态解析失败: {e:#}");
            return Err(e);
        }
        if s.cuid.is_empty() {
            tracing::warn!("新增账号登录态解析失败: cUid 为空");
            anyhow::bail!("登录态解析失败");
        }
        // 读-改-写并保留 default：新增账号不抢占下次启动的账号
        sessions::Store::mutate(|st| {
            st.add_with_id(id.clone(), sessions::display_name(&s), s.clone());
        });
        tracing::info!("新账号已加入会话列表 id={id}");
        return Ok(());
    }

    // 官方页面每次加载都会用 LOGIN_CACHE_INTERNAL.phoneToken 静默续期：
    // autoLogin.lg → getToken.lg，其 access_token 就是云游戏 API 的 cToken（play/user 直接可用）。
    // cToken 有效期 48h（getToken.expires_in=172800），不续期会在启动时 30002。
    if current_id.is_some() && !session.phone.is_empty() && !session.phone_token.is_empty() {
        match api.auto_login(&session.phone, &session.phone_token).await {
            Ok(a) => {
                tracing::info!("登录态续期成功");
                session.ctoken = a.access_token.clone();
                session.access_token = a.access_token;
            }
            Err(e) => tracing::warn!("登录态续期失败，沿用现有 cToken: {e:#}"),
        }
    }

    // 官方登录后立即拉 user/info：ctoken 失效(30002)时清空登录态走重登，
    // 同时用 playCardEnable 决定 play.lg 的 queueType（2=畅玩卡，1=免费时长）。
    let mut user_info: Option<Value> = None;
    if current_id.is_some() && !session.ctoken.is_empty() {
        match api.user_info(&session.ctoken).await {
            Ok(v) => match as_i64(v.get("codes")) {
                Some(0) => user_info = Some(v),
                Some(30002) => {
                    tracing::warn!("登录状态已失效，需要重新登录");
                    session.access_token.clear();
                    session.ctoken.clear();
                }
                _ => tracing::warn!("user/info: {}", truncate_json(&v, 300)),
            },
            Err(e) => tracing::warn!("user/info 请求失败: {e:#}"),
        }
    }
    // 官方 startGame：playCardEnable → queueType=畅玩卡通道，否则免费时长通道
    let queue_type = if user_info.as_ref().is_some_and(|v| truthy(v.get("playCardEnable"))) {
        QUEUE_TYPE_CARD
    } else {
        QUEUE_TYPE_FREE
    };

    let mut relogin = false;
    if current_id.is_none() || session.cuid.is_empty() || session.access_token.is_empty() || session.ctoken.is_empty() {
        tracing::info!("无有效登录态，打开登录窗口");
        // 已有账号 → 用它自己的 webview profile 重登；新会话 → 先分配 id 再登录
        let login_id = current_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let (tok, phone, ptok, usdk, gc, nick) = auth::login_via_webview(Some(&login_id))?;
        session.access_token = tok.clone();
        session.ctoken = tok;
        session.phone = phone;
        session.phone_token = ptok;
        session.usdk_login_result = usdk.clone();
        session.game_config = gc;
        session.nickname = Some(nick).filter(|n| !n.is_empty() && !sessions::is_internal_name(n));
        auth::apply_usdk_result(&mut session, &usdk)?;
        relogin = true;
        if current_id.is_none() {
            // 新会话：id 在登录前已分配，下面按它入库
            store.add_with_id(login_id.clone(), sessions::display_name(&session), session.clone());
            store.default = login_id.clone();
            store.save()?;
            tracing::info!("新账号已加入会话列表 id={login_id}");
            relaunch(Some(&login_id))?;
            return Ok(());
        }
    }
    if session.cuid.is_empty() {
        tracing::error!("USDK_LOGIN_RESULT 中未解析到 cUid: {}", &session.usdk_login_result[..session.usdk_login_result.len().min(300)]);
        anyhow::bail!("登录态解析失败");
    }
    tracing::info!("登录成功 cUid={} cName={}", session.cuid, session.cname);
    if relogin {
        // tao/wry 跑过事件循环后同线程再建 winit 事件循环会静默退出(实测)，登录成功即重启自身
        if let Some(id) = &current_id {
            store.update(id, session.clone());
            store.default = id.clone();
            store.save()?;
            tracing::info!("登录态已刷新，重启进程进入会话 {id}");
            relaunch(Some(id))?;
        }
        return Ok(());
    }
    let active_id = current_id.clone().unwrap_or_default();
    if !active_id.is_empty() {
        // 刷新显示名（checklgn / 昵称可能更新）
        store.update(&active_id, session.clone());
        let _ = store.save();
    }

    // ---------- 2. init + node ----------
    let init = api.cloudgame_init().await?;
    let prod = init.pointer("/data/prod").or_else(|| init.get("prod"))
        .context("cloudgame init: no prod")?;
    let gateway = prod.get("gateWayUrl").and_then(Value::as_str).unwrap_or("").to_string();
    let tenant_key = prod.get("tenantKey").and_then(Value::as_str).unwrap_or("").to_string();
    let game_id = prod.get("gameId").and_then(Value::as_str).unwrap_or("").to_string();
    tracing::info!("init: gateway={gateway} tenant={tenant_key} game={game_id}");

    // 节点：官方在 play 之前做线路测速（租户全量线路的 WebSocket RTT），
    // 推荐模式取最小 ping；用户在控制中心选过的线路优先。测速放后台线程，
    // 避免窗口/加载页推迟出现。
    let saved_node = store.get(&active_id).map(|p| p.node.clone()).unwrap_or_default();

    // ---------- 3. wasm engine + 共享状态 ----------
    let (w, h) = (1600i64, 900i64);
    let (engine, ev) = WgcEngine::spawn()?;
    ui::init(engine.sender());
    let tabs = store
        .tabs()
        .into_iter()
        .map(|(id, name)| ui::SessionTab { id, name })
        .collect();
    ui::set_sessions(tabs, active_id.clone());
    let frame = Arc::new(Mutex::new(Option::<Frame>::None));
    let mouse_mode = std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0));
    // 游戏坐标系 = 实际码流分辨率（官方 gameWidth/gameHeight），不是握手时的请求分辨率
    let game_size = Arc::new(Mutex::new((w as u32, h as u32)));
    // 视频显示区（客户区去掉自绘标题栏），窗口缩放时同步给服务端作为出流分辨率
    let video_area = Arc::new(Mutex::new((w as u32, h as u32)));
    let (pcm_tx, pcm_rx) = std::sync::mpsc::channel::<Vec<u8>>();

    // transport 出站通道
    let (stx, srx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);
    let (dtx, drx) = tokio::sync::mpsc::channel::<Vec<u8>>(512);

    // 渲染控制通道（UI 线程 → 解码/渲染线程）
    let (rtx, rrx) = std::sync::mpsc::channel::<RenderCmd>();
    let gpu_active = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // ---------- 4. play / queue / transport（后台线程，窗口先显示 loading 页） ----------
    let ui_eng = engine.sender();
    // UI → 连接循环：进程内重连 / 换线路（不再重启进程）
    let (reconn_tx, reconn_rx) = tokio::sync::mpsc::unbounded_channel::<ReconnCmd>();
    let frame_bg = frame.clone();
    let mouse_mode_bg = mouse_mode.clone();
    let game_size_bg = game_size.clone();
    let video_area_bg = video_area.clone();
    let gpu_active_bg = gpu_active.clone();
    let startup_id = active_id.clone();
    spawn_startup(move || async move {
        let mut reconn_rx = reconn_rx;
        let frame = frame_bg;
        let mouse_mode = mouse_mode_bg;
        let game_size = game_size_bg;
        let video_area = video_area_bg;
        let gpu_active = gpu_active_bg;
        // ---------- play / queue ----------
        let (node, ping) = nodes::prepare(&tenant_key, &saved_node).await;
        let node = if node.is_empty() {
            // 租户线路表不可用时的兜底：gameDeployNode 的候选节点
            pick_node(&game_id).await.unwrap_or_default()
        } else {
            node
        };
        tracing::info!("node: {node}");
        let mut node_now = node;
        let mut play = allocate(&api, &session, &gateway, &node_now, ping.clone(), w, h, queue_type).await?;
        // 路由线程与本进程的连接循环共享：连接代际 + 本代握手上下文（重连/换线要换）
        let conn_gen = Arc::new(std::sync::atomic::AtomicU64::new(0));
        // 实例是否真正启动过（收到首帧）：官方 mIsStart，决定重连用 auth 还是仍是首次握手
        let started_once = Arc::new(std::sync::atomic::AtomicBool::new(false));
        // 服务端踢下线：实例已结束，重连按钮必须重新 play 而不是 transport 重连
        let kicked = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let conn_info = Arc::new(std::sync::Mutex::new(ConnInfo {
            gen: 0,
            first: true,
            gsm: play.gsm_token.clone(),
            uid: play.user_id.clone(),
            packed: play.packed.clone(),
            sdk: play.sdk.clone(),
        }));

        // 事件路由线程
        {
            let frame = frame.clone();
            let mouse_mode = mouse_mode.clone();
            let game_size_ev = game_size.clone();
            let video_area_ev = video_area.clone();
            let eng = engine.sender();
            let conn_gen_ev = conn_gen.clone();
            let conn_info_ev = conn_info.clone();
            let started_ev = started_once.clone();
            let kicked_ev = kicked.clone();
            let sess = session.clone();
            let gid = game_id.clone();

            // 专用解码线程:编码帧按到达顺序全解(P 帧依赖参考链)。
            // 硬解直出 DXGI 纹理 → VideoProcessor 呈现；失败则回退 CPU NV12 路径。
            // 配置项 c>=0 携带 (codec, w, h)，帧项 c=-1；at 用于统计端到端延迟。
            struct VideoItem {
                c: i32,
                w: u32,
                h: u32,
                key: bool,
                at: std::time::Instant,
                data: Vec<u8>,
            }
            let (vtx, vrx) = std::sync::mpsc::channel::<VideoItem>();
            let vq = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
            let eng_decode = engine.sender();
            {
                let frame = frame.clone();
                let vq2 = vq.clone();
                let gpu_active2 = gpu_active.clone();
                std::thread::spawn(move || {
                    let mut decoder: Option<media::MfDecoder> = None;
                    let mut codec = 1i32;
                    let mut dims = (0u32, 0u32);
                    // 官方解码 worker 的 r 门控:重建解码器后只接受关键帧，delta 期间丢掉并请求关键帧
                    let mut await_key = true;
                    let mut last_key_req = std::time::Instant::now()
                        .checked_sub(std::time::Duration::from_secs(1))
                        .unwrap_or_else(std::time::Instant::now);
                    let mut last_conv = std::time::Instant::now()
                        .checked_sub(std::time::Duration::from_secs(1))
                        .unwrap_or_else(std::time::Instant::now);
                    let mut gpu: Option<render::GpuContext> = None;
                    let mut sink: Option<render::GpuSink> = None;
                    // 交换链重建参数：ResizeBuffers 失败(常见于最大化瞬间)时整体重建
                    let mut attach: Option<(isize, u32, u32, u32)> = None;
                    let mut hw_ok = false;
                    let mut hw_failed = false;
                    // 码流级帧序检测(B 帧流的 frame_num 仍应单调；非 IDR 期望 prev+1)
                    let mut last_fn: Option<u32> = None;
                    let mut log2_fn = 8u32;
                    let mut present_errs = 0u32;
                    let mut last_present = std::time::Instant::now();
                    // 保留最近几个解码 sample：WebCodecs 的 VideoFrame 在绘制后才 close，
                    // 提前释放会让 MFT 在我们 Blt 完成前复用同一纹理槽位
                    let mut hold: Vec<windows::Win32::Media::MediaFoundation::IMFSample> = Vec::new();
                    let (mut lat_n, mut lat_sum, mut lat_max) = (0u64, 0u128, 0u128);
                    // 用 recv_timeout 而不是阻塞 for：停流后还要能处理覆盖层更新（断线卡片）
                    loop {
                        let next = match vrx.recv_timeout(std::time::Duration::from_millis(30)) {
                            Ok(it) => Some(it),
                            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => None,
                            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                        };
                        while let Ok(cmd) = rrx.try_recv() {
                            match cmd {
                                RenderCmd::Attach { hwnd, w, h, top } => {
                                    attach = Some((hwnd, w, h, top));
                                    last_present = std::time::Instant::now();
                                    if gpu.is_none() && !hw_failed {
                                        match render::create_context() {
                                            Ok(g) => gpu = Some(g),
                                            Err(e) => {
                                                tracing::warn!("D3D11 不可用，回退软解: {e:#}");
                                                hw_failed = true;
                                            }
                                        }
                                    }
                                    if let Some(g) = &gpu {
                                        match render::GpuSink::new(g, hwnd, w, h, top) {
                                            Ok(s) => sink = Some(s),
                                            Err(e) => {
                                                tracing::warn!("交换链创建失败，回退软呈现: {e:#}");
                                                hw_failed = true;
                                                sink = None;
                                            }
                                        }
                                    }
                                }
                                RenderCmd::Resize { w, h, top } => {
                                    if let Some((hwnd, _, _, _)) = attach {
                                        attach = Some((hwnd, w, h, top));
                                    }
                                    let mut failed = false;
                                    if let Some(s) = &mut sink {
                                        if let Err(e) = s.resize(w, h, top) {
                                            tracing::warn!("resize: {e:#}");
                                            failed = true;
                                        }
                                    }
                                    // ResizeBuffers 失败后交换链尺寸/视图可能处于不一致状态，
                                    // 整体重建一次（最大化/全屏时偶发 DXGI_ERROR_INVALID_CALL）
                                    if failed {
                                        if let (Some(g), Some((hwnd, _, _, _))) = (&gpu, attach) {
                                            match rebuild_swapchain(&mut sink, g, hwnd, w, h, top) {
                                                Ok(()) => tracing::info!("交换链重建 {w}x{h} top={top}"),
                                                Err(e) => tracing::warn!("交换链重建失败: {e:#}"),
                                            }
                                        }
                                    }
                                }
                                RenderCmd::Overlay { slot, x, y, w, h, pixels } => {
                                    if let Some(s) = &mut sink {
                                        s.set_overlay(slot as usize, x, y, &pixels, w, h);
                                    }
                                }
                                RenderCmd::ClearOverlay { slot } => {
                                    if let Some(s) = &mut sink {
                                        s.clear_overlay(slot as usize);
                                    }
                                }
                                RenderCmd::Repaint => {
                                    if let Some(s) = &mut sink {
                                        if let Err(e) = s.repaint() {
                                            tracing::warn!("repaint: {e:#}");
                                        }
                                    }
                                }
                            }
                        }
                        let Some(it) = next else { continue };
                        let VideoItem { c, w, h, key, at, data } = it;
                        if c >= 0 {
                            // codec 或流尺寸变了重建
                            if c != codec || (w > 0 && h > 0 && (w, h) != dims) {
                                decoder = None;
                                await_key = true;
                            }
                            codec = c;
                            if w > 0 && h > 0 { dims = (w, h); }
                        }
                        let pending = vq2.fetch_sub(1, std::sync::atomic::Ordering::Relaxed).saturating_sub(1);
                        if data.is_empty() { continue; }
                        // 官方 v_decoder_worker 的 r 门控:重建/丢流后只解关键帧，
                        // delta 一律丢掉并每 200ms 重新请求关键帧
                        if key {
                            await_key = false;
                        } else if await_key {
                            if last_key_req.elapsed() >= std::time::Duration::from_millis(200) {
                                let _ = eng_decode.send(WgcCmd::Call {
                                    name: "request_key_frame".into(),
                                    args: vec![0],
                                });
                                last_key_req = std::time::Instant::now();
                            }
                            continue;
                        }
                        // 官方在 decodeQueueSize>=15 时 flush 队列再等关键帧；
                        // 这里等价于丢弃积压(不喂缺参考帧的 delta)并重建解码器
                        if !key && pending >= 15 {
                            static FL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                            let fl = FL.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if fl < 10 || fl % 50 == 0 {
                                tracing::warn!("解码积压 {pending}，flush 等关键帧 (#{fl})");
                            }
                            decoder = None;
                            await_key = true;
                            let _ = eng_decode.send(WgcCmd::Call {
                                name: "request_key_frame".into(),
                                args: vec![0],
                            });
                            last_key_req = std::time::Instant::now();
                            continue;
                        }
                        if let Some((idr, fnum)) = media::slice_frame_num(&data, &mut log2_fn) {
                            if let Some(prev) = last_fn {
                                let mask = (1u32 << log2_fn.min(16)) - 1;
                                let expect = prev.wrapping_add(1) & mask;
                                if !idr && fnum != expect {
                                    static OO: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                    if OO.fetch_add(1, std::sync::atomic::Ordering::Relaxed) < 20 {
                                        tracing::warn!("码流帧序异常: frame_num={fnum} expect={expect} prev={prev}");
                                    }
                                }
                            }
                            last_fn = Some(fnum);
                        }
                        if decoder.is_none() {
                            let (dw, dh) = if dims.0 > 0 { dims } else { (1920, 1080) };
                            if !hw_failed {
                                if let Some(g) = &gpu {
                                    match media::MfDecoder::new_hw(codec, dw, dh, &g.device, &g.manager) {
                                        Ok(d) => decoder = Some(d),
                                        Err(e) => {
                                            tracing::warn!("硬解初始化失败，回退软解: {e:#}");
                                            hw_failed = true;
                                        }
                                    }
                                }
                            }
                            if decoder.is_none() {
                                match media::MfDecoder::new(codec, dw, dh) {
                                    Ok(d) => decoder = Some(d),
                                    Err(e) => tracing::warn!("MfDecoder::new({codec}, {dw}x{dh}): {e}"),
                                }
                            }
                        }
                        if let Some(d) = &mut decoder {
                            match d.decode(&data) {
                                Ok(frames) => {
                                    for f in frames {
                                        match f {
                                            media::VideoFrame::Texture { texture, sample, sub, coded_w, coded_h, disp_w, disp_h } => {
                                                hw_ok = true;
                                                hold.push(sample);
                                                if hold.len() > 4 {
                                                    hold.remove(0);
                                                }
                                                static TN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                                let tn = TN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                                if tn < 3 || tn % 600 == 0 {
                                                    tracing::info!("hw texture frame {tn}: {disp_w}x{disp_h} coded={coded_w}x{coded_h} pending={pending}");
                                                }
                                                // 落后时丢弃显示帧(编码帧仍全解，保参考链)，避免延迟越积越大
                                                if pending > 2 {
                                                    continue;
                                                }
                                                // 交换链看门狗：解码正常出帧却长时间没呈现成功（最大化/全屏后
                                                // 翻转链偶发失效），按当前窗口尺寸重画一张交换链
                                                if sink.is_some() && last_present.elapsed() >= std::time::Duration::from_secs(5) {
                                                    if let (Some(g), Some((hwnd, w, h, top))) = (&gpu, attach) {
                                                        tracing::warn!("画面 {:?} 未呈现，重建交换链", last_present.elapsed());
                                                        if let Err(e) = rebuild_swapchain(&mut sink, g, hwnd, w, h, top) {
                                                            tracing::warn!("看门狗重建交换链失败: {e:#}");
                                                        }
                                                    }
                                                    last_present = std::time::Instant::now();
                                                }
                                                if let Some(s) = &mut sink {
                                                    match s.present(&texture, sub, coded_w, coded_h, disp_w, disp_h) {
                                                        Ok(presented) => {
                                                            // Ok(false)=DWM 还没释放缓冲（全屏切换瞬间），
                                                            // 不算失败也不算已呈现，下一帧再试
                                                            present_errs = 0;
                                                            gpu_active2.store(true, std::sync::atomic::Ordering::Relaxed);
                                                            if presented {
                                                                last_present = std::time::Instant::now();
                                                                ui::add_frame();
                                                            }
                                                            lat_n += 1;
                                                            let us = at.elapsed().as_micros();
                                                            lat_sum += us;
                                                            lat_max = lat_max.max(us);
                                                            if lat_n % 300 == 0 {
                                                                tracing::info!("present latency: avg={}us max={}us pending={pending}",
                                                                    lat_sum / 300, lat_max);
                                                                lat_sum = 0;
                                                                lat_max = 0;
                                                            }
                                                        }
                                                        Err(e) => {
                                                            present_errs += 1;
                                                            tracing::warn!("present: {e:#}");
                                                            if present_errs >= 30 {
                                                                tracing::warn!("GPU 呈现连续失败，切回软解/软呈现");
                                                                hw_failed = true;
                                                                sink = None;
                                                                gpu_active2.store(false, std::sync::atomic::Ordering::Relaxed);
                                                                decoder = None;
                                                                await_key = true;
                                                                present_errs = 0;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            media::VideoFrame::Nv12 { w, h, data: nv12 } => {
                                                // 软解回退优先直接传 GPU 合成，避免 CPU 逐像素转换
                                                if let Some(s) = &mut sink {
                                                    match s.present_nv12(&nv12, w, h) {
                                                        Ok(true) => {
                                                            last_present = std::time::Instant::now();
                                                            gpu_active2.store(true, std::sync::atomic::Ordering::Relaxed);
                                                            ui::add_frame();
                                                            continue;
                                                        }
                                                        Ok(false) => {
                                                            // DWM 未释放缓冲，跳过这一帧
                                                            gpu_active2.store(true, std::sync::atomic::Ordering::Relaxed);
                                                            continue;
                                                        }
                                                        Err(_) => {}
                                                    }
                                                }
                                                // 纯 CPU 路径：限速转换，积压时也保证周期性出帧
                                                if pending > 0 && last_conv.elapsed() < std::time::Duration::from_millis(66) {
                                                    continue;
                                                }
                                                *frame.lock().unwrap() = Some(Frame {
                                                    w, h,
                                                    bgra: media::nv12_to_bgra(&nv12, w, h),
                                                });
                                                ui::add_frame();
                                                last_conv = std::time::Instant::now();
                                                static SHOWN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                                let sn = SHOWN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                                if sn < 3 || sn % 100 == 0 {
                                                    tracing::info!("display frame {sn}: {w}x{h}");
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    if !hw_ok && !hw_failed && gpu.is_some() {
                                        tracing::warn!("硬解输出失败，回退软解: {e:#}");
                                        hw_failed = true;
                                        decoder = None;
                                        await_key = true;
                                    } else {
                                        static EN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                                        if EN.fetch_add(1, std::sync::atomic::Ordering::Relaxed) < 5 {
                                            tracing::warn!("MfDecoder::decode: {e:#}");
                                        }
                                        // 对应 WebCodecs decode() 抛错：重建并等关键帧
                                        decoder = None;
                                        await_key = true;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // roleReport 里要写回当前账号的昵称
            let report_id = startup_id.clone();
            std::thread::spawn(move || {
                // 官方在 GameRestart 后 ~2s(画面恢复)重发 initData/login
                let mut restart_at: Option<std::time::Instant> = None;
                // 连接代际：每次（重）连接 +1；protoVersion 每代只答一次，首帧每代重做
                let mut hs_gen: Option<u64> = None;
                let mut ff_gen: Option<u64> = None;
                // GameRestart 事件的 loading 状态：等新实例关键帧到达再清除
                let mut restart_since: Option<std::time::Instant> = None;
                for e in ev {
                    let gen_now = conn_gen_ev.load(std::sync::atomic::Ordering::Relaxed);
                    match e {
                        WgcEvent::StreamSend(d) => {
                            tracing::info!("wt stream send {}b: {}", d.len(), base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &d[..d.len().min(120)]));
                            // 断开期间没有消费者：用 try_send，绝不能阻塞路由器线程
                            let _ = stx.try_send(d);
                        }
                        WgcEvent::DatagramSend(d) => { let _ = dtx.try_send(d); }
                        WgcEvent::VideoConfig { codec: c, width: w, height: h } => {
                            tracing::info!("on_video_config codec={c} {w}x{h}");
                            update_game_size(&game_size_ev, w as u32, h as u32);
                            ui::set_stream_size(w as u32, h as u32);
                            vq.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            let _ = vtx.send(VideoItem {
                                c,
                                w: w as u32,
                                h: h as u32,
                                key: false,
                                at: std::time::Instant::now(),
                                data: vec![],
                            });
                        }
                        WgcEvent::Video { key, data } => {
                            // 每代连接的第一帧：官方 6038 → intercept_app + initData/login + 心跳
                            if ff_gen != Some(gen_now) {
                                ff_gen = Some(gen_now);
                                tracing::info!("first video frame (gen {gen_now}) -> intercept_app+initData/login+hb");
                                started_ev.store(true, std::sync::atomic::Ordering::Relaxed);
                                ui::mark_connected();
                                ui::set_restart_loading(false);
                                restart_since = None;
                                on_first_frame(&eng, &sess, gid.clone());
                                send_stream_controls(&eng, &video_area_ev);
                            }
                            // GameRestart（游戏更新/重启）：新实例的关键帧到达才结束 loading
                            if let Some(t0) = restart_since {
                                if key && t0.elapsed() >= std::time::Duration::from_millis(500) {
                                    tracing::info!("GameRestart 新画面到达，退出 loading");
                                    restart_since = None;
                                    ui::set_restart_loading(false);
                                }
                            }
                            if let Some(t0) = restart_at {
                                if t0.elapsed() >= std::time::Duration::from_secs(2) {
                                    tracing::info!("游戏重启后重发 initData/login");
                                    send_game_msgs_tx(&eng, &sess, gid.clone());
                                    send_stream_controls(&eng, &video_area_ev);
                                    restart_at = None;
                                }
                            }
                            static VN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                            let vc = VN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if vc % 300 == 0 { tracing::info!("on_video {vc}: key={key} {}b", data.len()); }
                            vq.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            let _ = vtx.send(VideoItem {
                                c: -1,
                                w: 0,
                                h: 0,
                                key,
                                at: std::time::Instant::now(),
                                data,
                            });
                        }
                        WgcEvent::Audio { data } => {
                            static AN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                            let ac = AN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            if ac < 5 || ac % 500 == 0 {
                                tracing::info!("on_audio {ac}: {}b", data.len());
                            }
                            let _ = pcm_tx.send(data);
                        }
                        WgcEvent::Message { kind, a, b, .. } => {
                            if kind == 99 {
                                if let Some(cmd) = proto::SimpleCmd::decode(&a) {
                                    if cmd.cmd == "GameRestart" || cmd.cmd == "GameRestartV2" {
                                        // 游戏更新/重启：先切回 loading 页（画面会停在新实例首帧之前），
                                        // 新实例关键帧到达后由 Video 分支清除；~2s 后重发 initData/login
                                        tracing::info!("GameRestart -> loading + 首帧后重发 initData/login");
                                        restart_at = Some(std::time::Instant::now());
                                        restart_since = Some(std::time::Instant::now());
                                        ui::set_restart_loading(true);
                                    }
                                    if cmd.cmd != "RTCStatusReport" {
                                        tracing::info!("SimpleCmd cmd={} arg={} arg1={} arg2={} data_len={}",
                                            cmd.cmd, &cmd.arg[..cmd.arg.len().min(400)],
                                            &cmd.arg1[..cmd.arg1.len().min(80)],
                                            &cmd.arg2[..cmd.arg2.len().min(60)], cmd.data.len());
                                    }
                                    if cmd.cmd == "OnCursorData" {
                                        // 游戏驱动鼠标模式:hide=相对(捕获),show=绝对(释放+显示)
                                        let mode = if cmd.arg == "hide" { 1u8 } else { 0u8 };
                                        mouse_mode.store(mode, std::sync::atomic::Ordering::Relaxed);
                                    }
                                    if cmd.cmd == "protoVersion" {
                                        // 官方 h.by 单次守卫按“每次连接”重置：重连要重新握手
                                        let (info_gen, info) = {
                                            let g = conn_info_ev.lock().unwrap();
                                            (g.gen, g.clone())
                                        };
                                        if hs_gen != Some(info_gen) {
                                            hs_gen = Some(info_gen);
                                            if info.first {
                                                tracing::info!("protoVersion -> LocalIm+PackedData+ChannelType (gen {info_gen})");
                                                send_session_msgs(&eng, &info.gsm, &info.uid, &info.packed, &info.sdk, &sess.device_num);
                                            } else {
                                                tracing::info!("protoVersion -> LocalIm+auth+authV2+ChannelType (reconnect gen {info_gen})");
                                                send_reconnect_msgs(&eng, &info.gsm, &info.uid);
                                            }
                                        }
                                    }
                                    if cmd.cmd == "BusinessData" {
                                        // 官方:收到 BusinessData 末尾必回 BusinessDataConfirm(arg)
                                        let c = proto::SimpleCmd { cmd: "BusinessDataConfirm".into(), arg: cmd.arg.clone(), ..Default::default() };
                                        let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: c.encode() });
                                        // 游戏业务数据（官方 messageDetail BusinessData → onGameData）：
                                        // openBrowser / roleReport 等都走 data 字段（base64url JSON）
                                        tracing::info!("BusinessData arg={:?} data={:?}",
                                            &cmd.arg[..cmd.arg.len().min(120)],
                                            String::from_utf8_lossy(&cmd.data[..cmd.data.len().min(400)]));
                                        match decode_business(&cmd.data)
                                            .or_else(|| decode_game_msg(cmd.arg.as_bytes()))
                                            .or_else(|| decode_game_msg(cmd.arg1.as_bytes()))
                                            .or_else(|| decode_game_msg(cmd.arg2.as_bytes()))
                                        {
                                            Some(v) => handle_game_data(&v, &report_id),
                                            None => tracing::warn!(
                                                "BusinessData 游戏数据解码失败 head={:?}",
                                                String::from_utf8_lossy(&cmd.data[..cmd.data.len().min(120)])
                                            ),
                                        }
                                    }
                                    if cmd.cmd == "BitrateChange" {
                                        // 服务端切分辨率后游戏坐标系跟着变（官方 configs.gameWidth/gameHeight = arg2）
                                        if let Some((gw, gh)) = parse_wxh(&cmd.arg2) {
                                            update_game_size(&game_size_ev, gw, gh);
                                            ui::set_stream_size(gw, gh);
                                        }
                                    }
                                    if cmd.cmd == "回测延时" {
                                        // 官方 WelinkHeartBeat 回包：timeDelay → networkDelay
                                        ui::heartbeat_recv();
                                    }
                                    if cmd.cmd == "GSProxyHeartbeat" {
                                        // 官方 gsProxyHeartBeat 回包：3s 内没再来即判定服务端失联
                                        ui::gs_beat_recv();
                                    }
                                    if is_kick_cmd(&cmd.cmd) {
                                        let (code, msg) = kick_code_msg(&cmd);
                                        tracing::warn!("服务端踢下线 cmd={} code={code} msg={msg}", cmd.cmd);
                                        kicked_ev.store(true, std::sync::atomic::Ordering::Relaxed);
                                        ui::set_restart_loading(false);
                                        ui::set_conn(ui::Conn::Lost, &kick_message(&code, &msg));
                                    }
                                }
                            } else {
                                tracing::info!("wgc msg kind={kind} a={:?} b={:?}",
                                    String::from_utf8_lossy(&a).chars().take(400).collect::<String>(),
                                    String::from_utf8_lossy(&b).chars().take(200).collect::<String>());
                                // 游戏 → 客户端数据（官方 onGameData）：a/b 任一可能是 base64url(JSON)
                                match decode_game_msg(&a).or_else(|| decode_game_msg(&b)) {
                                    Some(v) => handle_game_data(&v, &report_id),
                                    None => tracing::warn!("kind={kind} 游戏数据解码失败"),
                                }
                            }
                        }
                        WgcEvent::RequestKeyframe => {
                            let _ = eng.send(WgcCmd::Call { name: "request_key_frame".into(), args: vec![0] });
                        }
                        WgcEvent::Log { level, text } => {
                            match level { 2 | 3 => tracing::warn!("[wgc] {text}"), _ => tracing::info!("[wgc] {text}") }
                        }
                        _ => {}
                    }
                }
            });
        }

        // 音频输出
        audio_out(pcm_rx);

        // WelinkHeartBeat(测延时):官方 onDataChannelOpen 起每 2s（跨重连常驻）
        welink_heartbeat(&engine.sender());

        // ---------- 连接循环：首次连接 / 进程内重连 / 换线路（不重启进程） ----------
        let mut gen: u64 = 0;
        let mut first_mode = true;
        let mut srx = srx;
        let mut drx = drx;
        loop {
            {
                let mut ci = conn_info.lock().unwrap();
                *ci = ConnInfo {
                    gen,
                    first: first_mode,
                    gsm: play.gsm_token.clone(),
                    uid: play.user_id.clone(),
                    packed: play.packed.clone(),
                    sdk: play.sdk.clone(),
                };
            }
            conn_gen.store(gen, std::sync::atomic::Ordering::SeqCst);
            let mut cmd: Option<ReconnCmd> = None;
            {
                let (cs_tx, cs_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);
                let (cd_tx, cd_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(512);
                let eng_c = engine.sender();
                let (h2, p2, ch2) = (play.gs_ip.clone(), play.port, play.hashes.clone());
                let mut task = tokio::spawn(async move {
                    transport::connect(&h2, p2, ch2, eng_c, cs_rx, cd_rx).await
                });
                engine.send(WgcCmd::OpenSession { sid: 0, video_codec: config::VIDEO_CODEC, audio_codec: 1 });
                let params = serde_json::json!({
                    "auth": { "token": play.gsm_token, "uid": play.user_id, "transport-protocol": 1 },
                    "game_info": {},
                }).to_string();
                engine.send(WgcCmd::OnConnected { sid: 0, params_json: params });

                loop {
                    tokio::select! {
                        r = &mut task => {
                            match r {
                                Ok(Ok(())) => tracing::info!("transport closed (gen {gen})"),
                                Ok(Err(e)) => tracing::error!("transport: {e:#}"),
                                Err(e) => tracing::warn!("transport task: {e}"),
                            }
                            break;
                        }
                        Some(b) = srx.recv() => { let _ = cs_tx.send(b).await; }
                        Some(b) = drx.recv() => { let _ = cd_tx.send(b).await; }
                        c = reconn_rx.recv() => {
                            cmd = c;
                            task.abort();
                            let _ = task.await;
                            break;
                        }
                    }
                }
                drop(cs_tx);
                drop(cd_tx);
            }
            // 官方顺序：close_session → on_disconnect
            let _ = engine.send(WgcCmd::CloseSession { sid: 0 });
            let _ = engine.send(WgcCmd::OnDisconnect { sid: 0 });
            ui::set_restart_loading(false);

            // 指令：重连原实例 / 换线路重新分配；连接自然结束时显示断线卡片并等用户操作
            let mut switch: Option<String> = match cmd {
                Some(ReconnCmd::Reconnect) => {
                    if kicked.swap(false, std::sync::atomic::Ordering::Relaxed) {
                        // 被踢下线的实例已经结束：重新 play 分配，而不是 transport 重连
                        Some(node_now.clone())
                    } else {
                        tracing::info!("进程内重连（gen {gen} -> {}）", gen + 1);
                        gen += 1;
                        // 实例真正启动过（出过首帧）才走 auth 重连；否则仍是首次握手
                        first_mode = !started_once.load(std::sync::atomic::Ordering::Relaxed);
                        ui::set_restart_loading(true);
                        ui::set_conn(ui::Conn::Connecting, "");
                        continue;
                    }
                }
                Some(ReconnCmd::SwitchNode(n)) => Some(n),
                None => {
                    if ui::conn() != ui::Conn::Lost {
                        ui::set_conn(ui::Conn::Lost, "网络连接已断开，请重新连接");
                    }
                    None
                }
            };
            // 等用户指令（断线卡片「重新连接」或控制中心切线路）
            loop {
                if let Some(n) = switch.take() {
                    node_now = n.clone();
                    ui::set_restart_loading(true);
                    ui::set_conn(ui::Conn::Connecting, "");
                    match allocate(&api, &session, &gateway, &node_now, ping.clone(), w, h, queue_type).await {
                        Ok(p) => {
                            play = p;
                            gen += 1;
                            first_mode = true;
                            break;
                        }
                        Err(e) => {
                            tracing::error!("换线路重新分配失败: {e:#}");
                            ui::set_restart_loading(false);
                            ui::set_conn(ui::Conn::Lost, &format!("切换线路失败：{e}"));
                        }
                    }
                }
                match reconn_rx.recv().await {
                    Some(ReconnCmd::Reconnect) => {
                        if kicked.swap(false, std::sync::atomic::Ordering::Relaxed) {
                            switch = Some(node_now.clone());
                            continue;
                        }
                        tracing::info!("手动重连（gen {gen} -> {}）", gen + 1);
                        gen += 1;
                        first_mode = !started_once.load(std::sync::atomic::Ordering::Relaxed);
                        ui::set_restart_loading(true);
                        ui::set_conn(ui::Conn::Connecting, "");
                        break;
                    }
                    Some(ReconnCmd::SwitchNode(n)) => switch = Some(n),
                    None => return Ok(()),
                }
            }
        }

        #[allow(unreachable_code)]
        Ok(())
    });

    // ---------- 5. 窗口 + 输入 + 渲染 ----------
    run_window(ui_eng, frame, mouse_mode, game_size, video_area, rtx, gpu_active, reconn_tx, store, active_id)
}

/// 启动独立进程做「新增账号」登录（按新 id 隔离 webview profile），原窗口保持不动。
fn spawn_add_account() -> Result<std::process::Child> {
    let exe = std::env::current_exe()?;
    let mut args = forward_args();
    args.push("--add-account".into());
    Ok(std::process::Command::new(exe).args(args).spawn()?)
}

/// 用 `--id` 启动另一个账号的窗口：两个账号同时在线，不结束当前进程/会话。
fn spawn_profile(id: &str) -> Result<std::process::Child> {
    let exe = std::env::current_exe()?;
    let mut args = forward_args();
    args.push("--id".into());
    args.push(id.to_string());
    Ok(std::process::Command::new(exe).args(args).spawn()?)
}

/// 透传与账号无关的启动参数（去掉本进程的 --id/--session/--new-session/--add-account）。
fn forward_args() -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "--id" | "--session" | "--delay-start" => {
                let _ = it.next();
            }
            "--new-session" | "--add-account" | "--ui-preview" => {}
            _ => args.push(a),
        }
    }
    args
}

/// 以指定账号重启自身（重新 play/连接）：Some(id)=该账号，None=新建会话（先登录）。
fn relaunch(session: Option<&str>) -> Result<()> {
    relaunch_after(session, 0)
}

fn relaunch_after(session: Option<&str>, delay_ms: u64) -> Result<()> {
    let exe = std::env::current_exe()?;
    let mut args = forward_args();
    match session {
        Some(id) => {
            args.push("--id".into());
            args.push(id.to_string());
        }
        None => args.push("--new-session".into()),
    }
    if delay_ms > 0 {
        args.push("--delay-start".into());
        args.push(delay_ms.to_string());
    }
    std::process::Command::new(exe).args(args).spawn()?;
    Ok(())
}

async fn pick_node(game_id: &str) -> Result<String> {
    // gameId 编码 = instanceId(前 len-6) + 末 6 位去前导零
    let (instance_id, tail) = game_id.split_at(game_id.len() - 6);
    let gid = tail.trim_start_matches('0');
    let url = format!("{}/gameDeployNode/{instance_id}/{gid}.html", config::NODE_CONFIG_BASE);
    let v: Value = reqwest::get(&url).await?.json().await?;
    let id = v.pointer("/nodeList/0").and_then(Value::as_str).unwrap_or("").to_string();
    if id.is_empty() {
        tracing::warn!("nodeList 为空: {}", &v.to_string()[..v.to_string().len().min(300)]);
    }
    Ok(id)
}


/// 服务端主动断开（官方 Offline/GameExit/踢下线 及 V2 变体）。
fn is_kick_cmd(cmd: &str) -> bool {
    matches!(cmd, "Offline" | "GameExit" | "踢下线" | "OfflineV2" | "GameExitV2")
}

/// v1 `arg="<code>-<msg>"`；v2 `arg=code, arg1=msg`。
fn kick_code_msg(cmd: &proto::SimpleCmd) -> (String, String) {
    if cmd.cmd.ends_with("V2") {
        return (cmd.arg.clone(), cmd.arg1.clone());
    }
    match cmd.arg.split_once('-') {
        Some((c, m)) => (c.to_string(), m.to_string()),
        None => (cmd.arg.clone(), String::new()),
    }
}

fn kick_message(code: &str, msg: &str) -> String {
    match code {
        "1003" => "游戏时长或畅玩卡已耗尽，连接已断开".into(),
        "1020" => "由于长时间未操作，连接已断开".into(),
        _ if !msg.is_empty() => format!("云游戏连接已中断：{msg}"),
        _ => "云游戏连接已中断，请检查网络后重新连接".into(),
    }
}

/// 官方 `handleLink`：游戏内活动等链接交给系统默认浏览器打开。
fn open_in_browser(url: &str) {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let op = HSTRING::from("open");
    let target = HSTRING::from(url);
    unsafe {
        ShellExecuteW(None, &op, &target, None, None, SW_SHOWNORMAL);
    }
}

/// 游戏 → 客户端消息（官方 onGameData）：roleReport / openBrowser / keyboardInput 等。
fn handle_game_data(v: &Value, report_id: &str) {
    let ty = v.get("type").and_then(Value::as_str).unwrap_or("");
    tracing::info!("game data: {}", v.to_string().chars().take(600).collect::<String>());
    match ty {
        "roleReport" => {
            let d = v.get("data").unwrap_or(&Value::Null);
            if let Some(name) = d.get("roleName").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                tracing::info!("roleReport roleName={name}");
                sessions::Store::mutate(|st| {
                    if let Some(p) = st.get_mut(report_id) {
                        p.name = name.to_string();
                    }
                });
            }
        }
        // 官方 handleLink：{type:"openBrowser",plat:"pcWeb",data:{url}}
        "openBrowser" => {
            let plat = v.get("plat").and_then(Value::as_str).unwrap_or("");
            let url = v.get("data").and_then(|d| d.get("url")).and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .or_else(|| v.get("url").and_then(Value::as_str))
                .or_else(|| v.get("data").and_then(Value::as_str));
            match url {
                Some(url) if plat == "pcWeb" || plat.is_empty() => {
                    tracing::info!("openBrowser {url}");
                    open_in_browser(url);
                }
                Some(url) => tracing::warn!("openBrowser 非 pcWeb 平台 plat={plat} url={url}"),
                None => tracing::warn!("openBrowser 无 url: {v}"),
            }
        }
        _ => {}
    }
}

/// BusinessData.data 有两种形态：base64url(JSON) 文本，或嵌套的 SimpleCmd 二进制
/// （官方 `Qm(data)` 反序列化后再取字段，见 welink `messageDetail` 的 BusinessData 分支）。
fn decode_business(raw: &[u8]) -> Option<Value> {
    if let Some(v) = decode_game_msg(raw) {
        return Some(v);
    }
    let inner = proto::SimpleCmd::decode(raw)?;
    for f in [&inner.arg, &inner.arg1, &inner.arg2] {
        if let Some(v) = decode_game_msg(f.as_bytes()) {
            return Some(v);
        }
    }
    decode_game_msg(&inner.data)
}

/// 游戏 → 客户端数据：base64url(JSON) 文本或直接 JSON 字节。官方 `JU` = 去空白 →
/// `-_` 换 `+/` → 去非 base64 字符 → base64 → utf8。
fn decode_game_msg(raw: &[u8]) -> Option<Value> {
    if raw.is_empty() {
        return None;
    }
    if let Ok(v) = serde_json::from_slice::<Value>(raw) {
        return Some(v);
    }
    use base64::Engine;
    let text = String::from_utf8_lossy(raw);
    let b64: String = text
        .chars()
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    if b64.len() < 4 {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(std_padded(&b64)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn std_padded(s: &str) -> String {
    let mut out = s.to_string();
    while out.len() % 4 != 0 {
        out.push('=');
    }
    out
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn queue_form(token: &str) -> reqwest::multipart::Form {
    reqwest::multipart::Form::new()
        .text("token", token.to_string())
        .text("requestId", uuid::Uuid::new_v4().to_string())
        .text("requestTime", now_ms().to_string())
}

async fn cancel_queue(http: &reqwest::Client, url: &str, token: &str) {
    match http.post(url).multipart(queue_form(token)).send().await {
        Ok(r) => tracing::info!("queue cancel: {}", r.status()),
        Err(e) => tracing::warn!("queue cancel: {e}"),
    }
}

/// 官方 WeLinkQueue 1.0.4 checkDispatchInfo：sdkMsg 含 "queuing" 才进排队，
/// 先校验 seatNo/queuingSize/token，内嵌数值立即上屏；随后立即查一次、每 10s 轮询，
/// data.sdkMsg 非空才算排到；任一 200/4000 刷新 30s 超时，其他 code 取消并失败。
async fn wait_queue(gateway: &str, sdk_msg: Value) -> Result<Value> {
    let parsed = match &sdk_msg {
        Value::String(s) => {
            if !s.contains("queuing") {
                return Ok(sdk_msg);
            }
            serde_json::from_str::<Value>(s).context("排队信息无效")?
        }
        // 非字符串只有对象形态带 identiType；其余原样交给 startGame
        v if v.is_object() => (*v).clone(),
        _ => return Ok(sdk_msg),
    };
    if parsed.get("identiType").and_then(Value::as_str) != Some("queuing") {
        return Ok(sdk_msg);
    }
    // 官方 valid：seatNo/queuingSize != -1、token 非空非 "{}"、已配置 IspUrl
    let seat0 = as_i64(parsed.get("seatNo")).unwrap_or(-1);
    let size0 = as_i64(parsed.get("queuingSize")).unwrap_or(-1);
    let token = parsed.get("token").and_then(Value::as_str).unwrap_or("").to_string();
    if seat0 == -1 || size0 == -1 || token.is_empty() || token == "{}" || gateway.is_empty() {
        anyhow::bail!("排队信息获取失败");
    }
    loading::set_queue(seat0, size0);

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()?;
    let search = format!("{gateway}/sdk_api/web/queue/search_queue_info");
    let cancel = format!("{gateway}/sdk_api/web/queue/cancel");
    let mut prev: Option<Value> = None;
    let mut last_ok = std::time::Instant::now();
    loop {
        let started = std::time::Instant::now();
        let r = match http.post(&search).multipart(queue_form(&token)).send().await {
            Ok(resp) => resp.json::<Value>().await.ok(),
            Err(e) => {
                tracing::debug!("queue poll: {e}");
                None
            }
        };
        if let Some(r) = r {
            let code = as_i64(r.get("code")).unwrap_or(0);
            if code == 200 || code == 4000 {
                last_ok = std::time::Instant::now();
                let data = r.get("data").cloned().unwrap_or(Value::Null);
                // 官方 `l && l.sdkMsg`：空串 / null 不算排到
                if let Some(m) = data.get("sdkMsg").filter(|v| has_sdk_msg(v)) {
                    tracing::info!("queue done");
                    return Ok(m.clone());
                }
                let cur = as_i64(data.get("seatNo")).unwrap_or(0);
                let prev_seat = as_i64(prev.as_ref().and_then(|p| p.get("seatNo"))).unwrap_or(0);
                let seat = if prev.is_some() { cur.min(prev_seat) } else { cur }.max(0);
                let size = as_i64(data.get("queuingSize")).filter(|v| *v > 0).unwrap_or(0);
                tracing::info!("queuing seat={seat} size={size}");
                loading::set_queue(seat, size);
                prev = Some(data);
            } else if code != 500 {
                cancel_queue(&http, &cancel, &token).await;
                anyhow::bail!("排队失败 (code={code})");
            }
        }
        if last_ok.elapsed() >= std::time::Duration::from_secs(30) {
            cancel_queue(&http, &cancel, &token).await;
            anyhow::bail!("排队失败，请重试");
        }
        // 官方 10s 固定间隔（首轮立即），轮询本身耗时不计入间隔
        let wait = std::time::Duration::from_secs(10).saturating_sub(started.elapsed());
        tokio::time::sleep(wait).await;
    }
}

async fn cert_hashes(sdk: &Value, ip: &str, port: u16) -> Vec<Vec<u8>> {
    use base64::Engine;
    // sdkMsg.extSDK.cert_hash 优先；其次 hashGW 服务
    if let Some(ext) = sdk.get("extSDK").and_then(Value::as_str) {
        if let Ok(v) = serde_json::from_str::<Value>(ext) {
            if let Some(ch) = v.get("cert_hash").and_then(Value::as_str) {
                if let Ok(arr) = serde_json::from_str::<Value>(ch) {
                    if let Some(a) = arr.as_array() {
                        let out: Vec<Vec<u8>> = a.iter()
                            .filter_map(|x| x.get("value").and_then(Value::as_str))
                            .filter_map(|b| base64::engine::general_purpose::STANDARD.decode(b).ok())
                            .collect();
                        if !out.is_empty() { return out; }
                    }
                }
            }
        }
    }
    let url = format!("https://transfer-inner.wl-times.com/cert_hash/{ip}/{port}");
    if let Ok(r) = reqwest::get(&url).await {
        if let Ok(v) = r.json::<Value>().await {
            if let Some(a) = v.as_array() {
                return a.iter()
                    .filter_map(|x| x.get("value").and_then(Value::as_str))
                    .filter_map(|b| base64::engine::general_purpose::STANDARD.decode(b).ok())
                    .collect();
            }
        }
    }
    Vec::new()
}

fn sdp_json(gsm_token: &str, user_id: &str) -> String {
    serde_json::json!({
        "local": {
            "v": "5.11.4.260113143905-wlweb-release",
            "os": "WINDOWS", "t": "h5", "dpi": 0,
            "decode": config::CODEC_TYPE_H264,
            "sample_rate": 48000, "channel": 2, "audio_format": "opus",
            "screen_width": 1600, "screen_height": 900,
        },
        "user": { "uid": user_id, "t": gsm_token },
        "function": { "tr_file_pb": 0, "tr_json_pb": 0, "input_ver": [1, 2, 3], "support_cmd_v2": true },
        "net": { "t": "connected" },
    }).to_string()
}

/// protoVersion 应答（DISPATCH 默认分支）：LocalIm + PackedData + ChannelType。
/// 官方三分支互斥：mIsStart→auth/authV2；DISPATCH(默认)→PackedData；DIRECT→ClientOnline。
/// intercept_app/initData/login/SDKHeartBeat 是首帧(6038)之后才发的。
fn send_session_msgs(eng: &std::sync::mpsc::Sender<WgcCmd>, gsm_token: &str, user_id: &str, packed_data: &str, _sdk_msg: &Value, _device_uuid: &str) {
    let local_im = proto::SimpleCmd { cmd: "LocalIm".into(), arg: "1".into(), ..Default::default() };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: local_im.encode() });

    let sdp = sdp_json(gsm_token, user_id);
    if packed_data.is_empty() {
        // packedData 缺失 → 官方 DIRECT 分支发 ClientOnline（保底，正常流程走不到）
        tracing::warn!("sdkMsg.packedData 为空");
    } else {
        let _ = eng.send(WgcCmd::Protobuf {
            sid: 0,
            data: proto::packed_data_dispatch_cmd(packed_data, &sdp).encode(),
        });
    }

    // R1()/w(): ChannelType 硬编码字节（官方 protoVersion 后必发）
    let channel_type = proto::SimpleCmd {
        cmd: "ChannelType".into(),
        arg: "主通道".into(),
        data: b"3015001000".to_vec(),
        arg1: "0".into(),
        arg2: "23".into(),
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: channel_type.encode() });
}

/// 一次 play.lg 分配出来的实例信息（换线路时重新分配）。
struct PlayCtx {
    gs_ip: String,
    port: u16,
    gsm_token: String,
    user_id: String,
    packed: String,
    hashes: Vec<Vec<u8>>,
    sdk: Value,
}

/// UI → 连接循环的进程内指令（不重启进程）。
enum ReconnCmd {
    /// 同一实例重连（断网/断流后手动重连）
    Reconnect,
    /// 换线路：重新 play.lg 分配新实例
    SwitchNode(String),
}

/// 路由器在 protoVersion/首帧时读取的连接上下文：first=首次连接（PackedData），否则 auth/authV2。
#[derive(Clone)]
struct ConnInfo {
    gen: u64,
    first: bool,
    gsm: String,
    uid: String,
    packed: String,
    sdk: Value,
}

/// 数值字段兼容 number / 数字字符串（sdk-api 两种形态都出现过）。
fn as_i64(v: Option<&Value>) -> Option<i64> {
    v.and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
}

/// 官方 JS 的真值判断（playCardEnable 可能是 bool / 0|1 / 字符串）。
fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => !s.is_empty() && s != "0" && s != "false",
        _ => false,
    }
}

fn truncate_json(v: &Value, n: usize) -> String {
    let s = v.to_string();
    s.chars().take(n).collect()
}

/// play.lg queueType：免费时长通道 / 畅玩卡通道（官方按 playCardEnable 选择）。
const QUEUE_TYPE_FREE: i64 = 1;
const QUEUE_TYPE_CARD: i64 = 2;

/// sdkMsg 有实质内容：null / 空串不算排到（官方 `l && l.sdkMsg`）。
fn has_sdk_msg(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

/// 同一 HWND 上不能并存两条 flip 链：先释放旧交换链再重建。
fn rebuild_swapchain(sink: &mut Option<render::GpuSink>, ctx: &render::GpuContext, hwnd: isize, w: u32, h: u32, top: u32) -> Result<()> {
    *sink = None;
    *sink = Some(render::GpuSink::new(ctx, hwnd, w, h, top)?);
    Ok(())
}

/// 缩放/DPI 变化后赶在下一帧前按新宽度重画标题栏并上传，保证第一帧即对齐窗口。
fn repaint_bar_now(render_tx: &std::sync::mpsc::Sender<RenderCmd>, bar_pixels: &mut Vec<u8>, w: u32, title_h: u32, scale: f32) {
    *bar_pixels = ui::render_bar(w, scale);
    let _ = render_tx.send(RenderCmd::Overlay { slot: 0, x: 0, y: 0, w, h: title_h, pixels: bar_pixels.clone() });
}

/// play.lg + 排队 + 解析 sdkMsg + 证书哈希；首次启动和换线路共用。
async fn allocate(
    api: &api::SdkApi,
    session: &auth::Session,
    gateway: &str,
    node: &str,
    ping: Vec<Value>,
    w: i64,
    h: i64,
    queue_type: i64,
) -> Result<PlayCtx> {
    let req = api::PlayRequest {
        user_id: session.cuid.clone(),
        node: node.to_string(),
        resolution: format!("{w}x{h}"),
        ctoken: session.ctoken.clone(),
        queue_type,
        ping,
    };
    // 官方 checkQueue：play.lg 只调一次，失败按 codes / weilinSdkStatus 分支，不自动重试
    let play_resp = api.play(&req).await.context("play.lg")?;
    tracing::info!("play.lg: {}", truncate_json(&play_resp, 600));
    let codes = as_i64(play_resp.get("codes")).unwrap_or(0);
    if codes != 0 {
        match codes {
            30002 => anyhow::bail!("登录状态已失效，请重新登录"),
            30003 => {
                let tips = play_resp.get("dialogTips").and_then(Value::as_str).unwrap_or("");
                anyhow::bail!("服务器维护中{}", if tips.is_empty() { String::new() } else { format!("：{tips}") });
            }
            _ => anyhow::bail!(
                "{}",
                play_resp.get("error_description").and_then(Value::as_str).unwrap_or("游戏启动失败")
            ),
        }
    }
    match as_i64(play_resp.get("weilinSdkStatus")).unwrap_or(0) {
        1 => anyhow::bail!("您的云游戏时长与畅玩卡已耗尽，前往商店购买后可继续游戏"),
        2 => anyhow::bail!("游戏启动失败，请重试"),
        _ => {}
    }
    if let Some(s) = play_resp.get("sdkMsg").and_then(Value::as_str) {
        if let Ok(sdk) = serde_json::from_str::<Value>(s) {
            let keys: Vec<String> = sdk.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default();
            tracing::info!("sdkMsg keys: {keys:?}");
            for k in ["assignResultParam","h5line","lines","gsH5Ip","h5Ip","rtcIp","rtcPort","extSDK"] {
                if let Some(v) = sdk.get(k) { tracing::info!("sdkMsg.{k} = {}", &v.to_string()[..v.to_string().len().min(400)]); }
            }
        }
    }
    let sdk_msg = play_resp
        .get("sdkMsg").cloned()
        .or_else(|| play_resp.pointer("/data/sdkMsg").cloned())
        .filter(|v| has_sdk_msg(v))
        .context("play.lg: 未返回 sdkMsg")?;
    let sdk_msg = wait_queue(gateway, sdk_msg).await?;

    loading::set_notice("游戏启动中，请耐心等待～");
    let sdk: Value = match &sdk_msg {
        Value::String(s) => serde_json::from_str(s).unwrap_or(Value::Null),
        v => v.clone(),
    };
    // gsIp 是 JSON 数组 [{type:"DX",lineIp:...},...]，取第一条线路
    let gs_ip = {
        let raw = sdk.get("gsIp").and_then(Value::as_str).context("sdkMsg.gsIp")?;
        serde_json::from_str::<Value>(raw)
            .ok()
            .and_then(|a| a.as_array().cloned())
            .and_then(|a| a.first().cloned())
            .and_then(|l| l.get("lineIp").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| raw.to_string())
    };
    // 官方:gsVer 主版本 >=5 用 gsPort,否则 webRtcPort
    let gs_major: i64 = sdk.get("gsVer").and_then(Value::as_str).unwrap_or("")
        .split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let (port_key, port) = if gs_major >= 5 {
        ("gsPort", sdk.get("gsPort"))
    } else {
        ("webRtcPort", sdk.get("webRtcPort"))
    };
    let port = port.or_else(|| sdk.get("webRtcPort")).or_else(|| sdk.get("gsPort"))
        .and_then(Value::as_i64).context("sdkMsg.gsPort/webRtcPort")? as u16;
    tracing::info!("gsVer={} -> {}={}", sdk.get("gsVer").and_then(serde_json::Value::as_str).unwrap_or(""), port_key, port);
    let gsm_token = sdk.get("gsmToken").and_then(Value::as_str).unwrap_or("").to_string();
    let user_id = sdk.get("userId").map(|v| match v { Value::String(s) => s.clone(), v => v.to_string() }).unwrap_or_default();
    let packed = sdk.get("packedData").and_then(Value::as_str).unwrap_or("").to_string();
    tracing::info!("packedData: len={} head={:?} has_pct={} has_plus={}", packed.len(), &packed[..packed.len().min(80)], packed.contains('%'), packed.contains('+'));
    let hashes = cert_hashes(&sdk, &gs_ip, port).await;
    tracing::info!("session: {gs_ip}:{port} hashes={}", hashes.len());
    Ok(PlayCtx { gs_ip, port, gsm_token, user_id, packed, hashes, sdk })
}

/// 重连应答（官方 mIsStart && gsmToken 分支）：LocalIm + auth + authV2 + ChannelType。
/// 注意这条路径**不发 PackedData**。
fn send_reconnect_msgs(eng: &std::sync::mpsc::Sender<WgcCmd>, gsm_token: &str, user_id: &str) {
    let local_im = proto::SimpleCmd { cmd: "LocalIm".into(), arg: "1".into(), ..Default::default() };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: local_im.encode() });

    let auth = proto::SimpleCmd {
        cmd: "auth".into(),
        arg: gsm_token.to_string(),
        arg1: config::CODEC_TYPE_H264.to_string(),
        data: user_id.as_bytes().to_vec(),
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: auth.encode() });

    let sdp = sdp_json(gsm_token, user_id);
    let auth_v2 = proto::SimpleCmd {
        cmd: "authV2".into(),
        arg: "authV2".into(),
        arg1: sdp,
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: auth_v2.encode() });

    let channel_type = proto::SimpleCmd {
        cmd: "ChannelType".into(),
        arg: "主通道".into(),
        data: b"3015001000".to_vec(),
        arg1: "0".into(),
        arg2: "23".into(),
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: channel_type.encode() });
}

/// 首帧(6038)触发的发送集：intercept_app + initData/login + 起心跳定时器（官方时序）。
fn on_first_frame(eng: &std::sync::mpsc::Sender<WgcCmd>, session: &auth::Session, game_id: String) {
    // R4(): intercept_app（官方在 6038/onDataChannelOpen 发）
    let intercept = proto::SimpleCmd {
        cmd: "intercept_app".into(),
        arg: "{\"transFile\":true,\"transJson\":true,\"transTxt\":false}".into(),
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: intercept.encode() });

    send_game_msgs_tx(eng, session, game_id);

    // gsProxyHeartBeat: SDKHeartBeat 每 1s（官方 onDataChannelOpen 起）。
    // 重连会再次走到这里，心跳线程只起一次
    static HB_STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !HB_STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let e2 = eng.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let hb = proto::SimpleCmd { cmd: "SDKHeartBeat".into(), ..Default::default() };
            let _ = e2.send(WgcCmd::Protobuf { sid: 0, data: hb.encode() });
        });
    }
}

/// WelinkHeartBeat:官方硬编码字节(测延时),connect 成功后每 2s。
fn welink_heartbeat(eng: &std::sync::mpsc::Sender<WgcCmd>) {
    let e2 = eng.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let b: [u8; 29] = [
            10, 9, 230, 181, 139, 229, 187, 182, 230, 151, 182,
            18, 13, 49, 54, 55, 56, 48, 56, 52, 50, 51, 55, 54, 54, 55,
            34, 1, 52,
        ];
        ui::heartbeat_sent();
        let _ = e2.send(WgcCmd::Protobuf { sid: 0, data: b.to_vec() });
    });
}

/// 游戏内 initData/login 的 SendDataToGame 序号：官方 gameDataIndex 单调递增，重启后继续累加。
static GAME_DATA_IDX: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn send_game_msgs_tx(eng: &std::sync::mpsc::Sender<WgcCmd>, session: &auth::Session, game_id: String) {
    // 官方 page 的 cloud_app_msg：埋点上下文，游戏侧只做透传
    let cloud_app_msg = serde_json::json!({
        "#device_key": session.device_num,
        "#os": "WINDOWS",
        "#user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "#session_id": "",
        "#click_id": "",
        "#adv_advert_chn": "",
        "#adv_promotion_code": "",
        "#adv_page_id": "",
        "#adv_page_url": "",
        "#adv_track_id": "",
        "#adv_advertiser_id": "",
        "#adv_gid": "",
        "#adv_aid": "",
        "#adv_cid": "",
    }).to_string();
    let init_data = serde_json::json!({
        "type": "initData", "plat": "pcWeb",
        "data": {
            "channelId": config::CID,
            "mirrorChannelId": "",
            "channelName": "英雄互娱-h5云游戏",
            "channelSdkVersionName": config::CSDK_VERSION,
            "channelProjectId": config::PROJECT_ID,
            "deviceNum": session.device_num,
            "marginLeft": 0, "marginRight": 0, "marginTop": 0, "marginBottom": 0,
            "screenWidth": 1600, "screenHeight": 900,
        },
        "cloud_app_msg": cloud_app_msg,
    }).to_string();
    let idx = GAME_DATA_IDX.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let _ = eng.send(WgcCmd::Protobuf {
        sid: 0,
        data: proto::send_data_to_game_cmd(&init_data, idx).encode(),
    });
    // 官方 loginGame 用的是 sdkLoginResult.accessToken(USDK token)，不是 CSDK_ACCESS_TOKEN
    let login = serde_json::json!({
        "type": "login", "plat": "pcWeb",
        "data": {
            "pcode": config::GAME_PCODE,
            "accessToken": session.game_access_token(),
            "cName": session.cname,
            "cUid": session.cuid,
        },
    }).to_string();
    let idx = GAME_DATA_IDX.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let _ = eng.send(WgcCmd::Protobuf {
        sid: 0,
        data: proto::send_data_to_game_cmd(&login, idx).encode(),
    });
    let _ = game_id;
}

fn audio_out(rx: std::sync::mpsc::Receiver<Vec<u8>>) {
    std::thread::spawn(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
        let host = cpal::default_host();
        let Some(dev) = host.default_output_device() else { return };
        let cfg = cpal::StreamConfig { channels: 2, sample_rate: cpal::SampleRate(48000), buffer_size: cpal::BufferSize::Default };
        let buf = Arc::new(Mutex::new(std::collections::VecDeque::<i16>::new()));
        let buf2 = buf.clone();
        std::thread::spawn(move || {
            for chunk in rx.iter() {
                let mut b = buf2.lock().unwrap();
                if b.len() > 48000 * 4 { b.clear(); }
                for s in chunk.chunks_exact(2) {
                    b.push_back(i16::from_le_bytes([s[0], s[1]]));
                }
            }
        });
        let stream = dev.build_output_stream(
            &cfg,
            move |out: &mut [i16], _| {
                let muted = ui::muted();
                let mut b = buf.lock().unwrap();
                for s in out.iter_mut() {
                    let v = b.pop_front().unwrap_or(0);
                    *s = if muted { 0 } else { v };
                }
            },
            |e| tracing::warn!("audio: {e}"),
            None,
        );
        if let Ok(s) = stream {
            let _ = s.play();
            loop { std::thread::sleep(std::time::Duration::from_secs(60)); }
        }
    });
}

/// 鼠标捕获状态。cursor 为游戏（码流）坐标系，mouse 为官方 mouseX/mouseY 累计原始位移。
struct Mouse {
    captured: bool,
    mouse_x: i32,
    mouse_y: i32,
    cursor_x: f64,
    cursor_y: f64,
}

fn parse_wxh(s: &str) -> Option<(u32, u32)> {
    let (w, h) = s.split_once(['x', 'X'])?;
    let (w, h) = (w.trim().parse().ok()?, h.trim().parse().ok()?);
    (w > 0 && h > 0).then_some((w, h))
}

/// 更新游戏坐标系尺寸；只在真正变化时打日志。
fn update_game_size(g: &Mutex<(u32, u32)>, w: u32, h: u32) {
    if w == 0 || h == 0 {
        return;
    }
    let mut size = g.lock().unwrap();
    if *size != (w, h) {
        tracing::info!("game size: {}x{} -> {w}x{h}", size.0, size.1);
        *size = (w, h);
    }
}

/// 首帧/重启后按官方时序下发码率档位与当前窗口对应的出流分辨率。
fn send_stream_controls(eng: &std::sync::mpsc::Sender<WgcCmd>, area: &Mutex<(u32, u32)>) {
    let (_, min, max) = control::QUALITY[ui::quality()];
    control::set_bitrate_range(eng, min, max);
    let (w, h) = *area.lock().unwrap();
    control::set_game_resolution(eng, w, h);
}

/// 系统级 Alt 键状态：winit 的 ModifiersChanged 偶发缺失时的兜底。
fn alt_held() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU};
    unsafe { (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0 }
}

/// 标题栏右键：弹出系统菜单（原生菜单项）；选中项以 WM_SYSCOMMAND 回到窗口处理。
unsafe fn show_system_menu(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::Foundation::{LPARAM, POINT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetCursorPos, GetSystemMenu, IsZoomed, PostMessageW, SetForegroundWindow,
        TrackPopupMenu, MF_BYCOMMAND, MF_ENABLED, MF_GRAYED, SC_MAXIMIZE, SC_RESTORE,
        TPM_LEFTALIGN, TPM_RETURNCMD, TPM_TOPALIGN, WM_SYSCOMMAND,
    };
    let menu = GetSystemMenu(hwnd, false.into());
    if menu.0.is_null() {
        return;
    }
    let zoomed = IsZoomed(hwnd).as_bool();
    let _ = EnableMenuItem(menu, SC_RESTORE, MF_BYCOMMAND | if zoomed { MF_ENABLED } else { MF_GRAYED });
    let _ = EnableMenuItem(menu, SC_MAXIMIZE, MF_BYCOMMAND | if zoomed { MF_GRAYED } else { MF_ENABLED });
    let mut pt = POINT::default();
    let _ = GetCursorPos(&mut pt);
    let _ = SetForegroundWindow(hwnd);
    let cmd = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN,
        pt.x,
        pt.y,
        None,
        hwnd,
        None,
    );
    if cmd.0 != 0 {
        let _ = PostMessageW(Some(hwnd), WM_SYSCOMMAND, WPARAM(cmd.0 as usize), LPARAM(0));
    }
}

/// 把空白标题栏声明为系统标题栏（HTCAPTION）：拖动、双击最大化/还原、右键系统菜单、
/// Aero Snap 全部交给系统原生处理；标签/按钮等交互区仍返回 HTCLIENT 走自绘 UI。
fn install_caption_hit_test(hwnd: isize) {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::ScreenToClient;
    use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, GetClientRect, GetWindowLongPtrW, IsZoomed, SetWindowLongPtrW, GWLP_WNDPROC,
        HTBOTTOM, HTBOTTOMLEFT, HTBOTTOMRIGHT, HTCAPTION, HTCLIENT, HTLEFT, HTRIGHT, HTTOP,
        HTTOPLEFT, HTTOPRIGHT, SM_CXPADDEDBORDER, SM_CXSIZEFRAME, WNDPROC,
    };
    static PREV: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
    unsafe extern "system" fn caption_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        // WM_NCRBUTTONUP：标题栏右键弹系统菜单
        if msg == 0x00A5 && wp.0 as u32 == HTCAPTION {
            show_system_menu(hwnd);
            return LRESULT(0);
        }
        // WM_NCHITTEST
        if msg == 0x0084 {
            let title_h = TITLE_H.load(std::sync::atomic::Ordering::Relaxed);
            let raw = lp.0 as u32;
            let mut p = POINT {
                x: (raw & 0xffff) as u16 as i16 as i32,
                y: ((raw >> 16) & 0xffff) as u16 as i16 as i32,
            };
            let mut rc = RECT::default();
            if ScreenToClient(hwnd, &mut p).as_bool() && GetClientRect(hwnd, &mut rc).is_ok() {
                let (w, h) = ((rc.right - rc.left) as u32, (rc.bottom - rc.top) as u32);
                if w > 0 && h > 0 && p.x >= 0 && p.y >= 0 {
                    let dpi = GetDpiForWindow(hwnd);
                    // 无边框窗口没有系统 NC 边框：自己按 DPI 还原可调整大小的热区，
                    // 否则上边缘落在 HTCAPTION 里会被当成拖动而不是缩放
                    let frame = (GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi)
                        + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi))
                    .max(4) as i32;
                    if title_h > 0
                        && !IsZoomed(hwnd).as_bool()
                        && !PANEL_OPEN_UI.load(std::sync::atomic::Ordering::Relaxed)
                        && !MOUSE_CAPTURED.load(std::sync::atomic::Ordering::Relaxed)
                    {
                        let mut m = 0u8;
                        if p.x < frame {
                            m |= 1;
                        } else if p.x >= w as i32 - frame {
                            m |= 2;
                        }
                        if p.y < frame {
                            m |= 4;
                        } else if p.y >= h as i32 - frame {
                            m |= 8;
                        }
                        if m != 0 {
                            return LRESULT(match m {
                                1 => HTLEFT,
                                2 => HTRIGHT,
                                4 => HTTOP,
                                8 => HTBOTTOM,
                                5 => HTTOPLEFT,
                                6 => HTTOPRIGHT,
                                9 => HTBOTTOMLEFT,
                                _ => HTBOTTOMRIGHT,
                            } as isize);
                        }
                    }
                    if title_h > 0
                        && !PANEL_OPEN_UI.load(std::sync::atomic::Ordering::Relaxed)
                        && !MOUSE_CAPTURED.load(std::sync::atomic::Ordering::Relaxed)
                        && p.y < title_h as i32
                    {
                        let scale = GetDpiForWindow(hwnd) as f32 / 96.0;
                        if ui::hit_test(w, h, scale, p.x as f64, p.y as f64, false) == ui::Hit::None
                        {
                            // 进入标题栏区域：清掉客户端 hover，避免标签高亮残留
                            ui::set_hover(-1);
                            return LRESULT(HTCAPTION as isize);
                        }
                    }
                }
            }
            return LRESULT(HTCLIENT as isize);
        }
        let prev = PREV.load(std::sync::atomic::Ordering::Relaxed);
        CallWindowProcW(
            std::mem::transmute::<isize, WNDPROC>(prev),
            hwnd,
            msg,
            wp,
            lp,
        )
    }
    unsafe {
        let h = HWND(hwnd as *mut _);
        let prev = GetWindowLongPtrW(h, GWLP_WNDPROC);
        PREV.store(prev, std::sync::atomic::Ordering::Relaxed);
        SetWindowLongPtrW(h, GWLP_WNDPROC, caption_proc as isize);
    }
}

/// 窗口 placement：退出全屏时用它恢复位置与最大化状态。
/// `rcNormalPosition` 是“还原矩形”——最大化窗口也是最大化前的位置，不会丢。
fn get_placement(hwnd: isize) -> Option<windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowPlacement, WINDOWPLACEMENT};
    if hwnd == 0 {
        return None;
    }
    unsafe {
        let mut wp = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        GetWindowPlacement(HWND(hwnd as *mut _), &mut wp).ok()?;
        Some(wp)
    }
}

fn apply_placement(hwnd: isize, wp: &windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetWindowPlacement;
    if hwnd == 0 {
        return;
    }
    unsafe {
        let _ = SetWindowPlacement(HWND(hwnd as *mut _), wp);
    }
}

/// 真实客户区尺寸（物理像素）。
fn client_size(hwnd: isize) -> Option<(u32, u32)> {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::GetClientRect;
    if hwnd == 0 {
        return None;
    }
    unsafe {
        let mut rc = RECT::default();
        GetClientRect(HWND(hwnd as *mut _), &mut rc).ok()?;
        Some(((rc.right - rc.left) as u32, (rc.bottom - rc.top) as u32))
    }
}

/// 按下时直接读系统光标位置（客户区物理像素），避免 CursorMoved 尚未到达时命中错位。
fn cursor_client(hwnd: isize) -> Option<(f64, f64)> {
    use windows::Win32::Foundation::{HWND, POINT};
    use windows::Win32::Graphics::Gdi::ScreenToClient;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    if hwnd == 0 {
        return None;
    }
    unsafe {
        let mut p = POINT::default();
        GetCursorPos(&mut p).ok()?;
        let mut c = p;
        if !ScreenToClient(HWND(hwnd as *mut _), &mut c).as_bool() {
            return None;
        }
        Some((c.x as f64, c.y as f64))
    }
}

/// 任务栏 / Alt-Tab 图标：与 exe 资源图标同源的游戏 favicon。
fn apply_window_icon(window: &Window) {
    const ICON: &[u8] = include_bytes!("../assets/game_logo.bgra");
    let mut rgba = Vec::with_capacity(ICON.len());
    for px in ICON.chunks_exact(4) {
        rgba.extend_from_slice(&[px[2], px[1], px[0], px[3]]);
    }
    if let Ok(icon) = winit::window::Icon::from_rgba(rgba, 64, 64) {
        window.set_window_icon(Some(icon));
    }
}

/// Win11 圆角开关（全屏时关掉，避免屏幕四角露出桌面）。
fn set_round_corners(hwnd: isize, round: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND,
    };
    if hwnd == 0 {
        return;
    }
    unsafe {
        let h = HWND(hwnd as *mut _);
        let pref = if round { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
        let _ = DwmSetWindowAttribute(
            h,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const _ as *const _,
            std::mem::size_of_val(&pref) as u32,
        );
    }
}

/// 去掉 Win11 给无边框窗口画的高亮描边。
fn remove_dwm_border(hwnd: isize) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE};
    if hwnd == 0 {
        return;
    }
    unsafe {
        let none = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            HWND(hwnd as *mut _),
            DWMWA_BORDER_COLOR,
            &none as *const _ as *const _,
            std::mem::size_of_val(&none) as u32,
        );
    }
}

/// 无边框全屏（Alt+Enter / 控制中心），与一般游戏的全屏一致。
/// 进入时保存 WINDOWPLACEMENT（含最大化状态与最大化前的还原矩形），退出全屏后恢复。
fn toggle_fullscreen(
    window: &Window,
    hwnd: isize,
    saved: &mut Option<windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT>,
    restore_at: &mut Option<std::time::Instant>,
) {
    if window.fullscreen().is_some() {
        window.set_fullscreen(None);
        ui::set_fullscreen(false);
        set_round_corners(hwnd, true);
        // winit 退出全屏用的是它自己保存的 placement；延后一帧再按进入前的状态恢复，
        // 这样“窗口化→最大化→全屏→退出”仍能回到最大化前的窗口位置
        if saved.is_some() {
            *restore_at = Some(std::time::Instant::now() + std::time::Duration::from_millis(150));
        }
    } else {
        *saved = get_placement(hwnd);
        *restore_at = None;
        // 最大化窗口直接进无边框全屏会让 DWM 停止消费 Present（画面冻结、声音继续）；
        // 先还原成普通窗口再全屏，退出时由 saved placement 恢复最大化状态
        if window.is_maximized() {
            window.set_maximized(false);
        }
        window.set_fullscreen(Some(winit::window::Fullscreen::Borderless(None)));
        ui::set_fullscreen(true);
        set_round_corners(hwnd, false);
    }
}

/// 把 BGRA 覆盖层（alpha=0 透明）贴到 softbuffer 的 u32 缓冲。
fn composite_overlay(
    buf: &mut [u32],
    dw: usize,
    dh: usize,
    x: usize,
    y: usize,
    src: &[u8],
    sw: usize,
    sh: usize,
) {
    for row in 0..sh {
        let dy = y + row;
        if dy >= dh {
            break;
        }
        for col in 0..sw {
            let dx = x + col;
            if dx >= dw {
                break;
            }
            let si = (row * sw + col) * 4;
            if si + 3 >= src.len() {
                break;
            }
            let a = src[si + 3] as u32;
            if a == 0 {
                continue;
            }
            let dst = &mut buf[dy * dw + dx];
            if a == 255 {
                *dst = u32::from_le_bytes([src[si], src[si + 1], src[si + 2], 0xff]);
            } else {
                let cur = dst.to_le_bytes();
                let mut out = [0u8; 4];
                for i in 0..3 {
                    out[i] = ((src[si + i] as u32 * a + cur[i] as u32 * (255 - a)) / 255) as u8;
                }
                out[3] = 0xff;
                *dst = u32::from_le_bytes(out);
            }
        }
    }
}

/// 把窗口边缘掩码转成系统缩放方向（交给系统模态缩放循环，鼠标与边框严格跟手）。
fn resize_direction(edge: u8) -> Option<winit::window::ResizeDirection> {
    use winit::window::ResizeDirection;
    Some(match edge {
        1 => ResizeDirection::West,
        2 => ResizeDirection::East,
        4 => ResizeDirection::North,
        8 => ResizeDirection::South,
        5 => ResizeDirection::NorthWest,
        6 => ResizeDirection::NorthEast,
        9 => ResizeDirection::SouthWest,
        10 => ResizeDirection::SouthEast,
        _ => return None,
    })
}

/// 标题栏重绘判据。std 只为 <=12 元组实现 PartialEq，这里用结构体。
#[derive(PartialEq, Clone, Copy)]
struct BarSig {
    w: u32,
    top: u32,
    hover: i32,
    quality: u32,
    muted: bool,
    maximized: bool,
    gpu: bool,
    elapsed: u64,
    latency: u32,
    stream: u64,
    net: u32,
    fps: u32,
    nodes: u32,
}

#[allow(clippy::too_many_arguments)]
fn run_window(
    eng: std::sync::mpsc::Sender<WgcCmd>,
    frame: Arc<Mutex<Option<Frame>>>,
    mouse_mode: std::sync::Arc<std::sync::atomic::AtomicU8>,
    game_size: Arc<Mutex<(u32, u32)>>,
    video_area: Arc<Mutex<(u32, u32)>>,
    render_tx: std::sync::mpsc::Sender<RenderCmd>,
    gpu_active: Arc<std::sync::atomic::AtomicBool>,
    reconn_tx: tokio::sync::mpsc::UnboundedSender<ReconnCmd>,
    mut store: sessions::Store,
    mut active_id: String,
) -> Result<()> {
    let event_loop = EventLoop::new()?;
    let window = Arc::new(event_loop.create_window(
        Window::default_attributes()
            .with_title("云·二重螺旋")
            .with_decorations(false)
            .with_inner_size(winit::dpi::LogicalSize::new(1600.0, 900.0))
            .with_min_inner_size(winit::dpi::LogicalSize::new(640.0, 420.0)),
    )?);
    apply_window_icon(&window);
    let context = softbuffer::Context::new(window.clone())
        .map_err(|e| anyhow::anyhow!("softbuffer ctx: {e}"))?;
    let mut surface = softbuffer::Surface::new(&context, window.clone())
        .map_err(|e| anyhow::anyhow!("softbuffer surface: {e}"))?;

    // 顶部自绘标题栏：视频从 title_h 开始，鼠标坐标也要减去这段
    let mut title_h = ui::title_height(window.scale_factor());
    TITLE_H.store(title_h, std::sync::atomic::Ordering::Relaxed);
    let hwnd = {
        use winit::raw_window_handle::{HasWindowHandle, RawWindowHandle};
        match window.window_handle().map(|h| h.as_raw()) {
            Ok(RawWindowHandle::Win32(h)) => h.hwnd.get(),
            _ => 0,
        }
    };
    // Win11：无边框窗口交给 DWM 做原生圆角（系统抗锯齿），并去掉系统描边
    if hwnd != 0 {
        set_round_corners(hwnd, true);
        remove_dwm_border(hwnd);
        install_caption_hit_test(hwnd);
    }
    let sz = window.inner_size();
    *video_area.lock().unwrap() = (sz.width, sz.height.saturating_sub(title_h));
    // 标题栏/面板内容变化才重绘（会话、hover、画质、静音、码流、计时）
    let mut bar_sig: Option<BarSig> = None;
    let mut bar_pixels: Vec<u8> = Vec::new();
    let mut panel_open = false;
    // 面板覆盖层是否已经贴到交换链（关闭时必须显式清除 slot）
    let mut panel_shown = false;
    let mut panel_sig: Option<(u32, i32, u32, u64, bool, bool, u32)> = None;
    let mut panel_pixels: Vec<u8> = Vec::new();
    let mut panel_pos = (0u32, 0u32);
    let mut panel_size = (0u32, 0u32);
    // 断线卡片覆盖层（slot 2）
    let mut status_shown = false;
    let mut status_pixels: Vec<u8> = Vec::new();
    let mut status_pos = (0u32, 0u32);
    let mut status_size = (0u32, 0u32);
    let mut status_sig: Option<(u32, u32, u32, i32, bool, u32)> = None;
    // 重连/游戏重启的 loading 页（GPU 覆盖层 slot 3），帧号变化才重传
    let mut loading_overlay_frame = u64::MAX;
    let mut was_restart_loading = false;
    let mut restart_started: Option<std::time::Instant> = None;
    // 进入全屏后的顶部浮动提示（2s，复用覆盖层 slot 0）
    let mut hint_until: Option<std::time::Instant> = None;
    let mut hint_shown = false;
    let mut hint_pixels: Vec<u8> = Vec::new();
    let mut hint_pos = (0u32, 0u32);
    let mut hint_size = (0u32, 0u32);
    let mut was_fullscreen = false;
    // 进入全屏前的窗口 placement（最大化状态 + 最大化前的还原矩形）与待恢复时间点
    let mut saved_placement: Option<windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT> = None;
    let mut restore_placement_at: Option<std::time::Instant> = None;

    // 把窗口句柄交给解码/渲染线程建交换链（D3D11 只在那个线程用）
    if hwnd != 0 {
        let _ = render_tx.send(RenderCmd::Attach { hwnd, w: sz.width, h: sz.height, top: title_h });
    }

    let mut mouse = {
        let (gw, gh) = *game_size.lock().unwrap();
        Mouse { captured: false, mouse_x: 0, mouse_y: 0, cursor_x: gw as f64 / 2.0, cursor_y: gh as f64 / 2.0 }
    };
    let started = std::time::Instant::now();
    // 上次绘制的加载帧序号（软呈现时据此限速）
    let mut loading_frame: u64 = u64::MAX;
    // 只有点到渲染区的点击才允许进入游戏鼠标捕获：窗口激活、标题栏/控件点击都不算
    let mut grab_armed = false;
    let apply_mode = |window: &Arc<Window>, mouse: &mut Mouse, mode: u8, armed: bool| {
        let want = mode == 1 && armed;
        if want != mouse.captured {
            mouse.captured = want;
            MOUSE_CAPTURED.store(want, std::sync::atomic::Ordering::Relaxed);
            if want {
                // 必须优先 Locked：winit 在 Confined+HIDDEN 时会把光标钳到窗口中心 1px 处，
                // 拖拽滚动等场景结束后指针会跳回中心；Locked 固定在进入捕获时的位置。
                let _ = window.set_cursor_grab(CursorGrabMode::Locked).or_else(|_| window.set_cursor_grab(CursorGrabMode::Confined));
                window.set_cursor_visible(false);
            } else {
                let _ = window.set_cursor_grab(CursorGrabMode::None);
                window.set_cursor_visible(true);
            }
        }
    };
    let sid = 0;

    let eng_m = eng.clone();
    let mouse_call = move |mouse: &Mouse, action: i32, code: i32, value: i32| {
        let _ = eng_m.send(WgcCmd::Call {
            name: "mouse".into(),
            args: vec![
                sid,
                mouse.mouse_x,
                mouse.mouse_y,
                mouse.cursor_x as i32,
                mouse.cursor_y as i32,
                action,
                code,
                value,
            ],
        });
    };

    let mut resize_deadline: Option<std::time::Instant> = None;
    let mut cursor_edge: u8 = 0;
    let mut title_pressed: i32 = -1;
    // 本次按下已被自绘 UI 消费：松开时不再转发给游戏
    let mut ui_consumed = false;
    let mut last_cursor: (f64, f64) = (0.0, 0.0);
    // 新增账号的独立登录进程：原窗口保持运行，退出后刷新标签
    let mut add_child: Option<std::process::Child> = None;
    let mut alt_down = false;

    event_loop.run(move |event, elwt| {
        // GPU 呈现由解码线程驱动；仍需定时唤醒刷新连接时长/延迟/实时码率，缩放防抖另有截止时间
        // 重连/游戏重启的 loading 页要 ~29fps 推进精灵动画
        let tick_ms = if ui::restart_loading() { 33 } else { 500 };
        let tick = std::time::Instant::now() + std::time::Duration::from_millis(tick_ms);
        elwt.set_control_flow(if gpu_active.load(std::sync::atomic::Ordering::Relaxed) {
            ControlFlow::WaitUntil(resize_deadline.map_or(tick, |at| at.min(tick)))
        } else {
            ControlFlow::Poll
        });
        match event {
            Event::DeviceEvent { event: winit::event::DeviceEvent::MouseMotion { delta }, .. } => {
                if panel_open {
                    // 面板展开时不进入游戏捕获，保证光标可继续操作下拉
                    return;
                }
                let mode = mouse_mode.load(std::sync::atomic::Ordering::Relaxed);
                if mode == 0 && mouse.captured {
                    grab_armed = false;
                }
                // 光标在标题栏时不进入捕获：捕获只能由渲染区内的点击触发
                let over_video = title_h == 0 || last_cursor.1 >= title_h as f64;
                apply_mode(&window, &mut mouse, mode, grab_armed && over_video);
                // 官方 U(): 单次增量 clamp ±127 后累计，累计值本身不截断
                let dx = (delta.0 as i32).clamp(-127, 127);
                let dy = (delta.1 as i32).clamp(-127, 127);
                mouse.mouse_x = mouse.mouse_x.saturating_add(dx);
                mouse.mouse_y = mouse.mouse_y.saturating_add(dy);
                if mouse.captured {
                    let sz = window.inner_size();
                    let (gw, gh) = *game_size.lock().unwrap();
                    if sz.width > 0 && sz.height > 0 && gw > 1 && gh > 1 {
                        // 捕获模式:游标 = 上一点 + 位移按 游戏坐标/窗口尺寸 换算
                        let sx = dx as f64 * gw as f64 / sz.width as f64;
                        let sy = dy as f64 * gh as f64 / sz.height as f64;
                        mouse.cursor_x = (mouse.cursor_x + sx).clamp(0.0, (gw - 1) as f64);
                        mouse.cursor_y = (mouse.cursor_y + sy).clamp(0.0, (gh - 1) as f64);
                    }
                    mouse_call(&mouse, 1, proto::z3::MOV, 0);
                }
            }
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => elwt.exit(),
                WindowEvent::Focused(false) => {
                    // 窗口失焦（点其他程序 / Alt-Tab）：收起控制中心，释放游戏鼠标捕获
                    grab_armed = false;
                    if mouse.captured {
                        apply_mode(&window, &mut mouse, 0, false);
                    }
                    if panel_open {
                        panel_open = false;
                        PANEL_OPEN_UI.store(false, std::sync::atomic::Ordering::Relaxed);
                        window.request_redraw();
                    }
                }
                WindowEvent::Resized(sz) => {
                    if sz.width > 0 && sz.height > 0 {
                        // 全屏不显示自绘标题栏，视频占满整窗
                        title_h = if window.fullscreen().is_some() { 0 } else { ui::title_height(window.scale_factor()) };
                        TITLE_H.store(title_h, std::sync::atomic::Ordering::Relaxed);
                        let vh = sz.height.saturating_sub(title_h);
                        *video_area.lock().unwrap() = (sz.width, vh);
                        let _ = surface.resize(sz.width.try_into().unwrap(), sz.height.try_into().unwrap());
                        let _ = render_tx.send(RenderCmd::Resize { w: sz.width, h: sz.height, top: title_h });
                        ui::set_maximized(window.is_maximized());
                        ui::set_fullscreen(window.fullscreen().is_some());
                        bar_sig = None;
                        if title_h == 0 {
                            let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 0 });
                        } else {
                            repaint_bar_now(&render_tx, &mut bar_pixels, sz.width, title_h, window.scale_factor() as f32);
                        }
                        // 窗口尺寸变化 → 200ms 防抖后作为出流分辨率下发给服务端
                        // （不发会导致服务端仍按旧分辨率出流，客户端缩放后画面显示异常）
                        resize_deadline =
                            Some(std::time::Instant::now() + std::time::Duration::from_millis(200));
                    }
                    window.request_redraw();
                }
                WindowEvent::ScaleFactorChanged { .. } => {
                    // DPI 变化后标题栏高度按新比例重算
                    title_h = if window.fullscreen().is_some() { 0 } else { ui::title_height(window.scale_factor()) };
                    TITLE_H.store(title_h, std::sync::atomic::Ordering::Relaxed);
                    let sz = window.inner_size();
                    *video_area.lock().unwrap() = (sz.width, sz.height.saturating_sub(title_h));
                    let _ = render_tx.send(RenderCmd::Resize { w: sz.width, h: sz.height, top: title_h });
                    bar_sig = None;
                    if title_h > 0 && sz.width > 0 {
                        repaint_bar_now(&render_tx, &mut bar_pixels, sz.width, title_h, window.scale_factor() as f32);
                    }
                }
                WindowEvent::MouseInput { state, button, .. } => {
                    if button == winit::event::MouseButton::Left {
                        if state == ElementState::Pressed {
                            if let Some((px, py)) = cursor_client(hwnd) {
                                last_cursor = (px, py);
                                let sz = window.inner_size();
                                cursor_edge = if mouse.captured || panel_open || window.is_maximized() || window.fullscreen().is_some() {
                                    0
                                } else {
                                    ui::edge_test(sz.width, sz.height, window.scale_factor() as f32, px, py)
                                };
                            }
                        }
                        match state {
                            ElementState::Pressed
                                if !mouse.captured && !panel_open && cursor_edge != 0 && !window.is_maximized() =>
                            {
                                if let Some(dir) = resize_direction(cursor_edge) {
                                    // 交给系统缩放循环，窗口与鼠标严格同步
                                    let _ = window.drag_resize_window(dir);
                                }
                                return;
                            }
                            ElementState::Pressed => {
                                if !mouse.captured || panel_open {
                                    let sz = window.inner_size();
                                    let hit = if title_h == 0 && !panel_open {
                                        // 全屏没有标题栏，但断线卡片仍要能点
                                        ui::status_hit(
                                            sz.width,
                                            sz.height,
                                            window.scale_factor() as f32,
                                            last_cursor.0,
                                            last_cursor.1,
                                        )
                                    } else {
                                        ui::hit_test(
                                            sz.width,
                                            sz.height,
                                            window.scale_factor() as f32,
                                            last_cursor.0,
                                            last_cursor.1,
                                            panel_open,
                                        )
                                    };
                                    if panel_open {
                                        // 下拉展开时任何点击都先关闭；点中档位/全屏/线路则直接生效
                                        match hit {
                                            ui::Hit::PanelRow(i) => ui::apply_quality(i),
                                            ui::Hit::PanelNode(i) => {
                                                if let Some(n) = ui::panel_nodes().get(i) {
                                                    let id = n.id.clone();
                                                    tracing::info!("切换到线路 {id}");
                                                    ui::set_nodes(ui::nodes(), id.clone());
                                                    let _ = sessions::Store::mutate(|st| {
                                                        st.set_node(&active_id, id.clone());
                                                    });
                                                    // 进程内换线路：loading → 重新 play.lg → 重连
                                                    let _ = reconn_tx.send(ReconnCmd::SwitchNode(id));
                                                }
                                            }
                                            ui::Hit::Fullscreen => toggle_fullscreen(
                                                &window,
                                                hwnd,
                                                &mut saved_placement,
                                                &mut restore_placement_at,
                                            ),
                                            _ => {}
                                        }
                                        panel_open = false;
                                        PANEL_OPEN_UI.store(false, std::sync::atomic::Ordering::Relaxed);
                                        ui_consumed = true;
                                        window.request_redraw();
                                        return;
                                    }
                                    match hit {
                                        ui::Hit::None => {
                                            if last_cursor.1 < title_h as f64
                                                && window.fullscreen().is_none()
                                            {
                                                // 空白标题栏交给系统拖动
                                                let _ = window.drag_window();
                                                return;
                                            }
                                        }
                                        _ => {
                                            title_pressed = hit.tag();
                                            ui_consumed = true;
                                            return;
                                        }
                                    }
                                }
                            }
                            ElementState::Released => {
                                let tag = std::mem::replace(&mut title_pressed, -1);
                                let consumed = std::mem::replace(&mut ui_consumed, false);
                                if tag >= 0 {
                                    match tag {
                                        10 => window.set_minimized(true),
                                        11 => {
                                            let max = window.is_maximized();
                                            window.set_maximized(!max);
                                            ui::set_maximized(!max);
                                        }
                                        12 => elwt.exit(),
                                        2 => {
                                            ui::toggle_mute();
                                            bar_sig = None;
                                        }
                                        3 => {
                                            // 再次点击控制中心同样视为关闭
                                            panel_open = !panel_open;
                                            PANEL_OPEN_UI.store(panel_open, std::sync::atomic::Ordering::Relaxed);
                                        }
                                        1 if add_child.is_none() => {
                                            // 独立进程打开全新 webview profile 登录，原窗口不关闭
                                            tracing::info!("点击加号: 启动新增账号登录进程");
                                            match spawn_add_account() {
                                                Ok(c) => {
                                                    tracing::info!("新增账号登录进程 pid={}", c.id());
                                                    add_child = Some(c);
                                                }
                                                Err(e) => tracing::warn!("启动登录进程失败: {e:#}"),
                                            }
                                        }
                                        t if (100..200).contains(&t) => {
                                            // 点其他账号标签：另起一个带 --id 的进程并行运行，
                                            // 当前窗口/会话保持不动（多账号同时在线）
                                            if let Some(p) = store.sessions.get((t - 100) as usize) {
                                                if p.id != active_id {
                                                    let id = p.id.clone();
                                                    match spawn_profile(&id) {
                                                        Ok(c) => tracing::info!("并行启动账号 {id} pid={}", c.id()),
                                                        Err(e) => tracing::warn!("启动账号 {id} 失败: {e:#}"),
                                                    }
                                                }
                                            }
                                        }
                                        t if (200..300).contains(&t) => {
                                            // 叉 = 删除该账号并退出它的会话（本窗口或另一个进程的窗口）
                                            if let Some(p) = store.sessions.get((t - 200) as usize) {
                                                let id = p.id.clone();
                                                sessions::Store::mutate(|st| st.remove(&id));
                                                store = sessions::Store::load();
                                                if id == active_id {
                                                    elwt.exit();
                                                } else {
                                                    // 其他账号的窗口在 AboutToWait 里发现自己被移除后会自行退出
                                                    let tabs = store
                                                        .tabs()
                                                        .into_iter()
                                                        .map(|(id, name)| ui::SessionTab { id, name })
                                                        .collect();
                                                    ui::set_sessions(tabs, active_id.clone());
                                                    bar_sig = None;
                                                    panel_sig = None;
                                                }
                                            }
                                        }
                                        t if (300..400).contains(&t) => {
                                            ui::apply_quality((t - 300) as usize);
                                            bar_sig = None;
                                            panel_sig = None;
                                        }
                                        // 断线卡片「重新连接」：进程内重建 WebTransport 并重新握手
                                        // （复用同一 wasm 引擎/实例，不重启进程，避免实例与 --id 状态错位）
                                        600 => {
                                            tracing::info!("手动重新连接（进程内）");
                                            let _ = reconn_tx.send(ReconnCmd::Reconnect);
                                        }
                                        1 => tracing::info!(
                                            "加号点击被忽略: sessions={} 登录进程进行中={}",
                                            store.sessions.len(),
                                            add_child.is_some()
                                        ),
                                        _ => {}
                                    }
                                    return;
                                }
                                if consumed {
                                    return;
                                }
                            }
                        }
                    }
                    if let Some(op) = input::mouse_op(button) {
                        let st = if matches!(state, ElementState::Pressed) { 2 } else { 3 };
                        let mode = mouse_mode.load(std::sync::atomic::Ordering::Relaxed);
                        if mode == 0 && mouse.captured {
                            grab_armed = false;
                        }
                        // 能走到这里的点击都落在渲染区（标题栏/控件在前面已 return）
                        if st == 2 {
                            grab_armed = true;
                        }
                        apply_mode(&window, &mut mouse, mode, grab_armed);
                        mouse_call(&mouse, st, op, 0);
                    }
                }
                WindowEvent::MouseWheel { delta, .. } => {
                    // 官方:(…, Z3.MOUSE_WHEEL=4, Z3.MOUSE_WHEEL=4, ±120) —— value 归一化
                    let d = match delta {
                        winit::event::MouseScrollDelta::LineDelta(_, y) => y,
                        winit::event::MouseScrollDelta::PixelDelta(p) => p.y as f32,
                    };
                    mouse_call(&mouse, proto::z3::WHEEL, proto::z3::WHEEL, if d > 0.0 { 120 } else { -120 });
                }
                WindowEvent::KeyboardInput { event, .. } => {
                    use winit::keyboard::{KeyCode, PhysicalKey};
                    let esc = event.physical_key == PhysicalKey::Code(KeyCode::Escape);
                    if esc && event.state == ElementState::Pressed && panel_open {
                        panel_open = false;
                        PANEL_OPEN_UI.store(false, std::sync::atomic::Ordering::Relaxed);
                        return;
                    }
                    // 游戏习惯：Alt+Enter 切换无边框全屏。Alt 以系统状态兜底，
                    // 并忽略自动重复，避免按住时连续切换。
                    let enter = matches!(
                        event.physical_key,
                        PhysicalKey::Code(KeyCode::Enter) | PhysicalKey::Code(KeyCode::NumpadEnter)
                    );
                    if enter && (alt_down || alt_held()) {
                        if event.state == ElementState::Pressed && !event.repeat {
                            toggle_fullscreen(&window, hwnd, &mut saved_placement, &mut restore_placement_at);
                        }
                        return;
                    }
                    if let Some(vk) = input::vk_of(event.physical_key) {
                        let st = if event.state == ElementState::Pressed { 2 } else { 3 };
                        let _ = eng.send(WgcCmd::Call {
                            name: "key_event".into(),
                            args: vec![sid, st, vk],
                        });
                    }
                    if esc && event.state == ElementState::Pressed && mouse.captured {
                        // 用户 Esc → 临时释放(绝对模式);游戏下个 OnCursorData 会再切回
                        mouse_mode.store(0, std::sync::atomic::Ordering::Relaxed);
                        grab_armed = false;
                        apply_mode(&window, &mut mouse, 0, false);
                    }
                }
                WindowEvent::ModifiersChanged(m) => {
                    alt_down = m.state().alt_key();
                }
                WindowEvent::CursorMoved { position, .. } => {
                    let scale = window.scale_factor();
                    let sz = window.inner_size();
                    if mouse.captured {
                        return;
                    }
                    let (px, py) = (position.x, position.y);
                    last_cursor = (px, py);
                    let edge = if window.is_maximized() || window.fullscreen().is_some() {
                        0
                    } else {
                        ui::edge_test(sz.width, sz.height, scale as f32, px, py)
                    };
                    let hit = if title_h == 0 && !panel_open {
                        ui::Hit::None
                    } else {
                        ui::hit_test(sz.width, sz.height, scale as f32, px, py, panel_open)
                    };
                    let changed = edge != cursor_edge || hit.tag() != ui::hover();
                    cursor_edge = edge;
                    ui::set_hover(hit.tag());
                    if changed {
                        window.set_cursor(if edge != 0 {
                            match edge {
                                1 | 2 => winit::window::CursorIcon::EwResize,
                                4 | 8 => winit::window::CursorIcon::NsResize,
                                5 | 10 => winit::window::CursorIcon::NwseResize,
                                6 | 9 => winit::window::CursorIcon::NeswResize,
                                _ => winit::window::CursorIcon::Default,
                            }
                        } else if hit != ui::Hit::None && hit != ui::Hit::Signal {
                            winit::window::CursorIcon::Pointer
                        } else {
                            winit::window::CursorIcon::Default
                        });
                    }
                    if hit != ui::Hit::None || py < title_h as f64 {
                        return; // 标题栏/面板区域不产生游戏输入
                    }
                    // 视频区：窗口位置按 游戏坐标/视频显示尺寸 换算；游戏按实际码流分辨率命中
                    let vh = sz.height as f64 - title_h as f64;
                    if sz.width == 0 || vh <= 0.0 {
                        return;
                    }
                    let (gw, gh) = *game_size.lock().unwrap();
                    if gw <= 1 || gh <= 1 {
                        return;
                    }
                    let nx = px * gw as f64 / sz.width as f64;
                    let ny = (py - title_h as f64) * gh as f64 / vh;
                    mouse.cursor_x = nx.clamp(0.0, (gw - 1) as f64);
                    mouse.cursor_y = ny.clamp(0.0, (gh - 1) as f64);
                    mouse_call(&mouse, 1, proto::z3::MOV, 0);
                }
                WindowEvent::CursorLeft { .. } => {
                    if cursor_edge != 0 || ui::hover() != -1 {
                        cursor_edge = 0;
                        window.set_cursor(winit::window::CursorIcon::Default);
                    }
                    ui::set_hover(-1);
                }
                WindowEvent::RedrawRequested => {
                    if gpu_active.load(std::sync::atomic::Ordering::Relaxed) {
                        return; // 交换链由解码线程直接呈现
                    }
                    let (dw, dh) = {
                        let sz = window.inner_size();
                        (sz.width as usize, sz.height as usize)
                    };
                    if dw == 0 || dh == 0 {
                        return;
                    }
                    let top = (title_h as usize).min(dh);
                    let has_frame = frame.lock().unwrap().is_some();
                    let Ok(mut buf) = surface.buffer_mut() else { return };
                    {
                        let pixels: &mut [u32] = &mut buf;
                        if !has_frame {
                            // 与官方网页一致的加载中画面：黑底 + 29 帧精灵图循环
                            loading::draw(
                                pixels,
                                dw,
                                dh,
                                top,
                                started.elapsed(),
                                window.scale_factor() as f32,
                            );
                        } else if let Some(f) = &*frame.lock().unwrap() {
                            let vh = dh.saturating_sub(top).max(1);
                            for y in top..dh {
                                let sy = ((y - top) * f.h as usize / vh).min(f.h as usize - 1);
                                for x in 0..dw {
                                    let sx = (x * f.w as usize / dw).min(f.w as usize - 1);
                                    let o = (sy * f.w as usize + sx) * 4;
                                    pixels[y * dw + x] = u32::from_le_bytes([
                                        f.bgra[o], f.bgra[o + 1], f.bgra[o + 2], f.bgra[o + 3],
                                    ]);
                                }
                            }
                        }
                        // 缩放时标题栏位图可能还是旧宽度：按新行宽强行合成会拉丝，
                        // 这一帧先铺底色，等 AboutToWait 按新尺寸重绘后再合成。
                        if bar_pixels.len() == dw * top * 4 {
                            composite_overlay(pixels, dw, dh, 0, 0, &bar_pixels, dw, top);
                        } else if top > 0 {
                            let bg = u32::from_le_bytes([ui::BAR_RGB.0, ui::BAR_RGB.1, ui::BAR_RGB.2, 0xff]);
                            for y in 0..top {
                                pixels[y * dw..y * dw + dw].fill(bg);
                            }
                        }
                        if panel_open {
                            composite_overlay(
                                pixels,
                                dw,
                                dh,
                                panel_pos.0 as usize,
                                panel_pos.1 as usize,
                                &panel_pixels,
                                panel_size.0 as usize,
                                panel_size.1 as usize,
                            );
                        }
                        if hint_shown {
                            composite_overlay(
                                pixels,
                                dw,
                                dh,
                                hint_pos.0 as usize,
                                hint_pos.1 as usize,
                                &hint_pixels,
                                hint_size.0 as usize,
                                hint_size.1 as usize,
                            );
                        }
                        if status_shown {
                            composite_overlay(
                                pixels,
                                dw,
                                dh,
                                status_pos.0 as usize,
                                status_pos.1 as usize,
                                &status_pixels,
                                status_size.0 as usize,
                                status_size.1 as usize,
                            );
                        }
                    }
                    let _ = buf.present();
                }
                _ => {}
            },
            Event::AboutToWait => {
                if let Some(at) = resize_deadline {
                    if std::time::Instant::now() >= at {
                        resize_deadline = None;
                        let (w, h) = *video_area.lock().unwrap();
                        if w > 1 && h > 1 {
                            control::set_game_resolution(&eng, w, h);
                        }
                    }
                }
                // 采样实时接收码率 / 呈现帧率（标题栏状态区显示）
                ui::sample_stats();
                // 重连 / 游戏重启：切回 loading 页（覆盖冻结的最后一帧），新首帧到达后清除
                let restarting = ui::restart_loading();
                if restarting != was_restart_loading {
                    was_restart_loading = restarting;
                    if restarting {
                        restart_started = Some(std::time::Instant::now());
                        loading_overlay_frame = u64::MAX;
                        // CPU 路径：清掉最后一帧，RedrawRequested 会画 loading 页
                        *frame.lock().unwrap() = None;
                        let _ = render_tx.send(RenderCmd::Repaint);
                        window.request_redraw();
                    } else {
                        restart_started = None;
                        loading_overlay_frame = u64::MAX;
                        let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 3 });
                        let _ = render_tx.send(RenderCmd::Repaint);
                        window.request_redraw();
                    }
                }
                if restarting {
                    // 长时间回不来：别无限 loading，切断线卡片让用户手动重连
                    if restart_started.map_or(false, |t| t.elapsed() > std::time::Duration::from_secs(90)) {
                        tracing::warn!("loading 超过 90s，判定连接异常");
                        ui::set_restart_loading(false);
                        ui::set_conn(ui::Conn::Lost, "游戏重启超时，请重新连接");
                    } else {
                        let scale = window.scale_factor() as f32;
                        let sz2 = window.inner_size();
                        let gpu_now = gpu_active.load(std::sync::atomic::Ordering::Relaxed);
                        let idx = loading::frame_index(started.elapsed());
                        if idx != loading_overlay_frame {
                            loading_overlay_frame = idx;
                            if gpu_now && sz2.width > 0 && sz2.height > 0 {
                                let (px, lw, lh) = loading::render_overlay(started.elapsed(), scale);
                                if lw > 0 && lh > 0 {
                                    let x = sz2.width.saturating_sub(lw) / 2;
                                    let vh = sz2.height.saturating_sub(title_h);
                                    let y = title_h + vh.saturating_sub(lh) / 2;
                                    let _ = render_tx.send(RenderCmd::Overlay {
                                        slot: 3,
                                        x,
                                        y,
                                        w: lw,
                                        h: lh,
                                        pixels: px,
                                    });
                                    let _ = render_tx.send(RenderCmd::Repaint);
                                }
                            } else {
                                window.request_redraw();
                            }
                        }
                    }
                }
                // UI 侧看门狗只在服务端心跳失联时判定（loading 期间不判）。
                // 不能按“有没有视频帧/媒体包”判定：游戏加载界面会短暂 FPS 0，音频也未必持续。
                // 官方 Sc=3000：收到过 GSProxyHeartbeat 后 3s 没再收到 → 服务端失联
                let watch = !ui::restart_loading();
                if watch && ui::conn() == ui::Conn::Connected && ui::gs_beat_idle_ms() > 3000 {
                    tracing::warn!("{}s 未收到 GSProxyHeartbeat，判定断线", ui::gs_beat_idle_ms() / 1000);
                    ui::set_conn(ui::Conn::Lost, "游戏服务器连接断开，请重新连接");
                }
                // 多窗口共享一份账号列表：本账号被别的窗口删掉时自行退出；
                // 列表有变化（别处新增/删除/改名）就刷新标签
                {
                    static TICK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                    let n = TICK.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    if n % 6 == 0 {
                        let fresh = sessions::Store::load();
                        if !active_id.is_empty() && fresh.get(&active_id).is_none() {
                            tracing::info!("账号 {active_id} 已被删除，退出窗口");
                            elwt.exit();
                            return;
                        }
                        let fresh_tabs: Vec<(String, String)> = fresh.tabs();
                        let cur_tabs: Vec<(String, String)> = store.tabs();
                        if fresh_tabs != cur_tabs {
                            store = fresh;
                            let tabs = store
                                .tabs()
                                .into_iter()
                                .map(|(id, name)| ui::SessionTab { id, name })
                                .collect();
                            ui::set_sessions(tabs, active_id.clone());
                            bar_sig = None;
                            panel_sig = None;
                        }
                    }
                }
                // 新增账号进程退出：刷新标签列表（原窗口与当前会话保持不变）
                if let Some(child) = add_child.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            add_child = None;
                            tracing::info!("新增账号进程结束 status={status:?}");
                            if status.success() {
                                let fresh = sessions::Store::load();
                                store.sessions = fresh.sessions;
                                store.default = active_id.clone();
                                let tabs = store
                                    .tabs()
                                    .into_iter()
                                    .map(|(id, name)| ui::SessionTab { id, name })
                                    .collect();
                                ui::set_sessions(tabs, active_id.clone());
                                bar_sig = None;
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            tracing::warn!("新增账号进程状态读取失败: {e}");
                            add_child = None;
                        }
                    }
                }
                // 标题栏 / 面板内容变化才重绘
                let scale = window.scale_factor() as f32;
                let gpu = gpu_active.load(std::sync::atomic::Ordering::Relaxed);
                let full = window.fullscreen().is_some();
                ui::set_fullscreen(full);
                // 退出全屏后恢复进入前的窗口状态（位置 + 最大化），等 winit 自己的恢复先落地
                if let Some(at) = restore_placement_at {
                    if !full && std::time::Instant::now() >= at {
                        if let Some(wp) = saved_placement.take() {
                            let maxed = wp.showCmd
                                == windows::Win32::UI::WindowsAndMessaging::SW_SHOWMAXIMIZED.0 as u32;
                            apply_placement(hwnd, &wp);
                            // SetWindowPlacement 改变最大化状态时 winit 的 Resized 缓存可能滞后，
                            // 按真实客户区强制重排/重绘一次，否则界面/交换链仍是旧尺寸
                            if let Some((w, h)) = client_size(hwnd) {
                                title_h = ui::title_height(window.scale_factor());
                                TITLE_H.store(title_h, std::sync::atomic::Ordering::Relaxed);
                                *video_area.lock().unwrap() = (w, h.saturating_sub(title_h));
                                let _ = surface.resize(w.try_into().unwrap(), h.try_into().unwrap());
                                let _ = render_tx.send(RenderCmd::Resize { w, h, top: title_h });
                                let _ = render_tx.send(RenderCmd::Repaint);
                                ui::set_maximized(maxed);
                                bar_sig = None;
                                panel_sig = None;
                                window.request_redraw();
                            }
                        }
                        restore_placement_at = None;
                    }
                }
                // 全屏状态与标题栏高度对齐：窗口矩形可能恰好不变（系统不产生 Resized），
                // 不能只依赖 Resized 事件更新标题栏/视频区布局。
                let want_top = if full { 0 } else { ui::title_height(window.scale_factor()) };
                if want_top != title_h {
                    tracing::debug!("layout reconcile: full={full} title_h={title_h}->{want_top}");
                    title_h = want_top;
                    TITLE_H.store(title_h, std::sync::atomic::Ordering::Relaxed);
                    let sz = window.inner_size();
                    *video_area.lock().unwrap() = (sz.width, sz.height.saturating_sub(title_h));
                    let _ = surface.resize(sz.width.try_into().unwrap(), sz.height.try_into().unwrap());
                    let _ = render_tx.send(RenderCmd::Resize { w: sz.width, h: sz.height, top: title_h });
                    bar_sig = None;
                    if title_h == 0 {
                        let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 0 });
                    }
                    window.request_redraw();
                }
                let sz = window.inner_size();
                if full && !was_fullscreen {
                    hint_until = Some(std::time::Instant::now() + std::time::Duration::from_secs(2));
                }
                was_fullscreen = full;
                let stream = {
                    let (w, h) = ui::stream_px();
                    ((w as u64) << 32) | h as u64
                };
                let sig = BarSig {
                    w: sz.width,
                    top: title_h,
                    hover: ui::hover(),
                    quality: ui::quality() as u32,
                    muted: ui::muted(),
                    maximized: ui::is_maximized(),
                    gpu,
                    elapsed: ui::elapsed_secs(),
                    latency: ui::latency(),
                    stream,
                    net: (ui::net_bytes_per_sec() / 4096) as u32,
                    fps: ui::fps(),
                    nodes: ui::nodes_rev(),
                };
                if bar_sig != Some(sig) && sz.width > 0 && title_h > 0 {
                    bar_sig = Some(sig);
                    bar_pixels = ui::render_bar(sz.width, scale);
                    let _ = render_tx.send(RenderCmd::Overlay {
                        slot: 0,
                        x: 0,
                        y: 0,
                        w: sz.width,
                        h: title_h,
                        pixels: bar_pixels.clone(),
                    });
                    window.request_redraw();
                }
                if panel_open && sz.width > 0 {
                    let psig = (
                        sz.width,
                        ui::hover(),
                        ui::quality() as u32,
                        stream,
                        gpu,
                        ui::is_fullscreen(),
                        ui::nodes_rev(),
                    );
                    if panel_sig != Some(psig) {
                        panel_sig = Some(psig);
                        let pr = ui::panel_rect(sz.width, scale);
                        let (pixels, pw, ph) = ui::render_panel(scale);
                        panel_pos = (pr.left.max(0) as u32, pr.top.max(0) as u32);
                        panel_size = (pw, ph);
                        panel_pixels = pixels;
                        let _ = render_tx.send(RenderCmd::Overlay {
                            slot: 1,
                            x: panel_pos.0,
                            y: panel_pos.1,
                            w: pw,
                            h: ph,
                            pixels: panel_pixels.clone(),
                        });
                        panel_shown = true;
                        window.request_redraw();
                    }
                } else if panel_shown {
                    panel_shown = false;
                    panel_sig = None;
                    panel_pixels.clear();
                    let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 1 });
                    window.request_redraw();
                }
                // 断线时释放游戏鼠标捕获：否则光标不可见也点不到「重新连接」
                if ui::conn() == ui::Conn::Lost && mouse.captured {
                    grab_armed = false;
                    apply_mode(&window, &mut mouse, 0, false);
                }
                // 断线卡片：Lost 时贴在视频区中央（slot 2），恢复后清除
                let lost = ui::conn() == ui::Conn::Lost;
                if lost && sz.width > 0 {
                    let msg_hash = ui::conn_msg().bytes().fold(0u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32));
                    let ssig = (sz.width, sz.height, title_h, ui::hover(), gpu, msg_hash);
                    if status_sig != Some(ssig) {
                        status_sig = Some(ssig);
                        let r = ui::status_rect(sz.width, sz.height, scale);
                        let (pixels, sw, sh) = ui::render_status(scale);
                        status_pos = (r.left.max(0) as u32, r.top.max(0) as u32);
                        status_size = (sw, sh);
                        status_pixels = pixels;
                        let _ = render_tx.send(RenderCmd::Overlay {
                            slot: 2,
                            x: status_pos.0,
                            y: status_pos.1,
                            w: sw,
                            h: sh,
                            pixels: status_pixels.clone(),
                        });
                        // 停流时没有新视频帧，主动用最后一帧重画，否则卡片不会出现在交换链上
                        let _ = render_tx.send(RenderCmd::Repaint);
                        status_shown = true;
                        window.request_redraw();
                    }
                } else if status_shown {
                    status_shown = false;
                    status_sig = None;
                    status_pixels.clear();
                    let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 2 });
                    let _ = render_tx.send(RenderCmd::Repaint);
                    window.request_redraw();
                }
                // 全屏顶部提示：进入后显示 2 秒自动消失
                let hint_active =
                    full && hint_until.map_or(false, |t| std::time::Instant::now() < t);
                if hint_active {
                    if !hint_shown && sz.width > 0 {
                        let (pixels, hw, hh) = ui::render_hint(scale);
                        if hw > 0 && hh > 0 {
                            hint_size = (hw, hh);
                            hint_pos = ((sz.width.saturating_sub(hw)) / 2, (24.0 * scale).round() as u32);
                            hint_pixels = pixels;
                            let _ = render_tx.send(RenderCmd::Overlay {
                                slot: 0,
                                x: hint_pos.0,
                                y: hint_pos.1,
                                w: hw,
                                h: hh,
                                pixels: hint_pixels.clone(),
                            });
                            hint_shown = true;
                            window.request_redraw();
                        }
                    }
                } else if hint_shown {
                    hint_shown = false;
                    // 退出全屏时标题栏会重新占用 slot 0，无需单独清除
                    if full {
                        let _ = render_tx.send(RenderCmd::ClearOverlay { slot: 0 });
                    }
                    window.request_redraw();
                }
                if !gpu {
                    // 软呈现：加载动画只在帧序号变化时重绘（避免缩放时 60fps 全窗重绘拖慢拖动）
                    if frame.lock().unwrap().is_some() {
                        window.request_redraw();
                    } else {
                        let idx = loading::frame_index(started.elapsed());
                        if idx != loading_frame {
                            loading_frame = idx;
                            window.request_redraw();
                        }
                    }
                }
            }
            _ => {}
        }
    })?;
    bail!("window closed")
}
