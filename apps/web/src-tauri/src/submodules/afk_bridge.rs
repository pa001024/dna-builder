//! 小小狩月人（官方工具 `AFKSupport.exe`）奖励管道接收端：传输与运行状态。
//!
//! 协议见 `specs/afk-support-protocol.md`：官方工具与游戏之间用命名管道
//! `\\.\pipe\TBH_RewardPipe` 通讯，**游戏是客户端、工具是服务端**，单向 UTF-8、
//! 一行一个 JSON、无握手无 ACK。因此本模块实现的是「服务端」：建实例、等连接、
//! 把字节流交给 [`super::afk_protocol`] 切帧解码，再通过 Tauri 事件推给前端。
//!
//! 与官方工具的互斥关系：管道名同一时刻只应有一个服务端在用，本模块默认不启动，
//! 由设置页开关显式开启（见 `apps/web/src/store/afkSupport.ts`）。

use std::sync::Mutex;
use std::time::Duration;

use lazy_static::lazy_static;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use super::afk_protocol::{
    AfkEvent, AfkParseError, LineSplitter, MAX_LINE_BYTES, now_ms, parse_event,
};

#[cfg(windows)]
use tokio::io::AsyncReadExt;
#[cfg(windows)]
use tokio::net::windows::named_pipe::{PipeMode, ServerOptions};

/// 管道路径。名字来自官方 `Res/config/app.json` 的 `pipeName`，游戏侧写死。
pub const AFK_PIPE_NAME: &str = r"\\.\pipe\TBH_RewardPipe";
/// 单条事件的前端事件名。
pub const AFK_EVENT_NAME: &str = "afk-support://event";
/// 连接状态变化的前端事件名。
pub const AFK_STATUS_NAME: &str = "afk-support://status";
/// 管道断开后的重建间隔（与官方 `PipeServer` 的 1 s 一致）。
#[cfg(windows)]
const RECONNECT_DELAY: Duration = Duration::from_millis(1000);
/// 读缓冲大小。
#[cfg(windows)]
const READ_CHUNK: usize = 4096;

lazy_static! {
    /// 后台任务的句柄；`Some` 表示接收端在运行（`abort()` 即可停止）。
    static ref AFK_TASK: Mutex<Option<tauri::async_runtime::JoinHandle<()>>> = Mutex::new(None);
    /// 接收端运行状态，供 `afk_bridge_status` 命令读取。
    static ref AFK_STATUS: Mutex<AfkBridgeStatus> = Mutex::new(AfkBridgeStatus::default());
}

/// 接收端运行状态（Rust 侧唯一事实来源，变化时推给前端）。
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AfkBridgeStatus {
    /// 接收端是否已启动（等连接也算运行中）
    pub running: bool,
    /// 是否已有客户端（游戏）连上
    pub connected: bool,
    /// 本次连接建立时刻（Unix 毫秒）
    pub connected_at: Option<u64>,
    /// 累计成功解码并下发的事件数
    pub received: u64,
    /// 累计丢弃的行数（JSON 非法、必填字段缺失、官方规则下不处理的消息）
    pub dropped: u64,
    /// 最近一条事件时刻（Unix 毫秒）
    pub last_event_at: Option<u64>,
    /// 最近一次错误（建管道失败、读失败等）；成功后不清空，便于排查
    pub last_error: Option<String>,
}

/// 把一行原始字节解析成事件并交给 `on_event`；解析失败只计入丢弃统计。
///
/// @param line 一行的字节（不含行尾分隔符）
/// @param on_event 事件接收回调
#[cfg(windows)]
fn dispatch_line(line: &[u8], on_event: &mut impl FnMut(AfkEvent)) {
    let text = String::from_utf8_lossy(line);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    match parse_event(trimmed) {
        Ok(kind) => {
            let event = AfkEvent {
                received_at: now_ms(),
                raw: trimmed.to_string(),
                kind,
            };
            update_status(|s| {
                s.received += 1;
                s.last_event_at = Some(event.received_at);
            });
            on_event(event);
        }
        Err(err) => {
            update_status(|s| {
                s.dropped += 1;
                if let AfkParseError::Json(msg) = &err {
                    s.last_error = Some(format!("解析失败: {msg}"));
                }
            });
        }
    }
}

/// 读出当前状态的快照。
fn snapshot() -> AfkBridgeStatus {
    AFK_STATUS.lock().map(|s| s.clone()).unwrap_or_default()
}

