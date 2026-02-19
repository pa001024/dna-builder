use std::{
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use hotwatch::{Event, EventKind, Hotwatch};
use lazy_static::lazy_static;
use reqwest::multipart;
use serde::{Deserialize, Serialize};

use tauri::{Emitter, Manager};
use zip::ZipArchive;
mod util;

// 全局HTTP客户端，用于复用连接
lazy_static! {
    static ref HTTP_CLIENT: Arc<reqwest::Client> = Arc::new(
        reqwest::Client::builder()
            // 启用keepalive，设置超时为2分钟
            .tcp_keepalive(Some(Duration::from_secs(120)))
            // 设置连接超时为10秒
            .connect_timeout(Duration::from_secs(10))
            // 设置连接池最大空闲时间为2分钟
            .pool_idle_timeout(Some(Duration::from_secs(120)))
            // 允许最大连接数
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to create HTTP client")
    );
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
enum FormDataValue {
    Text(String),
    File {
        filename: String,
        data: Vec<u8>,
        mime: Option<String>,
    },
}

/// 下载分块进度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChunkProgress {
    /// 分块索引
    index: usize,
    /// 分块起始位置
    start: u64,
    /// 分块结束位置
    end: u64,
    /// 已下载字节数
    downloaded: u64,
    /// 是否已完成
    completed: bool,
}

/// 下载进度文件
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadProgress {
    /// 文件总大小
    total_size: u64,
    /// 分块大小
    chunk_size: u64,
    /// 分块总数
    num_chunks: usize,
    /// 各分块进度
    chunks: Vec<ChunkProgress>,
}

// #[macro_use]
// extern crate lazy_static;
// const GAME_PROCESS: &str = "EM.exe";
const GAME_PROCESS: &str = "EM-Win64-Shipping.exe";

// 导入WebSocket相关依赖
use futures_util::{SinkExt, StreamExt};
use http::header::HeaderValue;
use std::sync::Mutex;
use tokio::sync::mpsc;
use tokio::time;
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::protocol::Message,
};
use url::Url;

// 定义发往WebSocket Actor的指令
enum WsCommand {
    SendText(String),
    Close,
}

// 全局状态：只保存发送端 (Sender)
// 使用Mutex包裹Option，因为初始化前Sender不存在
lazy_static! {
    static ref WS_TX: Mutex<Option<mpsc::UnboundedSender<WsCommand>>> = Mutex::new(None);
    static ref WS_CONFIG: Mutex<Option<(String, String)>> = Mutex::new(None); // (userId, token)
    static ref HOTWATCH: Arc<Mutex<Option<Hotwatch>>> = Arc::new(Mutex::new(None));
}

/// WebSocket消息响应结构
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
#[allow(non_snake_case)]
struct WsResponse {
    code: u32,
    data: String,
    eventType: u32,
    msg: String,
}

