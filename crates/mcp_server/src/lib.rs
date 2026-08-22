use std::net::SocketAddr;
use std::sync::Arc;

use async_trait::async_trait;
use axum::Router;
use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
use rmcp::model::{CallToolResult, Content, ServerCapabilities, ServerInfo};
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{Json, ServerHandler, tool, tool_handler, tool_router};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// MCP 读取到的脚本控制台日志。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptConsoleEntry {
    pub scope: Option<String>,
    pub level: String,
    pub message: String,
    pub timestamp: u64,
}

/// exec_script 返回的精简控制台日志。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExecConsoleEntry {
    pub level: String,
    pub message: String,
    pub timestamp: u64,
}

/// MCP 读取到的脚本状态项。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptStatusEntry {
    pub scope: Option<String>,
    pub title: String,
    pub text: Option<String>,
    pub image: Option<String>,
    pub images: Vec<String>,
    pub timestamp: u64,
}

/// MCP 读取到的当前脚本运行信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptRuntimeSnapshot {
    pub running: bool,
    pub script_paths: Vec<String>,
    pub running_count: usize,
}

/// 通用操作结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOperationResult {
    pub success: bool,
    pub message: String,
}

/// 单次脚本执行结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptExecResult {
    pub result: String,
    pub console: Vec<ScriptExecConsoleEntry>,
}

/// MCP 请求前端协助时的选择模式。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ScriptHelpSelectionMode {
    Point,
    Region,
}

/// MCP 请求前端协助的参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHelpRequest {
    pub title: String,
    pub message: Option<String>,
    pub image_path: Option<String>,
    pub script_path: Option<String>,
    pub status_title: Option<String>,
    pub selection_mode: ScriptHelpSelectionMode,
}

/// 单点标注结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHelpPoint {
    pub x: u32,
    pub y: u32,
}

/// 区域标注结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHelpRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub x2: u32,
    pub y2: u32,
}

/// MCP 用户协助标注结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHelpResponse {
    pub confirmed: bool,
    pub selection_mode: ScriptHelpSelectionMode,
    pub point: Option<ScriptHelpPoint>,
    pub region: Option<ScriptHelpRegion>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub note: Option<String>,
}

/// MCP 后端抽象。
#[async_trait]
pub trait ScriptMcpBackend: Send + Sync + 'static {
    /// 启动指定脚本。
    async fn run_script(
        &self,
        script_path: String,
        yield_ms: Option<u64>,
    ) -> Result<ScriptOperationResult, String>;

    /// 执行一段临时脚本源码，并等待执行完成。
    async fn exec_script(
        &self,
        script: String,
        scope: Option<String>,
        timeout_ms: Option<u64>,
    ) -> Result<ScriptExecResult, String>;

    /// 停止脚本；为空时停止全部。
    async fn stop_script(&self, script_path: Option<String>) -> Result<ScriptOperationResult, String>;

    /// 获取脚本运行快照。
    async fn get_runtime_info(&self) -> Result<ScriptRuntimeSnapshot, String>;

    /// 读取脚本状态。
    async fn read_status(
        &self,
        script_path: Option<String>,
        regex: Option<String>,
    ) -> Result<Vec<ScriptStatusEntry>, String>;

    /// 读取脚本控制台日志。
    async fn read_console(
        &self,
        script_path: Option<String>,
        limit: usize,
        regex: Option<String>,
    ) -> Result<Vec<ScriptConsoleEntry>, String>;

    /// 清理脚本状态缓存。
    async fn clear_status(&self, script_path: Option<String>, title: Option<String>) -> Result<ScriptOperationResult, String>;

    /// 清理脚本控制台缓存。
    async fn clear_console(&self, script_path: Option<String>, include_global: Option<bool>) -> Result<ScriptOperationResult, String>;

    /// 清理脚本状态与控制台缓存。
    async fn clear_status_console(&self, script_path: Option<String>) -> Result<ScriptOperationResult, String>;

    /// 请求前端展示协助弹窗，并等待用户返回点位或区域。
    async fn request_help(&self, request: ScriptHelpRequest) -> Result<ScriptHelpResponse, String>;
}

/// 运行脚本请求。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct RunScriptRequest {
    script_path: String,
    yield_ms: Option<u64>,
}

/// 执行临时脚本请求。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ExecScriptRequest {
    script: String,
    scope: Option<String>,
    timeout_ms: Option<u64>,
}

/// 停止脚本请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct StopScriptRequest {
    script_path: Option<String>,
}

/// 读取状态请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ReadStatusRequest {
    script_path: Option<String>,
    regex: Option<String>,
}

/// 读取控制台请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ReadConsoleRequest {
    script_path: Option<String>,
    limit: Option<usize>,
    regex: Option<String>,
}

/// 清理状态与控制台请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ClearStatusConsoleRequest {
    script_path: Option<String>,
}

/// 清理状态请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ClearStatusRequest {
    script_path: Option<String>,
    title: Option<String>,
}