/// 修改全局状态并返回修改后的快照。
///
/// @param f 状态变更闭包
/// @returns 变更后的快照
fn update_status(f: impl FnOnce(&mut AfkBridgeStatus)) -> AfkBridgeStatus {
    let mut guard = match AFK_STATUS.lock() {
        Ok(g) => g,
        Err(_) => return AfkBridgeStatus::default(),
    };
    f(&mut guard);
    guard.clone()
}

/// 修改状态并推给前端。
///
/// @param app Tauri 应用句柄
/// @param f 状态变更闭包
fn mutate_status(app: &AppHandle, f: impl FnOnce(&mut AfkBridgeStatus)) {
    let snap = update_status(f);
    let _ = app.emit(AFK_STATUS_NAME, &snap);
}

/// 读取当前状态（供 `afk_bridge_status` 命令使用）。
pub fn get_afk_bridge_status() -> AfkBridgeStatus {
    snapshot()
}

/// 启动接收端。已运行时幂等返回当前状态。
///
/// @param app Tauri 应用句柄（后台任务用它发事件）
/// @returns 启动后的状态
pub fn start_afk_bridge(app: AppHandle) -> AfkBridgeStatus {
    {
        let mut task = match AFK_TASK.lock() {
            Ok(t) => t,
            Err(_) => return snapshot(),
        };
        if task.is_some() {
            return snapshot();
        }
        mutate_status(&app, |s| {
            s.running = true;
            s.connected = false;
            s.connected_at = None;
            s.last_error = None;
        });
        let handle = app.clone();
        // 同步命令不在 tokio 运行时上下文里，必须用 Tauri 的全局运行时派生任务，否则 `tokio::spawn` 会 panic
        *task = Some(tauri::async_runtime::spawn(async move {
            run_pipe_server(handle).await
        }));
    }
    snapshot()
}

/// 停止接收端：中止后台任务（下一处 `await` 立即生效），并释放管道实例。
///
/// @param app Tauri 应用句柄（用于推送停止后的状态）
/// @returns 停止后的状态
pub async fn stop_afk_bridge(app: &AppHandle) -> AfkBridgeStatus {
    let handle = match AFK_TASK.lock() {
        Ok(mut t) => t.take(),
        Err(_) => None,
    };
    if let Some(h) = handle {
        h.abort();
        let _ = tokio::time::timeout(Duration::from_secs(2), h).await;
    }
    mutate_status(app, |s| {
        s.running = false;
        s.connected = false;
        s.connected_at = None;
    });
    snapshot()
}

