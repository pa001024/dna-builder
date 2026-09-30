//! 云端 WebSocket 心跳：与服务器保持长连接、断线自动重连与消息收发。

use std::sync::Mutex;

use futures_util::{SinkExt, StreamExt};
use http::header::HeaderValue;
use lazy_static::lazy_static;
use serde::Deserialize;
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
pub fn send_ws_msg(text: String) {
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
pub async fn start_heartbeat(
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
pub async fn stop_heartbeat() -> Result<(), String> {
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
