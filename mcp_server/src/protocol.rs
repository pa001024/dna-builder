use serde::{Deserialize, Serialize};

// 通用响应结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct Response<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> Response<T> {
    pub fn success(data: T) -> Self {
        Response {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: &str) -> Self {
        Response {
            success: false,
            data: None,
            error: Some(message.to_string()),
        }
    }
}

// 截图请求
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageGrabRequest {
    pub process_name: String,
}

// 截图响应数据
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageGrabResponseData {
    pub image: String, // base64 encoded image
}

// 执行脚本请求
#[derive(Debug, Serialize, Deserialize)]
pub struct RunScriptRequest {
    pub script: String,
}

// 执行脚本响应数据
#[derive(Debug, Serialize, Deserialize)]
pub struct RunScriptResponseData {
    pub output: String,
    pub error: String,
}