/// 初始化全局WebSocket客户端
/// 参数：连接地址、token、user_id、心跳间隔（秒）
/// 返回值：返回一个Receiver，用于接收第一条消息的data值
fn init_global_ws(
    url_str: &str,
    token: &str,
    user_id: &str,
    interval: u64,
) -> tokio::sync::oneshot::Receiver<String> {
    let (tx, mut rx) = mpsc::unbounded_channel::<WsCommand>();

    // 创建一次性通道
    let (first_msg_tx, first_msg_rx) = tokio::sync::oneshot::channel();

    // 将发送端存入全局变量
    {
        let mut global_tx = WS_TX.lock().unwrap();
        *global_tx = Some(tx);
    }

    // 保存配置信息
    {
        let mut global_config = WS_CONFIG.lock().unwrap();
        *global_config = Some((user_id.to_string(), token.to_string()));
    }

    let url = Url::parse(url_str).expect("Invalid URL");
    let token = token.to_string();
    let user_id = user_id.to_string();

    // 启动后台异步任务处理连接
    tokio::spawn(async move {
        // 使用Option包裹发送端，方便take()拿走所有权
        let mut on_connect_tx = Some(first_msg_tx);

        loop {
            println!("[WS] Connecting to {}...", url);

            // 1. 构建带有自定义Header的请求
            let request = {
                let mut req = url.as_str().into_client_request().expect("Bad Request");
                let req_headers = req.headers_mut();
                // 添加token请求头
                req_headers.insert("token", HeaderValue::from_str(&token).unwrap());
                req_headers.insert("appVersion", HeaderValue::from_str("1.2.0").unwrap());
                req_headers.insert("sourse", HeaderValue::from_str("android").unwrap());
                req
            };

            // 2. 建立连接
            match connect_async(request).await {
                Ok((ws_stream, _response)) => {
                    println!("[WS] Connected!");
                    let (mut write, mut read) = ws_stream.split();

                    // 3. 进入消息循环 (Select Loop)
                    loop {
                        tokio::select! {
                            // A. 处理应用层发出的发送指令
                            cmd = rx.recv() => {
                                match cmd {
                                    Some(WsCommand::SendText(text)) => {
                                        if let Err(e) = write.send(Message::Text(text.into())).await {
                                            eprintln!("[WS] Send error: {}", e);
                                            break; // 发送失败，跳出内部循环，触发重连
                                        }
                                    }
                                    Some(WsCommand::Close) => {
                                        // 发送关闭指令
                                        if let Err(e) = write.send(Message::Close(None)).await {
                                            eprintln!("[WS] Close error: {}", e);
                                        }
                                        println!("[WS] Closing connection...");
                                        return; // 关闭连接，结束任务
                                    }
                                    None => return, // 通道关闭，彻底结束任务
                                }
                            }

                            // B. 每interval秒发送一次心跳消息
                            _ = time::sleep(time::Duration::from_secs(interval)) => {
                                // 发送ping消息
                                let ping_message = format!(r#"{{"data":{{"userId":"{}"}},"event":"ping"}}"#, user_id);
                                if let Err(e) = write.send(Message::Text(ping_message.clone().into())).await {
                                    eprintln!("[WS] Heartbeat failed: {}", e);
                                    break; // 发送失败，跳出内部循环，触发重连
                                }
                                println!("[WS] Ping sent: {}", ping_message);
                            }

                            // C. 处理接收到的WebSocket消息
                            msg = read.next() => {
                                match msg {
                                    Some(Ok(message)) => {
                                        match message {
                                            Message::Text(t) => {
                                                // 将Utf8Payload转换为&str
                                                let text = t.to_string();
                                                println!("[WS] Received Text: {}", text);

                                                // 检查on_connect_tx是否还在？如果在，说明是第一条消息
                                                if let Some(tx) = on_connect_tx.take() {
                                                    // 尝试解析消息
                                                    match serde_json::from_str::<WsResponse>(&text) {
                                                        Ok(response) => {
                                                            // 创建数据副本
                                                            let data_copy = response.data.clone();
                                                            // 发送data值给调用者
                                                            let _ = tx.send(response.data);
                                                            println!("[WS] First message received and returned: {}", data_copy);
                                                        },
                                                        Err(e) => {
                                                            eprintln!("[WS] Failed to parse first message: {}", e);
                                                            // 发送空字符串
                                                            let _ = tx.send(String::new());
                                                        }
                                                    }
                                                }
                                            }
                                            Message::Binary(b) => println!("[WS] Received Bytes: {} bytes", b.len()),
                                            Message::Pong(_) => println!("[WS] Received Pong"), // 收到服务器对Ping的回复
                                            Message::Close(_) => {
                                                println!("[WS] Server closed connection");
                                                break;
                                            }
                                            Message::Ping(_) => {
                                                // tungstenite默认会自动回复Pong，这里通常不需要手动处理
                                            }
                                            _ => {}
                                        }
                                    }
                                    Some(Err(e)) => {
                                        eprintln!("[WS] Read error: {}", e);
                                        break;
                                    }
                                    None => {
                                        eprintln!("[WS] Stream ended");
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[WS] Connection failed: {}", e);
                }
            }

            // 断线重连等待
            println!("[WS] Reconnecting in 5 seconds...");
            time::sleep(time::Duration::from_secs(5)).await;
        }
    });

    // 返回接收第一条消息的Receiver
    first_msg_rx
}

/// 公共API：发送消息
#[tauri::command]
fn send_ws_msg(text: String) {
    let tx_guard = WS_TX.lock().unwrap();
    if let Some(tx) = &*tx_guard {
        if let Err(e) = tx.send(WsCommand::SendText(text)) {
            eprintln!("Failed to enqueue message: {}", e);
        }
    } else {
        eprintln!("WS Client not initialized yet!");
    }
}

// 启动心跳
#[tauri::command]
async fn start_heartbeat(
    url: String,
    token: String,
    user_id: String,
    interval: u64,
) -> Result<String, String> {
    // 检查是否已存在WebSocket客户端，如果存在则先关闭
    let need_restart = {
        let tx_guard = WS_TX.lock().unwrap();
        tx_guard.is_some()
    };

    if need_restart {
        eprintln!("[WS] Existing client found, closing...");

        // 2. 保存发送端以便发送关闭指令
        let opt_tx = {
            let tx_guard = WS_TX.lock().unwrap();
            tx_guard.clone()
        };

        // 3. 发送关闭指令
        if let Some(tx) = opt_tx {
            let _ = tx.send(WsCommand::Close);
        }

        // 4. 清空全局状态
        {
            let mut global_tx = WS_TX.lock().unwrap();
            *global_tx = None;

            let mut global_config = WS_CONFIG.lock().unwrap();
            *global_config = None;
        }

        // 5. 短暂延迟，确保旧连接完全关闭
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // 初始化全局WebSocket客户端，获取接收第一条消息的Receiver
    let first_msg_rx = init_global_ws(&url, &token, &user_id, interval);

    // 等待第一条消息
    match first_msg_rx.await {
        Ok(data) => Ok(data),
        Err(e) => {
            eprintln!("[WS] Failed to receive first message: {}", e);
            Err("Failed to receive first message".to_string())
        }
    }
}

// 停止心跳
#[tauri::command]
async fn stop_heartbeat() -> Result<(), String> {
    // 发送关闭指令
    let opt_tx = {
        let tx_guard = WS_TX.lock().unwrap();
        tx_guard.clone()
    };
    if let Some(tx) = opt_tx {
        if let Err(e) = tx.send(WsCommand::Close) {
            eprintln!("Failed to send close command: {}", e);
        }
        // 清空全局状态
        let mut global_tx = WS_TX.lock().unwrap();
        *global_tx = None;

        let mut global_config = WS_CONFIG.lock().unwrap();
        *global_config = None;
    }
    Ok(())
}

// 退出程序
#[tauri::command]
async fn app_close(app_handle: tauri::AppHandle) {
    // let Some(window) = app_handle.get_webview_window("main") else {
    //     return app_handle.exit(0);
    // };
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
        app_handle.save_window_state(StateFlags::all()).ok(); // don't really care if it saves it
    }
    // if let Err(_) = window.close() {
    return app_handle.exit(0);
    // }
}

#[tauri::command]
async fn get_local_qq(port: u32) -> String {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    if let Ok(res) = {
        client.get("https://xui.ptlogin2.qq.com/cgi-bin/xlogin?s_url=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump").send().await
    } {
        let val = res
            .cookies()
            .into_iter()
            .find(|x| x.name() == "pt_local_token")
            .unwrap()
            .value()
            .to_string();

        if let Ok(res) = {
            let url = format!(
                "https://localhost.ptlogin2.qq.com:{}/pt_get_uins?callback=ptui_getuins_CB&pt_local_tk={}",
                port, val
            );
            client
                .get(url)
                .header("Referer", "https://xui.ptlogin2.qq.com/")
                .send()
                .await
        } {
            let text = res.text().await.unwrap();
            if text.len() > 57 {
                let s = text.as_str();
                let s = &s[21..text.len() - 35];
                return s.to_string();
            }
        }
    }

    return "[]".to_string();
}

fn is_zip_file(path: &Path) -> io::Result<bool> {
    let meta = fs::metadata(path)?;
    if meta.is_dir() {
        return Ok(false);
    }
    let mut file = File::open(path)?;
    let mut signature = [0u8; 6];
    let read = file.read(&mut signature)?;

    // 检查是否是ZIP文件 (PK)
    if read >= 2 && signature[0] == b'P' && signature[1] == b'K' {
        return Ok(true);
    }

    // 检查是否是7z文件 (7z)
    if read >= 6 && &signature[..6] == &[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        return Ok(true);
    }

    Ok(false)
}

fn extract_zip_into(
    archive_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
    app_handle: Option<&tauri::AppHandle>,
) -> io::Result<()> {
    let file = File::open(archive_path)?;

    // 检查文件签名以确定文件类型
    let mut signature = [0u8; 6];
    let mut file_clone = file.try_clone()?;
    let read = file_clone.read(&mut signature)?;

    // 重置文件指针
    drop(file_clone);
    let file = File::open(archive_path)?;

    // 处理ZIP文件
    if read >= 2 && signature[0] == b'P' && signature[1] == b'K' {
        let mut archive = ZipArchive::new(file)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
        let total_files = archive.len();

        // 计算总大小
        let mut total_size = 0;
        for i in 0..total_files {
            if let Ok(entry) = archive.by_index(i) {
                if !entry.is_dir() {
                    total_size += entry.size();
                }
            }
        }

        // 发送开始解压的进度
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": 0,
                    "current_size": 0,
                    "total_files": total_files,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }

        // 重置归档以便重新读取
        let file = File::open(archive_path)?;
        let mut archive = ZipArchive::new(file)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;

        let mut current_file_index = 0;
        let mut current_size = 0;

        for (_i, entry_index) in (0..total_files).enumerate() {
            let mut entry = archive
                .by_index(entry_index)
                .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
            if entry.is_dir() {
                continue;
            }

            // 增加当前文件索引和大小
            current_file_index += 1;
            current_size += entry.size();

            let relative = entry.mangled_name();
            let out_path = target_dir.join(relative);
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut extracted = File::create(&out_path)?;
            io::copy(&mut entry, &mut extracted)?;
            output.push((out_path.to_string_lossy().to_string(), entry.size()));

            // 发送进度更新
            if let Some(app) = app_handle {
                let _ = app.emit(
                    "extract_progress",
                    serde_json::json!({
                        "current_file_count": current_file_index,
                        "current_size": current_size,
                        "total_files": total_files,
                        "total_size": total_size,
                        "current_file": entry.name(),
                    }),
                );
            }
        }

        // 发送解压完成的进度
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": current_file_index,
                    "current_size": current_size,
                    "total_files": current_file_index,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }
    }
    // 处理7z文件
    else if read >= 6 && &signature[..6] == &[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        // 导入 sevenz_rust2 的必要类型
        use sevenz_rust2::{ArchiveEntry, Error};
        use std::io::Read;
        use std::path::PathBuf;

        // 第一次调用：只计算文件数量和大小，不写入文件
        let mut total_files = 0;
        let mut total_size = 0;

        match sevenz_rust2::decompress_file_with_extract_fn(
            archive_path,
            target_dir,
            |entry: &ArchiveEntry, _reader: &mut dyn Read, _path: &PathBuf| {
                // 只统计文件，跳过目录
                if !entry.is_directory() {
                    total_files += 1;
                    total_size += entry.size();
                }
                Ok(true) // 继续处理下一个条目，但不写入文件
            },
        ) {
            Err(err) => {
                return Err(io::Error::new(io::ErrorKind::Other, format!("{:?}", err)));
            }
            _ => {}
        }

        // 发送开始解压的进度（使用实际计算的文件数量和大小）
        if let Some(app) = app_handle {
            let _ = app.emit(
                "extract_progress",
                serde_json::json!({
                    "current_file_count": 0,
                    "current_size": 0,
                    "total_files": total_files,
                    "total_size": total_size,
                    "current_file": "",
                }),
            );
        }

        // 第二次调用：实际解压文件并更新进度
        let mut current_file_index = 0;
        let mut current_size = 0;
        let app_handle_clone = app_handle.clone();

        match sevenz_rust2::decompress_file_with_extract_fn(
            archive_path,
            target_dir,
            move |entry: &ArchiveEntry, reader: &mut dyn Read, path: &PathBuf| {
                // 跳过目录
                if entry.is_directory() {
                    return Ok(true);
                }

                // 增加当前文件索引
                current_file_index += 1;
                // 更新当前处理的大小
                current_size += entry.size();

                // 发送解压进度
                if let Some(app) = &app_handle_clone {
                    let _ = app.emit(
                        "extract_progress",
                        serde_json::json!({
                            "current_file_count": current_file_index,
                            "current_size": current_size,
                            "total_files": total_files,
                            "total_size": total_size,
                            "current_file": entry.name(),
                        }),
                    );
                }

                // 处理目录和文件
                if entry.is_directory() {
                    // 创建目录
                    if !path.exists() {
                        if let Err(e) = std::fs::create_dir_all(path) {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }
                    }
                } else {
                    // 确保父目录存在
                    if let Some(parent) = path.parent() {
                        if !parent.exists() {
                            if let Err(e) = std::fs::create_dir_all(parent) {
                                return Err(Error::from(std::io::Error::new(
                                    std::io::ErrorKind::Other,
                                    e,
                                )));
                            }
                        }
                    }

                    // 创建文件并写入内容
                    use std::io::BufWriter;
                    let file = match std::fs::File::create(path) {
                        Ok(f) => f,
                        Err(e) => {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }
                    };

                    if entry.size() > 0 {
                        let mut writer = BufWriter::new(file);
                        if let Err(e) = std::io::copy(reader, &mut writer) {
                            return Err(Error::from(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                e,
                            )));
                        }

                        // 设置文件时间戳
                        use std::fs::FileTimes;
                        #[cfg(target_os = "macos")]
                        use std::os::macos::fs::FileTimesExt;
                        #[cfg(windows)]
                        use std::os::windows::fs::FileTimesExt;

                        let file = writer.get_mut();
                        let file_times = FileTimes::new()
                            .set_accessed(entry.access_date().into())
                            .set_modified(entry.last_modified_date().into());

                        #[cfg(any(windows, target_os = "macos"))]
                        let file_times = file_times.set_created(entry.creation_date().into());

                        let _ = file.set_times(file_times);
                    }
                }

                // 添加到输出列表
                if let Ok(metadata) = std::fs::metadata(path) {
                    let path_str = path.to_string_lossy().to_string();
                    output.push((path_str, metadata.len()));
                }

                Ok(true)
            },
        ) {
            Ok(_) => {
                // 发送解压完成的进度
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "extract_progress",
                        serde_json::json!({
                            "current_file_count": current_file_index,
                            "current_size": current_size,
                            "total_files": current_file_index,
                            "total_size": total_size,
                            "current_file": "",
                        }),
                    );
                }
            }
            Err(err) => {
                return Err(io::Error::new(io::ErrorKind::Other, format!("{:?}", err)));
            }
        }
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported archive format",
        ));
    }

    Ok(())
}