/// 清理控制台请求。
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ClearConsoleRequest {
    script_path: Option<String>,
    include_global: Option<bool>,
}

/// 服务器启动配置。
#[derive(Debug, Clone)]
pub struct ScriptMcpServerConfig {
    pub bind_addr: SocketAddr,
}

impl Default for ScriptMcpServerConfig {
    /// 默认绑定到本机 28080 端口。
    fn default() -> Self {
        Self {
            bind_addr: SocketAddr::from(([127, 0, 0, 1], 28080)),
        }
    }
}

/// 已启动 MCP 服务的控制句柄。
pub struct ScriptMcpServerHandle {
    local_addr: SocketAddr,
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: JoinHandle<Result<(), String>>,
}

impl ScriptMcpServerHandle {
    /// 获取当前实际监听地址。
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// 停止 MCP 服务并等待退出。
    pub async fn stop(mut self) -> Result<(), String> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        self.task
            .await
            .map_err(|error| format!("MCP 服务任务异常结束: {error}"))?
    }
}

/// 启动脚本 MCP 服务。
pub async fn start_script_mcp_server(
    backend: Arc<dyn ScriptMcpBackend>,
    config: ScriptMcpServerConfig,
) -> Result<ScriptMcpServerHandle, String> {
    let listener = TcpListener::bind(config.bind_addr)
        .await
        .map_err(|error| format!("绑定 MCP 监听地址失败: {error}"))?;
    let local_addr = listener
        .local_addr()
        .map_err(|error| format!("读取 MCP 本地地址失败: {error}"))?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    let task = tokio::spawn(async move {
        let service_factory = move || Ok(ScriptRuntimeMcpService::new(backend.clone()));
        let mcp_service = StreamableHttpService::new(
            service_factory,
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default(),
        );
        let app = Router::new().nest_service("/mcp", mcp_service);

        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await
            .map_err(|error| format!("运行 MCP HTTP 服务失败: {error}"))?;
        Ok(())
    });

    Ok(ScriptMcpServerHandle {
        local_addr,
        shutdown_tx: Some(shutdown_tx),
        task,
    })
}