/// 管道服务主循环：建实例 → 等连接 → 逐行读 → 断开后重建（与官方 `PipeServer.RunAsync` 同构）。
///
/// 只负责 I/O 与解码，事件与状态都通过回调抛出，因此可以在不启动 Tauri 的情况下做端到端测试。
///
/// @param name 管道路径
/// @param on_event 解码成功的事件回调
/// @param on_status 状态变化回调
#[cfg(windows)]
async fn serve_loop(
    name: &str,
    mut on_event: impl FnMut(AfkEvent),
    mut on_status: impl FnMut(AfkBridgeStatus),
) {
    loop {
        let server = match ServerOptions::new()
            .first_pipe_instance(true)
            .pipe_mode(PipeMode::Byte)
            .access_inbound(true)
            // 与官方 PipeDirection.In 一致：客户端只有写权限
            .access_outbound(false)
            .max_instances(1)
            .in_buffer_size(65536)
            .create(name)
        {
            Ok(s) => s,
            Err(e) => {
                on_status(update_status(|s| {
                    s.connected = false;
                    s.connected_at = None;
                    s.last_error =
                        Some(format!("创建管道失败（官方小小狩月人是否正在运行？）: {e}"));
                }));
                tokio::time::sleep(RECONNECT_DELAY).await;
                continue;
            }
        };
        if let Err(e) = server.connect().await {
            on_status(update_status(|s| {
                s.connected = false;
                s.connected_at = None;
                s.last_error = Some(format!("等待连接失败: {e}"));
            }));
            tokio::time::sleep(RECONNECT_DELAY).await;
            continue;
        }
        on_status(update_status(|s| {
            s.connected = true;
            s.connected_at = Some(now_ms());
            s.last_error = None;
        }));

        let mut server = server;
        let mut splitter = LineSplitter::default();
        let mut chunk = [0u8; READ_CHUNK];
        loop {
            match server.read(&mut chunk).await {
                Ok(0) => break,
                Ok(n) => {
                    let overflow =
                        splitter.push_with(&chunk[..n], |line| dispatch_line(line, &mut on_event));
                    if overflow {
                        // 流已错位：丢半包并重新同步
                        on_status(update_status(|s| {
                            s.dropped += 1;
                            s.last_error =
                                Some(format!("单行超过 {} KiB，丢弃半包", MAX_LINE_BYTES / 1024));
                        }));
                    }
                }
                Err(e) => {
                    on_status(update_status(|s| {
                        s.last_error = Some(format!("读管道失败: {e}"));
                    }));
                    break;
                }
            }
        }
        // 官方 ReadLine 在 EOF 时会返回最后一个不完整的行，这里保持一致
        if let Some(rest) = splitter.finish() {
            dispatch_line(rest, &mut on_event);
        }
        on_status(update_status(|s| {
            s.connected = false;
            s.connected_at = None;
        }));
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

/// Tauri 侧的后台任务：把 [`serve_loop`] 的回调转发成前端事件。
#[cfg(windows)]
async fn run_pipe_server(app: AppHandle) {
    let event_app = app.clone();
    let status_app = app;
    serve_loop(
        AFK_PIPE_NAME,
        move |event| {
            let _ = event_app.emit(AFK_EVENT_NAME, &event);
            // 计数在 Rust 侧累加，状态事件跟着每条事件走，设置页的「已接收/已丢弃」才不会停在连接时的快照
            let _ = event_app.emit(AFK_STATUS_NAME, &get_afk_bridge_status());
        },
        move |status| {
            let _ = status_app.emit(AFK_STATUS_NAME, &status);
        },
    )
    .await
}

#[cfg(not(windows))]
async fn run_pipe_server(app: AppHandle) {
    mutate_status(&app, |s| {
        s.last_error = Some("命名管道接收端仅支持 Windows".into());
    });
}

#[cfg(all(test, windows))]
mod tests {
    use super::super::afk_protocol::{AfkEventKind, REAL_DUNGEON, REAL_REWARD};
    use super::*;

    /// 端到端：真实命名管道 + 真实帧字节 → 逐行切分 → 解析成事件。
    ///
    /// 用独立管道名，避免与正在运行的接收端/官方工具抢 `TBH_RewardPipe`。
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn pipe_roundtrip_delivers_real_frames() {
        use tokio::io::AsyncWriteExt;
        use tokio::net::windows::named_pipe::ClientOptions;

        const TEST_PIPE: &str = r"\\.\pipe\TBH_RewardPipe-DnaBuilderTest";
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        tokio::spawn(async move {
            serve_loop(
                TEST_PIPE,
                move |event| {
                    let _ = tx.send(event);
                },
                |_| {},
            )
            .await
        });

        // 服务端实例在后台任务里创建，客户端可能先撞上 FILE_NOT_FOUND
        let mut client = None;
        for _ in 0..100 {
            match ClientOptions::new().read(false).write(true).open(TEST_PIPE) {
                Ok(c) => {
                    client = Some(c);
                    break;
                }
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        }
        let mut client = client.expect("连接测试管道失败");

        // 前两帧一次写入，其中 \r\n 跨两次写入切断；第三帧单独一次
        let head = format!("{REAL_REWARD}\r\n{REAL_DUNGEON}\r");
        let tail = format!("\n{}\n", r#"{"type":"language","lang":"zh"}"#);
        client.write_all(head.as_bytes()).await.unwrap();
        client.write_all(tail.as_bytes()).await.unwrap();
        client.flush().await.unwrap();

        let mut kinds = Vec::new();
        for _ in 0..3 {
            let event = tokio::time::timeout(Duration::from_secs(2), rx.recv())
                .await
                .expect("等待事件超时")
                .expect("通道已关闭");
            kinds.push(event.kind);
        }
        assert_eq!(
            kinds,
            vec![
                AfkEventKind::Reward {
                    id: Some(51007),
                    name: "坚守".into(),
                    rarity: 5,
                    count: 1
                },
                AfkEventKind::Dungeon {
                    id: "616006".into(),
                    status: "complete".into(),
                    name: "避险".into()
                },
                AfkEventKind::Language { lang: "zh".into() },
            ]
        );
    }
}