fn copy_regular_file(
    file_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
) -> io::Result<()> {
    if !file_path.is_file() {
        return Ok(());
    }
    let Some(file_name) = file_path.file_name() else {
        return Ok(());
    };
    let dest = target_dir.join(file_name);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(file_path, &dest)?;
    let size = fs::metadata(&dest)?.len();
    output.push((dest.to_string_lossy().to_string(), size));
    Ok(())
}

#[tauri::command]
fn import_mod(gamebase: String, paths: Vec<String>) -> String {
    let base_path = PathBuf::from(gamebase);
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare gamebase dir: {err}");
        return "[]".to_string();
    }

    let mut output: Vec<(String, u64)> = Vec::new();
    for raw in paths {
        let src = PathBuf::from(&raw);
        if !src.exists() {
            eprintln!("Path not found: {raw}");
            continue;
        }
        match is_zip_file(&src) {
            Ok(true) => {
                if let Err(err) = extract_zip_into(&src, &base_path, &mut output, None) {
                    eprintln!("Failed to extract {:?}: {err}", src);
                }
            }
            Ok(false) => {
                if let Err(err) = copy_regular_file(&src, &base_path, &mut output) {
                    eprintln!("Failed to copy {:?}: {err}", src);
                }
            }
            Err(err) => eprintln!("Failed to inspect {:?}: {err}", src),
        }
    }

    serde_json::to_string(&output).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn enable_mod(srcdir: String, dstdir: String, files: Vec<String>) -> String {
    let base_path = PathBuf::from(dstdir.clone());
    if let Err(err) = fs::create_dir_all(&base_path) {
        eprintln!("Failed to prepare moddir: {err}");
        return "[]".to_string();
    }
    // 将srcdir下的files移动到dstdir
    for file in files {
        let src = srcdir.clone() + "\\" + file.as_str();
        let dest = dstdir.clone() + "\\" + file.as_str();
        if let Err(err) = fs::rename(&src, &dest) {
            eprintln!("Failed to move {:?} -> {:?}: {err}", src, dest);
            return format!("Failed to move {:?} -> {:?}: {err}", src, dest);
        }
    }
    "".to_string()
}

