//! HTTP 网络层：客户端构建、前端 fetch 代理命令与 QQ 登录探测。

use std::time::Duration;

use reqwest::multipart;
use serde::{Deserialize, Serialize};

/// 游戏启动器 User-Agent（下载与游戏相关请求伪装成官方启动器）。
pub(crate) const GAME_LAUNCHER_USER_AGENT: &str =
    "EMLauncher/++UE4+Release-4.27-CL-0 Windows/10.0.26200.1.256.64bit";

/// 创建带系统代理配置的 HTTP 客户端。
///
/// `reqwest` 会在构建客户端时读取系统代理配置，因此 tauriFetch 需要在每次请求前重新构建客户端，
/// 以便应用运行期间开启或关闭系统代理后立即生效。
pub(crate) fn build_http_client() -> Result<reqwest::Client, reqwest::Error> {
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
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum FormDataValue {
    Text(String),
    File {
        filename: String,
        data: Vec<u8>,
        mime: Option<String>,
    },
}

// 定义响应结构体
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FetchResponse {
    status: u16,
    body: String,
    headers: Vec<(String, String)>,
}

#[tauri::command]
pub async fn fetch(
    url: String,
    method: String,
    body: Option<String>,
    headers: Option<Vec<(String, String)>>,
    multipart: Option<Vec<(String, FormDataValue)>>,
) -> Result<FetchResponse, String> {
    let client =
        build_http_client().map_err(|error| format!("Failed to create HTTP client: {error}"))?;
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

#[tauri::command]
pub async fn get_local_qq(port: u32) -> String {
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
