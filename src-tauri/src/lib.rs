use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

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
    let mut signature = [0u8; 4];
    let read = file.read(&mut signature)?;
    Ok(read >= 2 && signature[0] == b'P' && signature[1] == b'K')
}

fn extract_zip_into(
    archive_path: &Path,
    target_dir: &Path,
    output: &mut Vec<(String, u64)>,
) -> io::Result<()> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|err| io::Error::new(io::ErrorKind::Other, err.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let relative = entry.mangled_name();
        let out_path = target_dir.join(relative);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut extracted = File::create(&out_path)?;
        io::copy(&mut entry, &mut extracted)?;
        output.push((out_path.to_string_lossy().to_string(), entry.size()));
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
                if let Err(err) = extract_zip_into(&src, &base_path, &mut output) {
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
        use crate::util::{get_process_by_name, get_process_exe_path};

        let mut elapsed = Duration::from_secs(0);
        let timeout = Duration::from_secs(60 * 60); // 1h
        let interval = Duration::from_millis(500); // 500ms

        while elapsed <= timeout {
            let now_is_run = get_process_by_name(GAME_PROCESS).unwrap_or(0) > 0;
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
        use crate::util::shell_execute;
        let pid = shell_execute(path.as_str(), Some(params.as_str()), None);
        if let Err(err) = pid {
            println!("Failed to launch game: {:?}", err);
            return false;
        }
    }
    true
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

/// 导出JSON文件到指定路径
#[tauri::command]
async fn export_json_file(file_path: String, json_content: String) -> Result<String, String> {
    // 创建文件路径
    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    // 写入JSON内容到文件
    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(json_content.as_bytes())
        .map_err(|e| format!("Failed to write JSON content: {}", e))?;

    Ok(format!("Successfully exported JSON to {}", file_path))
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

/// 从指定URL下载文件到本地，并通过事件系统发送进度更新
#[tauri::command]
async fn download_file(
    app_handle: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<String, String> {
    let client = HTTP_CLIENT.clone();

    // 发送GET请求下载文件
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

    // 获取文件总大小
    let total_size = response.content_length().unwrap_or(0);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default()
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

            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::CreateMutexA;
            use windows_sys::Win32::UI::WindowsAndMessaging::*;
            let h_mutex =
                unsafe { CreateMutexA(std::ptr::null_mut(), 0, "dna-builder-mutex".as_ptr()) };
            if h_mutex == std::ptr::null_mut() {
                // Mutex already exists, app is already running.
                unsafe {
                    CloseHandle(h_mutex);
                    let hwnd = FindWindowA(std::ptr::null(), "DNA Builder".as_ptr());
                    let mut wpm = std::mem::zeroed::<WINDOWPLACEMENT>();
                    if GetWindowPlacement(hwnd, &mut wpm) != 0 {
                        ShowWindow(hwnd, SW_SHOWNORMAL);
                        SetForegroundWindow(hwnd);
                    }
                };
                handle.exit(0);
            }
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
        import_mod,
        enable_mod,
        import_pic,
        fetch,
        get_local_qq,
        export_json_file,
        export_binary_file,
        start_heartbeat,
        stop_heartbeat,
        send_ws_msg,
        download_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