/// MCP 工具服务实现。
#[derive(Clone)]
struct ScriptRuntimeMcpService {
    backend: Arc<dyn ScriptMcpBackend>,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl ScriptRuntimeMcpService {
    /// 将 `data:image/...;base64,...` 解析为 MCP 图片内容。
    fn image_content_from_data_url(data_url: &str) -> Option<Content> {
        let (meta, data) = data_url.split_once(',')?;
        if !meta.starts_with("data:") || !meta.contains(";base64") {
            return None;
        }
        let mime_type = meta
            .trim_start_matches("data:")
            .split(';')
            .next()
            .filter(|value| !value.is_empty())?;
        Some(Content::image(data.to_string(), mime_type.to_string()))
    }

    /// 将状态列表转换为可读文本摘要，便于未渲染 structured content 的客户端回退显示。
    fn status_summary_text(statuses: &[ScriptStatusEntry]) -> String {
        let mut lines = Vec::with_capacity(statuses.len());
        for status in statuses {
            let mut line = format!("title={}", status.title);
            if let Some(scope) = &status.scope {
                line.push_str(&format!(", scope={scope}"));
            }
            if let Some(text) = &status.text {
                line.push_str(&format!(", text={text}"));
            }
            let image_count = status.images.len() + usize::from(status.image.is_some() && status.images.is_empty());
            if image_count > 0 {
                line.push_str(&format!(", images={image_count}"));
            }
            line.push_str(&format!(", timestamp={}", status.timestamp));
            lines.push(line);
        }
        if lines.is_empty() {
            "[]".to_string()
        } else {
            lines.join("\n")
        }
    }

    /// 创建新的 MCP 工具服务实例。
    fn new(backend: Arc<dyn ScriptMcpBackend>) -> Self {
        Self {
            backend,
            tool_router: Self::tool_router(),
        }
    }

    /// 启动指定脚本。
    #[tool(description = "运行指定脚本。script_path 可以是绝对路径，也可以是脚本页中的本地脚本文件名。可选 yield_ms 表示最多额外等待这么久；若脚本在此之前结束，则提前返回，便于后续紧接着读取 status/console。")]
    async fn run_script(
        &self,
        Parameters(request): Parameters<RunScriptRequest>,
    ) -> Result<Json<ScriptOperationResult>, String> {
        self.backend
            .run_script(request.script_path, request.yield_ms)
            .await
            .map(Json)
    }

    /// 执行不落文件的临时脚本。
    #[tool(description = "执行一段不落文件的临时脚本，类似 node -e。适合单次截图、点按、读像素等即时操作；调用会等待脚本执行完成。可选 timeout_ms 用于超时保护。")]
    async fn exec_script(
        &self,
        Parameters(request): Parameters<ExecScriptRequest>,
    ) -> Result<Json<ScriptExecResult>, String> {
        self.backend
            .exec_script(request.script, request.scope, request.timeout_ms)
            .await
            .map(Json)
    }

    /// 停止脚本。
    #[tool(description = "停止脚本。若不传 script_path，则停止当前全部运行脚本。")]
    async fn stop_script(
        &self,
        Parameters(request): Parameters<StopScriptRequest>,
    ) -> Result<Json<ScriptOperationResult>, String> {
        self.backend
            .stop_script(request.script_path)
            .await
            .map(Json)
    }

    /// 获取脚本运行信息。
    #[tool(description = "获取当前脚本运行状态、运行数量和脚本路径列表。")]
    async fn get_runtime_info(&self) -> Result<Json<ScriptRuntimeSnapshot>, String> {
        self.backend.get_runtime_info().await.map(Json)
    }

    /// 读取状态面板内容。
    #[tool(description = "读取当前脚本状态面板内容。若传 script_path，仅返回该脚本对应状态；若传 regex，则按正则过滤 title/text。")]
    async fn read_status(
        &self,
        Parameters(request): Parameters<ReadStatusRequest>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let statuses = self
            .backend
            .read_status(request.script_path, request.regex)
            .await
            .map_err(|error| rmcp::ErrorData::internal_error(error, None))?;
        let mut content = vec![Content::text(Self::status_summary_text(&statuses))];

        for status in &statuses {
            let mut pushed_any_image = false;
            for image_data_url in &status.images {
                if let Some(image_content) = Self::image_content_from_data_url(image_data_url) {
                    if !pushed_any_image {
                        content.push(Content::text(format!("status image: {}", status.title)));
                        pushed_any_image = true;
                    }
                    content.push(image_content);
                }
            }
            if !pushed_any_image {
                if let Some(image_data_url) = &status.image {
                    if let Some(image_content) = Self::image_content_from_data_url(image_data_url) {
                        content.push(Content::text(format!("status image: {}", status.title)));
                        content.push(image_content);
                    }
                }
            }
        }

        Ok(CallToolResult {
            content,
            structured_content: Some(
                serde_json::to_value(statuses)
                    .map_err(|error| rmcp::ErrorData::internal_error(format!("序列化脚本状态 structured_content 失败: {error}"), None))?,
            ),
            is_error: Some(false),
            meta: None,
        })
    }

    /// 读取控制台日志。
    #[tool(description = "读取当前脚本控制台输出。若传 script_path，仅返回该脚本对应日志；limit 默认为 100；若传 regex，则按正则过滤 level/message。")]
    async fn read_console(
        &self,
        Parameters(request): Parameters<ReadConsoleRequest>,
    ) -> Result<Json<Vec<ScriptConsoleEntry>>, String> {
        self.backend
            .read_console(request.script_path, request.limit.unwrap_or(100), request.regex)
            .await
            .map(Json)
    }

    /// 清理状态面板与控制台缓存。
    #[tool(description = "清空脚本 status 与 console 缓存。若传 script_path，则仅清空该脚本对应缓存。")]
    async fn clear_status_console(
        &self,
        Parameters(request): Parameters<ClearStatusConsoleRequest>,
    ) -> Result<Json<ScriptOperationResult>, String> {
        self.backend
            .clear_status_console(request.script_path)
            .await
            .map(Json)
    }

    /// 清理状态缓存。
    #[tool(description = "清空脚本 status 缓存。可按 script_path 和 title 定位。")]
    async fn clear_status(
        &self,
        Parameters(request): Parameters<ClearStatusRequest>,
    ) -> Result<Json<ScriptOperationResult>, String> {
        self.backend
            .clear_status(request.script_path, request.title)
            .await
            .map(Json)
    }

    /// 清理控制台缓存。
    #[tool(description = "清空脚本 console 缓存。若传 script_path，则默认同时清理该脚本与无 scope 的全局日志。")]
    async fn clear_console(
        &self,
        Parameters(request): Parameters<ClearConsoleRequest>,
    ) -> Result<Json<ScriptOperationResult>, String> {
        self.backend
            .clear_console(request.script_path, request.include_global)
            .await
            .map(Json)
    }

    /// 请求前端弹窗协助标注点位或区域，并等待返回结果。
    #[tool(description = "请求前端弹窗显示图片并让用户标注点或区域。优先传 script_path + status_title 复用现有 status 图片，也可传 image_path 读取本地图片文件。")]
    async fn request_help(
        &self,
        Parameters(request): Parameters<ScriptHelpRequest>,
    ) -> Result<Json<ScriptHelpResponse>, String> {
        self.backend.request_help(request).await.map(Json)
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ScriptRuntimeMcpService {
    /// 返回 MCP 服务器元信息与工具能力声明。
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            instructions: Some(
                "用于控制 dna-builder 脚本页中的本地脚本运行，并读取运行状态、status 面板、console 日志，以及请求前端协助标注图片点位或区域。".to_string(),
            ),
            server_info: rmcp::model::Implementation {
                name: "dna-builder-script-runtime".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                title: None,
                icons: None,
                website_url: None,
            },
            ..Default::default()
        }
    }
}