#[tauri::command]
fn import_pic(path: String) -> Result<String, String> {
    // 导入图片 转换为dataurl
    let mut file = File::open(&path).map_err(|e| format!("无法打开文件: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 截取文件扩展名
    let ext = path
        .split(".")
        .last()
        .ok_or_else(|| "无效的文件路径".to_string())?;

    let data_url = format!(
        "data:image/{};base64,{}",
        ext,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buffer)
    );
    Ok(data_url)
}

#[tauri::command]
fn get_game_install() -> String {
    #[cfg(target_os = "windows")]
    {
        use winreg::{RegKey, enums::*};
        // 读取注册表
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = "Software\\Hero Games\\Duet Night Abyss";
        let sk = hkcu.open_subkey(key);
        if let Ok(sk) = sk {
            for file in sk
                .enum_keys()
                .map(|x| x.unwrap())
                .filter(|x| x.ends_with("EMLauncher.exe"))
            {
                // 截取文件夹路径
                let parts: Vec<&str> = file.split("\\").collect();
                let dir = &parts[..parts.len() - 1].join("\\");
                let game_dir = dir.to_string() + "\\DNA Game\\EM.exe";
                return game_dir;
            }
        }
    }
    return "".to_string();
}

#[tauri::command]
async fn is_game_running(is_run: bool) -> String {
    #[cfg(target_os = "windows")]
    {
        use crate::util::get_process_exe_path;

        let mut elapsed = Duration::from_secs(0);
        let timeout = Duration::from_secs(60 * 60); // 1h
        let interval = Duration::from_millis(500); // 500ms

        while elapsed <= timeout {
            let now_is_run = submodules::win::get_pid_by_name(GAME_PROCESS).unwrap_or(0) > 0;
            if now_is_run != is_run {
                break;
            }
            tokio::time::sleep(interval).await;
            elapsed += interval;
        }

        if !is_run {
            if let Ok(Some(path)) = get_process_exe_path(GAME_PROCESS) {
                return path;
            }
        }
    }
    "".to_string()
}

#[tauri::command]
async fn launch_exe(path: String, params: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute_runas;
        let pid = shell_execute_runas(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
}
#[tauri::command]
async fn launch_normal(path: String, params: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute;
        let pid = shell_execute(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
}

/// 以管理员权限重新启动当前程序
#[tauri::command]
async fn run_as_admin(app_handle: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::util::shell_execute_runas;
        use std::env;

        // 获取当前可执行文件路径
        let exe_path = env::current_exe().map_err(|e| format!("获取可执行文件路径失败: {}", e))?;

        // 使用 shell_execute 以管理员权限启动
        let exe_path_str = exe_path.to_string_lossy().to_string();
        let result = shell_execute_runas(&exe_path_str, None, None);

        match result {
            Ok(_) => {
                // 启动成功后退出当前进程
                let _ = app_handle.exit(0);
                Ok(true)
            }
            Err(e) => Err(format!("以管理员权限启动失败: {:?}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 检查当前进程是否以管理员权限运行
#[tauri::command]
fn check_is_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        use crate::util::is_elevated;
        match is_elevated() {
            Ok(is_admin) => is_admin,
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
fn apply_material(window: tauri::WebviewWindow, material: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::*;
        {
            let _ = clear_blur(&window);
            let _ = clear_acrylic(&window);
            let _ = clear_mica(&window);
            let _ = clear_tabbed(&window);
        }
        match material {
            "None" => {}
            "Blur" => {
                if apply_blur(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_blur' is only supported on Windows 7, Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Acrylic" => {
                if apply_acrylic(&window, Some((0, 0, 0, 0))).is_err() {
                    return "Unsupported platform! 'apply_acrylic' is only supported on Windows 10 v1809 or newer"
                .to_string();
                }
            }
            "Mica" => {
                if apply_mica(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Dark" => {
                if apply_mica(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed" => {
                if apply_tabbed(&window, Some(false)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            "Mica_Tabbed_Dark" => {
                if apply_tabbed(&window, Some(true)).is_err() {
                    return "Unsupported platform! 'apply_mica' is only supported on Windows 11"
                        .to_string();
                }
            }
            _ => return "Unsupported material!".to_string(),
        }
    }
    "Success".to_string()
}

// 定义响应结构体
#[derive(Debug, Clone, Deserialize, Serialize)]
struct FetchResponse {
    status: u16,
    body: String,
    headers: Vec<(String, String)>,
}

#[tauri::command]
async fn fetch(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<Vec<(String, String)>>,
    multipart: Option<Vec<(String, FormDataValue)>>,
) -> Result<FetchResponse, String> {
    let client = HTTP_CLIENT.clone();
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    if let Some(form_data) = multipart {
        let mut form = multipart::Form::new();
        for (key, value) in form_data {
            match value {
                FormDataValue::Text(text) => {
                    form = form.text(key, text);
                }
                FormDataValue::File {
                    filename,
                    data,
                    mime,
                } => {
                    let part = match mime {
                        Some(mime_type) => {
                            match multipart::Part::bytes(data.clone())
                                .file_name(filename.clone())
                                .mime_str(&mime_type)
                            {
                                Ok(p) => p,
                                Err(_) => multipart::Part::bytes(data).file_name(filename),
                            }
                        }
                        None => multipart::Part::bytes(data).file_name(filename),
                    };
                    form = form.part(key, part);
                }
            }
        }
        request_builder = request_builder.multipart(form);
    } else if let Some(ref b) = body {
        request_builder = request_builder.body(b.clone());
    }

    if let Some(h) = headers {
        for (key, value) in h {
            request_builder = request_builder.header(&key, &value);
        }
    }

    let response = request_builder.send().await;

    match response {
        Ok(resp) => {
            let status = resp.status();
            // 提取响应头
            let headers: Vec<(String, String)> = resp
                .headers()
                .iter()
                .map(|(name, value)| (name.to_string(), value.to_str().unwrap_or("").to_string()))
                .collect();

            let text = match resp.text().await {
                Ok(t) => t,
                Err(e) => return Err(format!("Failed to read response: {}", e)),
            };
            Ok(FetchResponse {
                status: status.as_u16(),
                body: text,
                headers,
            })
        }
        Err(e) => Err(format!("Request failed: {}", e)),
    }
}

/// 导出二进制文件到指定路径
#[tauri::command]
async fn export_binary_file(file_path: String, binary_content: Vec<u8>) -> Result<String, String> {
    // 创建文件路径
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    // 写入二进制内容到文件
    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&binary_content)
        .map_err(|e| format!("Failed to write binary content: {}", e))?;

    Ok(format!(
        "Successfully exported binary file to {}",
        file_path
    ))
}

/// 读取文本文件内容
#[tauri::command]
async fn read_text_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let content = fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;
    Ok(content)
}

/// 写入文本文件内容
#[tauri::command]
async fn write_text_file(file_path: String, content: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(format!("文件已保存: {}", file_path))
}

/// 获取文档目录路径
#[tauri::command]
fn get_documents_dir() -> String {
    #[cfg(target_os = "windows")]
    {
        use widestring::U16CStr;
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::FOLDERID_Documents;
        use windows::Win32::UI::Shell::KNOWN_FOLDER_FLAG;
        use windows::Win32::UI::Shell::SHGetKnownFolderPath;

        unsafe {
            let result = SHGetKnownFolderPath(&FOLDERID_Documents, KNOWN_FOLDER_FLAG(0), None);

            match result {
                Ok(path_ptr) => {
                    let ptr = path_ptr.as_ptr();
                    if ptr.is_null() {
                        return "C:/Users/Public/Documents".to_string();
                    }

                    let u16cstr = U16CStr::from_ptr_str(ptr);
                    let result = u16cstr.to_string_lossy().to_string();

                    CoTaskMemFree(Some(ptr as *const _));
                    result
                }
                Err(_) => "C:/Users/Public/Documents".to_string(),
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::env;
        if let Some(home) = env::var("HOME").ok() {
            let docs_dir = format!("{}/Documents", home);
            if Path::new(&docs_dir).exists() {
                return docs_dir;
            }
        }
        "/tmp".to_string()
    }
}

/// 获取进度文件路径
fn get_progress_file_path(file_path: &Path) -> PathBuf {
    let file_name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let parent = file_path.parent().unwrap_or(Path::new(""));
    let progress_file_name = format!("{}.progress", file_name);
    parent.join(progress_file_name)
}

/// 创建初始进度文件
fn create_progress_file(
    file_path: &Path,
    total_size: u64,
    chunk_size: u64,
    num_chunks: usize,
) -> Result<DownloadProgress, String> {
    let mut chunks = Vec::with_capacity(num_chunks);

    for i in 0..num_chunks {
        let start = i as u64 * chunk_size;
        let end = if i == num_chunks - 1 {
            total_size - 1
        } else {
            start + chunk_size - 1
        };

        chunks.push(ChunkProgress {
            index: i,
            start,
            end,
            downloaded: 0,
            completed: false,
        });
    }

    let progress = DownloadProgress {
        total_size,
        chunk_size,
        num_chunks,
        chunks,
    };

    // 写入进度文件
    let progress_path = get_progress_file_path(file_path);
    let progress_json = serde_json::to_string_pretty(&progress)
        .map_err(|e| format!("序列化进度文件失败: {}", e))?;

    fs::write(&progress_path, progress_json).map_err(|e| format!("写入进度文件失败: {}", e))?;

    Ok(progress)
}

/// 读取进度文件
fn read_progress_file(file_path: &Path) -> Option<DownloadProgress> {
    let progress_path = get_progress_file_path(file_path);

    if !progress_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&progress_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 更新进度文件中的单个分块
fn update_chunk_progress(
    file_path: &Path,
    chunk_index: usize,
    downloaded: u64,
    completed: bool,
) -> Result<(), String> {
    let mut progress = read_progress_file(file_path).ok_or("进度文件不存在")?;

    if chunk_index >= progress.chunks.len() {
        return Err("分块索引超出范围".to_string());
    }

    progress.chunks[chunk_index].downloaded = downloaded;
    progress.chunks[chunk_index].completed = completed;

    // 写入进度文件
    let progress_path = get_progress_file_path(file_path);
    let progress_json = serde_json::to_string_pretty(&progress)
        .map_err(|e| format!("序列化进度文件失败: {}", e))?;

    fs::write(&progress_path, progress_json).map_err(|e| format!("写入进度文件失败: {}", e))?;

    Ok(())
}

/// 删除进度文件
fn delete_progress_file(file_path: &Path) {
    let progress_path = get_progress_file_path(file_path);
    let _ = fs::remove_file(progress_path);
}

/// 多线程下载单个分块，支持断点续传和自动重试
async fn download_chunk(
    url: &str,
    start: u64,
    end: u64,
    file_path: &Path,
    chunk_index: usize,
    resume_offset: u64, // 断点续传的偏移量
) -> Result<u64, String> {
    const MAX_RETRIES: u32 = 3; // 最大重试次数
    const RETRY_DELAY_MS: u64 = 1000; // 重试延迟（毫秒）

    let client = HTTP_CLIENT.clone();

    // 计算实际下载的起始位置（支持断点续传）
    let actual_start = start + resume_offset;

    // 如果已经下载完成，直接返回
    if actual_start > end {
        return Ok(resume_offset);
    }

    // 构建Range 请求头
    let range_header = format!("bytes={}-{}", actual_start, end);

    // 重试循环
    for retry in 0..MAX_RETRIES {
        // 发送 Range 请求
        let response = client
            .get(url)
            .header("Range", range_header.clone())
            .send()
            .await;

        match response {
            Ok(resp) => {
                // 检查响应状态
                if resp.status().is_success() || resp.status() == 206 {
                    // 获取响应体流
                    let mut stream = resp.bytes_stream();
                    let mut downloaded = 0u64;

                    // 打开文件并定位到指定位置
                    let mut file = File::options()
                        .write(true)
                        .open(file_path)
                        .map_err(|e| format!("分块 {} 打开文件失败: {}", chunk_index, e))?;

                    file.seek(SeekFrom::Start(actual_start))
                        .map_err(|e| format!("分块 {} 定位文件位置失败: {}", chunk_index, e))?;

                    // 读取并写入文件
                    while let Some(chunk) = stream.next().await {
                        let chunk = chunk
                            .map_err(|e| format!("分块 {} 读取数据失败: {}", chunk_index, e))?;

                        file.write_all(&chunk)
                            .map_err(|e| format!("分块 {} 写入文件失败: {}", chunk_index, e))?;

                        downloaded += chunk.len() as u64;
                    }

                    // 返回总共下载的字节数（包括之前已下载的部分）
                    return Ok(resume_offset + downloaded);
                } else {
                    // 响应状态错误，重试
                    if retry < MAX_RETRIES - 1 {
                        eprintln!(
                            "分块 {} 下载失败 (HTTP {})，{} 秒后重试 ({}/{})",
                            chunk_index,
                            resp.status(),
                            RETRY_DELAY_MS / 1000,
                            retry + 1,
                            MAX_RETRIES
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS))
                            .await;
                        continue;
                    } else {
                        return Err(format!(
                            "分块 {} 下载失败: HTTP {} (已重试 {} 次)",
                            chunk_index,
                            resp.status(),
                            MAX_RETRIES
                        ));
                    }
                }
            }
            Err(e) => {
                // 请求错误，重试
                if retry < MAX_RETRIES - 1 {
                    eprintln!(
                        "分块 {} 请求错误: {}，{} 秒后重试 ({}/{})",
                        chunk_index,
                        e,
                        RETRY_DELAY_MS / 1000,
                        retry + 1,
                        MAX_RETRIES
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
                    continue;
                } else {
                    return Err(format!(
                        "分块 {} 请求失败: {} (已重试 {} 次)",
                        chunk_index, e, MAX_RETRIES
                    ));
                }
            }
        }
    }

    // 理论上不会到达这里
    Err("未知错误".to_string())
}

/// 使用 Range 多线程下载大文件，支持断点续传
async fn download_file_multithreaded(
    app_handle: tauri::AppHandle,
    url: &str,
    file_path: &Path,
    total_size: u64,
    filename: &str,
    concurrent_threads: usize,
) -> Result<String, String> {
    // 配置参数
    const CHUNK_SIZE: u64 = 5 * 1024 * 1024; // 每个分块 5MB

    // 计算分块数量
    let num_chunks = (total_size + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let num_chunks = num_chunks as usize;

    // 检查是否存在进度文件（断点续传）
    let progress_info = read_progress_file(file_path);
    let is_resume = progress_info.is_some();

    let progress_info = if let Some(info) = progress_info {
        // 验证进度文件是否有效
        if info.total_size == total_size
            && info.chunk_size == CHUNK_SIZE
            && info.num_chunks == num_chunks
        {
            info
        } else {
            // 进度文件无效，重新创建
            create_progress_file(file_path, total_size, CHUNK_SIZE, num_chunks)
                .map_err(|e| format!("创建进度文件失败: {}", e))?
        }
    } else {
        // 创建新的进度文件
        create_progress_file(file_path, total_size, CHUNK_SIZE, num_chunks)
            .map_err(|e| format!("创建进度文件失败: {}", e))?
    };

    // 如果不是断点续传，创建文件并预分配空间
    if !is_resume {
        let file = File::create(file_path).map_err(|e| format!("创建文件失败: {}", e))?;
        file.set_len(total_size)
            .map_err(|e| format!("预分配文件空间失败: {}", e))?;
    }

    // 创建并发控制器
    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrent_threads));
    let file_path = file_path.to_path_buf();
    let url = url.to_string();
    let filename = filename.to_string();
    let total_size_clone = total_size; // 克隆 total_size 以便在 async 块中使用

    // 创建进度跟踪（用于发送进度事件）
    let event_progress = Arc::new(std::sync::atomic::AtomicU64::new(0));

    // 计算已下载的总字节数
    let initial_downloaded: u64 = progress_info.chunks.iter().map(|c| c.downloaded).sum();

    // 更新事件进度
    event_progress.store(initial_downloaded, std::sync::atomic::Ordering::Relaxed);

    // 创建任务列表
    let mut tasks = Vec::with_capacity(num_chunks);

    for i in 0..num_chunks {
        let chunk_info = &progress_info.chunks[i];

        // 如果分块已完成，跳过
        if chunk_info.completed {
            continue;
        }

        let start = chunk_info.start;
        let end = chunk_info.end;
        let resume_offset = chunk_info.downloaded;

        let url_clone = url.clone();
        let file_path_clone = file_path.clone();
        let filename_clone = filename.clone();
        let app_handle_clone = app_handle.clone();
        let event_progress_clone = event_progress.clone();
        let semaphore_clone = semaphore.clone();
        let total_size_for_task = total_size_clone; // 为每个任务创建 total_size 的副本

        let task = tokio::spawn(async move {
            // 获取信号量许可
            let _permit = semaphore_clone
                .acquire()
                .await
                .map_err(|e| format!("获取并发许可失败: {}", e))?;

            // 下载分块（传入断点续传偏移量）
            let downloaded =
                download_chunk(&url_clone, start, end, &file_path_clone, i, resume_offset).await?;

            // 更新进度文件
            update_chunk_progress(&file_path_clone, i, downloaded, true)
                .map_err(|e| format!("更新进度文件失败: {}", e))?;

            // 更新事件进度
            let old_progress = event_progress_clone.fetch_add(
                downloaded - resume_offset,
                std::sync::atomic::Ordering::Relaxed,
            );
            let new_progress = old_progress + (downloaded - resume_offset);

            // 计算进度百分比
            let progress_percent = if total_size_for_task > 0 {
                (new_progress * 100) / total_size_for_task
            } else {
                0
            };

            // 发送进度事件
            app_handle_clone
                .emit(
                    "download_progress",
                    serde_json::json!({
                        "filename": &filename_clone,
                        "progress": progress_percent,
                        "downloaded": new_progress,
                        "total": total_size_for_task,
                    }),
                )
                .map_err(|e| format!("发送进度事件失败: {}", e))?;

            Ok::<u64, String>(downloaded)
        });

        tasks.push(task);
    }

    // 等待所有任务完成
    for task in tasks {
        match task.await {
            Ok(Ok(_downloaded)) => {}
            Ok(Err(e)) => {
                return Err(format!("下载分块失败: {}", e));
            }
            Err(e) => {
                return Err(format!("任务执行失败: {}", e));
            }
        }
    }

    // 下载完成，删除进度文件
    delete_progress_file(&file_path);

    Ok(format!("成功下载文件到 {}", file_path.to_string_lossy()))
}

/// 从指定URL下载文件到本地，并通过事件系统发送进度更新
/// 对于大于 10MB 的文件使用 Range 多线程下载，否则使用单线程下载
#[tauri::command]
async fn download_file(
    app_handle: tauri::AppHandle,
    url: String,
    filename: String,
    concurrent_threads: usize,
) -> Result<String, String> {
    let client = HTTP_CLIENT.clone();

    // 发送 HEAD 请求获取文件信息和 Range 支持
    let head_response = client.head(&url).send().await;

    let (total_size, accept_ranges) = match head_response {
        Ok(response) => {
            if response.status().is_success() {
                // 直接从响应头读取 Content-Length
                let length = response
                    .headers()
                    .get("content-length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let ranges = response
                    .headers()
                    .get("Accept-Ranges")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                (length, ranges)
            } else {
                // HEAD 请求失败，使用 GET 请求
                let get_response = client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|e| format!("Failed to send GET request: {}", e))?;

                if !get_response.status().is_success() {
                    return Err(format!(
                        "Failed to get file info: HTTP {}",
                        get_response.status()
                    ));
                }

                // 直接从响应头读取 Content-Length
                let length = get_response
                    .headers()
                    .get("content-length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                let ranges = get_response
                    .headers()
                    .get("Accept-Ranges")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                (length, ranges)
            }
        }
        Err(_) => {
            // HEAD 请求失败，使用 GET 请求
            let get_response = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Failed to send GET request: {}", e))?;

            if !get_response.status().is_success() {
                return Err(format!(
                    "Failed to get file info: HTTP {}",
                    get_response.status()
                ));
            }

            // 直接从响应头读取 Content-Length
            let length = get_response
                .headers()
                .get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);

            let ranges = get_response
                .headers()
                .get("Accept-Ranges")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            (length, ranges)
        }
    };

    // 获取当前工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    // 创建文件路径
    let file_path = current_dir.join(&filename);

    // 确保父目录存在
    if let Some(parent_dir) = file_path.parent() {
        if !parent_dir.exists() {
            fs::create_dir_all(parent_dir)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    // 判断是否使用多线程下载（大于 10MB）
    const MULTITHREAD_THRESHOLD: u64 = 10 * 1024 * 1024; // 10MB

    if total_size > MULTITHREAD_THRESHOLD && accept_ranges == "bytes" && concurrent_threads > 1 {
        println!(
            "文件大小: {} bytes ({} MB)，启用多线程下载",
            total_size,
            total_size / (1024 * 1024)
        );
        // 使用多线程下载
        return download_file_multithreaded(
            app_handle.clone(),
            &url,
            &file_path,
            total_size,
            &filename,
            concurrent_threads,
        )
        .await;
    }

    // 单线程下载
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    // 检查响应状态
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download file: HTTP {}",
            response.status()
        ));
    }

    // 创建文件
    let mut file = File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    // 获取响应体流
    let mut stream = response.bytes_stream();

    // 已下载字节数
    let mut downloaded = 0u64;

    // 读取并写入文件，同时发送进度更新
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;

        // 写入文件
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        // 更新已下载字节数
        downloaded += chunk.len() as u64;

        // 计算进度百分比
        let progress = if total_size > 0 {
            (downloaded * 100) / total_size
        } else {
            0
        };

        // 发送进度事件
        app_handle
            .emit(
                "download_progress",
                serde_json::json!({
                    "filename": &filename,
                    "progress": progress,
                    "downloaded": downloaded,
                    "total": total_size,
                }),
            )
            .map_err(|e| format!("Failed to emit progress event: {}", e))?;
    }

    Ok(format!(
        "Successfully downloaded file to {}",
        file_path.to_string_lossy()
    ))
}

/// 解压缩游戏资源文件
#[tauri::command]
async fn extract_game_assets(
    app_handle: tauri::AppHandle,
    zip_path: String,
    target_dir: String,
) -> Result<String, String> {
    // 获取当前工作目录
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    // 创建文件路径
    let zip_file_path = current_dir.join(&zip_path);
    let target_directory = current_dir.join(&target_dir);

    // 确保目标目录存在
    if !target_directory.exists() {
        fs::create_dir_all(&target_directory)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // 检查是否是ZIP文件
    if !is_zip_file(&zip_file_path).map_err(|e| format!("Failed to check if file is zip: {}", e))? {
        return Err("Provided file is not a ZIP archive".to_string());
    }

    // 解压缩文件
    let mut extracted_files = Vec::new();
    if let Err(err) = extract_zip_into(
        &zip_file_path,
        &target_directory,
        &mut extracted_files,
        Some(&app_handle),
    ) {
        return Err(format!("Failed to extract zip file: {}", err));
    }

    Ok(format!(
        "Successfully extracted {} files to {}",
        extracted_files.len(),
        target_directory.to_string_lossy()
    ))
}

/// 获取文件大小
#[tauri::command]
async fn get_file_size(file_path: String) -> Result<u64, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(0);
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    if !metadata.is_file() {
        return Ok(0);
    }

    Ok(metadata.len())
}

/// 清理临时目录
#[tauri::command]
async fn cleanup_temp_dir(temp_dir: String) -> Result<String, String> {
    let path = Path::new(&temp_dir);
    if !path.exists() {
        return Ok(format!("临时目录不存在: {}", temp_dir));
    }

    // 遍历目录，只删除文件，保留目录结构
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    if let Err(e) = fs::remove_file(&entry_path) {
                        eprintln!("Failed to remove file {}: {}", entry_path.display(), e);
                    }
                }
            }
        }
    }

    Ok(format!("临时目录清理完成: {}", temp_dir))
}

/// 列出指定目录下的所有文件
#[tauri::command]
async fn list_files(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(file_name) = entry_path.file_name() {
                    if let Some(name_str) = file_name.to_str() {
                        files.push(name_str.to_string());
                    }
                }
            }
        }
    }

    Ok(files)
}
/// 列出指定目录下的所有 JS 文件
#[tauri::command]
async fn list_script_files(dir_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&dir_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Some(ext) = entry_path.extension() {
                    if ext == "js" {
                        if let Some(file_name) = entry_path.file_name() {
                            if let Some(name_str) = file_name.to_str() {
                                files.push(name_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(files)
}

/// 重命名文件（支持自动创建目标目录的父目录结构）
#[tauri::command]
async fn rename_file(old_path: String, new_path: String) -> Result<String, String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);

    if !old.exists() {
        return Err(format!("源文件不存在: {}", old_path));
    }

    if new.exists() {
        return Err(format!("目标文件已存在: {}", new_path));
    }

    // 自动创建目标目录的父目录结构
    if let Some(parent) = new.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
    }

    fs::rename(old, new).map_err(|e| format!("重命名文件失败: {}", e))?;
    Ok(format!("文件已重命名: {} -> {}", old_path, new_path))
}

/// 删除文件（移动到回收站）
#[tauri::command]
async fn delete_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::*;
        use windows::core::{BOOL, PCWSTR};

        // 将路径转换为 Windows 需要的格式（双 null 终止的宽字符串）
        let mut from = file_path.encode_utf16().collect::<Vec<u16>>();
        from.push(0); // 添加 null 终止符
        from.push(0); // 双 null 终止符

        let mut op = SHFILEOPSTRUCTW {
            hwnd: HWND::default(),
            wFunc: FO_DELETE,
            pFrom: PCWSTR::from_raw(from.as_ptr()),
            pTo: PCWSTR::null(),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT).0 as u16,
            fAnyOperationsAborted: BOOL::from(false),
            hNameMappings: std::ptr::null_mut(),
            lpszProgressTitle: PCWSTR::null(),
        };

        unsafe {
            let result = SHFileOperationW(&mut op);
            if result != 0 {
                return Err(format!("删除文件失败: 错误代码 {}", result));
            }
        }

        Ok(format!("文件已移动到回收站: {}", file_path))
    }

    #[cfg(not(target_os = "windows"))]
    {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;
        Ok(format!("文件已删除: {}", file_path))
    }
}

#[tauri::command]
fn get_os_version() -> String {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Some(version) = sysinfo::System::os_version() {
        version
    } else {
        "".to_string()
    }
}
mod submodules;

#[tauri::command]
async fn run_script(script_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    use submodules::script::run_script_file;
    match run_script_file(script_path, app_handle).await {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("脚本执行失败: {}", e)),
    }
}

/// CLI 入口：执行指定脚本文件。
///
/// # 参数
/// - `script_path`: 脚本路径（可相对或绝对）
///
/// # 返回
/// 返回脚本执行结果字符串；失败时返回错误信息
#[cfg(feature = "dob-script-cli")]
pub async fn run_script_cli(script_path: String) -> Result<String, String> {
    use submodules::script::run_script_file_cli;
    run_script_file_cli(script_path).await
}

/// 响应脚本 readConfig 请求，将前端当前值回传给脚本运行时。
#[tauri::command]
fn resolve_script_config_request(request_id: String, value: serde_json::Value) -> Result<String, String> {
    use submodules::script_builtin::resolve_script_config_request;
    resolve_script_config_request(request_id, value)?;
    Ok("配置请求已响应".to_string())
}

#[tauri::command]
fn stop_script() -> Result<String, String> {
    use submodules::script::stop_script;
    match stop_script() {
        Ok(_) => Ok("脚本已停止".to_string()),
        Err(e) => Err(format!("停止脚本失败: {:?}", e)),
    }
}

/// 停止指定脚本路径对应的运行实例。
#[tauri::command]
fn stop_script_by_path(script_path: String) -> Result<String, String> {
    use submodules::script::stop_script_by_path;
    match stop_script_by_path(script_path) {
        Ok(_) => Ok("脚本停止请求已发送".to_string()),
        Err(e) => Err(format!("停止脚本失败: {:?}", e)),
    }
}

/// 获取当前脚本运行状态，供前端刷新后恢复停止能力。
#[tauri::command]
fn get_script_running_state() -> Result<bool, String> {
    use submodules::script::is_script_running;
    Ok(is_script_running())
}

/// 脚本运行信息。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptRuntimeInfo {
    /// 是否存在运行中的脚本
    running: bool,
    /// 正在运行的脚本路径列表（去重）
    script_paths: Vec<String>,
    /// 运行实例总数（同一路径并行会累计）
    running_count: usize,
}

/// 获取当前脚本运行信息（运行状态 + 正在执行脚本列表）。
#[tauri::command]
fn get_script_runtime_info() -> Result<ScriptRuntimeInfo, String> {
    use submodules::script::get_script_runtime_info;
    let (running, script_paths, running_count) = get_script_runtime_info();
    Ok(ScriptRuntimeInfo {
        running,
        script_paths,
        running_count,
    })
}

/// 同步脚本热键绑定到后端（AHK 风格，如 ^c）。
#[tauri::command]
fn sync_script_hotkey_bindings(
    bindings: Vec<submodules::hotkey::ScriptHotkeyBinding>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use submodules::hotkey::sync_script_hotkey_bindings;
    sync_script_hotkey_bindings(app_handle, bindings)?;
    Ok("热键绑定已同步".to_string())
}

/// 获取后端当前生效的热键绑定。
#[tauri::command]
fn get_script_hotkey_bindings() -> Result<Vec<submodules::hotkey::ScriptHotkeyBinding>, String> {
    use submodules::hotkey::get_script_hotkey_bindings;
    Ok(get_script_hotkey_bindings())
}

/// 监听文件变化
#[tauri::command]
fn watch_file(file_path: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let mut hotwatch_guard = HOTWATCH
        .lock()
        .map_err(|e| format!("获取 hotwatch 锁失败: {:?}", e))?;

    // 如果 hotwatch 不存在，则创建
    if hotwatch_guard.is_none() {
        *hotwatch_guard = Some(
            Hotwatch::new_with_custom_delay(Duration::from_millis(500))
                .map_err(|e| format!("创建 hotwatch 失败: {:?}", e))?,
        );
    }

    let hotwatch = hotwatch_guard.as_mut().unwrap();

    // 克隆文件路径用于闭包
    let file_path_clone = file_path.clone();
    // 监听文件
    hotwatch
        .watch(&file_path, move |event: Event| {
            // 检查事件类型
            if let EventKind::Modify(_) = event.kind {
                // 文件被修改，发送事件到前端
                let _ = app_handle.emit("file-changed", &file_path_clone);
            }
        })
        .map_err(|e| format!("监听文件失败: {:?}", e))?;

    Ok(format!("开始监听文件: {}", file_path))
}

/// 取消监听文件
#[tauri::command]
fn unwatch_file(file_path: String) -> Result<String, String> {
    let mut hotwatch_guard = HOTWATCH
        .lock()
        .map_err(|e| format!("获取 hotwatch 锁失败: {:?}", e))?;

    if let Some(hotwatch) = hotwatch_guard.as_mut() {
        let _ = hotwatch.unwatch(&file_path);
        Ok(format!("取消监听文件: {}", file_path))
    } else {
        Err("Hotwatch 未初始化".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init());
    #[cfg(target_os = "windows")]
    {
        app = app
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }
    app.setup(|app| {
        let handle = app.handle();
        let window = app.get_webview_window("main").unwrap();
        // window.set_shadow(true).expect("Unsupported platform!");

        #[cfg(target_os = "macos")]
        apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
            .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

        #[cfg(target_os = "windows")]
        {
            use sysinfo::System;
            use tauri::menu::*;
            use tauri::tray::*;
            use window_vibrancy::*;
            let mut sys = System::new_all();
            sys.refresh_all();

            let submenu = SubmenuBuilder::new(handle, "材质")
                .check("None", "None")
                .check("Blur", "Blur")
                .check("Acrylic", "Acrylic")
                .check("Mica", "Mica")
                .check("Mica_Dark", "Mica_Dark")
                .check("Mica_Tabbed", "Mica_Tabbed")
                .check("Mica_Tabbed_Dark", "Mica_Tabbed_Dark")
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[&submenu])
                .text("exit", "退出 (&Q)")
                .build()?;

            let set_mat_check = move |x: &str| {
                submenu.items().unwrap().iter().for_each(|item| {
                    if let Some(check_menuitem) = item.as_check_menuitem() {
                        let _ = check_menuitem.set_checked(check_menuitem.id() == x);
                    }
                });
            };
            if let Some(version) = System::os_version() {
                if version.starts_with("11") {
                    let acrylic_available = apply_acrylic(&window, Some((0, 0, 0, 0))).is_ok();
                    if acrylic_available {
                        println!("Acrylic is available");
                        set_mat_check("Acrylic");
                    }
                } else if version.starts_with("10") {
                    let blur_available = apply_blur(&window, Some((0, 0, 0, 0))).is_ok();
                    if blur_available {
                        println!("Blur is available");
                        set_mat_check("Blur");
                    }
                } else {
                    set_mat_check("None");
                }
            }

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |_app, event| match event.id().as_ref() {
                    "exit" => {
                        std::process::exit(0);
                    }
                    "None" => {
                        set_mat_check("None");
                        let _ = apply_material(window.clone(), "None");
                    }
                    "Blur" => {
                        set_mat_check("Blur");
                        let _ = apply_material(window.clone(), "Blur");
                    }
                    "Acrylic" => {
                        set_mat_check("Acrylic");
                        let _ = apply_material(window.clone(), "Acrylic");
                    }
                    "Mica" => {
                        set_mat_check("Mica");
                        let _ = apply_material(window.clone(), "Mica");
                    }
                    "Mica_Dark" => {
                        set_mat_check("Mica_Dark");
                        let _ = apply_material(window.clone(), "Mica_Dark");
                    }
                    "Mica_Tabbed" => {
                        set_mat_check("Mica_Tabbed");
                        let _ = apply_material(window.clone(), "Mica_Tabbed");
                    }
                    "Mica_Tabbed_Dark" => {
                        set_mat_check("Mica_Tabbed_Dark");
                        let _ = apply_material(window.clone(), "Mica_Tabbed_Dark");
                    }
                    _ => (),
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(webview_window) = app.get_webview_window("main") {
                            if let Ok(is_visible) = webview_window.is_visible() {
                                if is_visible {
                                    let _ = webview_window.hide();
                                } else {
                                    let _ = webview_window.show();
                                    let _ = webview_window.set_focus();
                                }
                            }
                        }
                    }
                })
                .icon(
                    tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico"))
                        .expect("icon missing"),
                )
                .build(app)?;
        }

        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        apply_material,
        app_close,
        get_os_version,
        get_game_install,
        is_game_running,
        launch_exe,
        launch_normal,
        run_as_admin,
        check_is_admin,
        import_mod,
        enable_mod,
        import_pic,
        fetch,
        get_local_qq,
        list_script_files,
        read_text_file,
        write_text_file,
        export_binary_file,
        start_heartbeat,
        stop_heartbeat,
        send_ws_msg,
        download_file,
        extract_game_assets,
        get_file_size,
        cleanup_temp_dir,
        run_script,
        resolve_script_config_request,
        stop_script,
        stop_script_by_path,
        get_script_running_state,
        get_script_runtime_info,
        sync_script_hotkey_bindings,
        get_script_hotkey_bindings,
        get_documents_dir,
        rename_file,
        delete_file,
        watch_file,
        unwatch_file,
        list_files
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
