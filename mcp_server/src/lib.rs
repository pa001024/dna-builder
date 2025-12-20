use std::io;
use serde::{Deserialize, Serialize};
use rmcp::{tool, tool_router, ServerHandler, model::{CallToolRequestParam, CallToolResult, ListToolsResult}};
use rmcp::service::RequestContext;
use schemars::JsonSchema;
use axum::Router;

pub mod tools;
pub mod util;

// 定义工具请求参数
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ImageGrabParams {
    pub process_name: String,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct RunScriptParams {
    pub script: String,
}

// 定义MCP服务器结构体
#[derive(Clone)]
pub struct DnaMcpServer {
    tool_router: rmcp::handler::server::tool::ToolRouter<Self>,
}

// 使用rmcp宏实现工具路由
#[tool_router]
impl DnaMcpServer {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    // 截图工具实现
    #[tool(name = "image_grab", description = "截图游戏窗口")]
    async fn image_grab(&self, params: rmcp::handler::server::wrapper::Parameters<ImageGrabParams>) -> Result<rmcp::Json<serde_json::Value>, String> {
        match tools::image_grab(&params.0.process_name) {
            Ok(image) => Ok(rmcp::Json(serde_json::json!({ "image": image }))),
            Err(e) => Err(format!("Tool error: {:?}", e)),
        }
    }

    // 执行脚本工具实现
    #[tool(name = "run_script", description = "执行AHKv2脚本")]
    async fn run_script(&self, params: rmcp::handler::server::wrapper::Parameters<RunScriptParams>) -> Result<rmcp::Json<serde_json::Value>, String> {
        match tools::run_script(&params.0.script) {
            Ok((output, error)) => Ok(rmcp::Json(serde_json::json!({ "output": output, "error": error }))),
            Err(e) => Err(format!("Tool error: {:?}", e)),
        }
    }
}

// 实现ServerHandler trait
impl ServerHandler for DnaMcpServer {
    async fn call_tool(
        &self,
        request: CallToolRequestParam,
        context: RequestContext<rmcp::service::RoleServer>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        // 创建工具调用上下文
        let tool_call_context = rmcp::handler::server::tool::ToolCallContext::new(
            self,
            request,
            context,
        );
        
        // 调用工具路由处理请求
        self.tool_router.call(tool_call_context).await
    }

    async fn list_tools(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParam>,
        _context: RequestContext<rmcp::service::RoleServer>,
    ) -> Result<ListToolsResult, rmcp::ErrorData> {
        // 返回工具列表
        Ok(ListToolsResult {
            tools: self.tool_router.list_all(),
            next_cursor: None,
        })
    }
}

// 启动MCP服务器
pub async fn run_server(addr: &str) -> io::Result<()> {
    // 创建服务器实例
    let server = DnaMcpServer::new();
    
    // 输出启动信息
    println!("Starting MCP Server on {}", addr);
    
    // 使用RMCP的StreamableHttpService创建HTTP传输
    let config = rmcp::transport::streamable_http_server::tower::StreamableHttpServerConfig::default();
    let session_manager = std::sync::Arc::new(rmcp::transport::streamable_http_server::session::local::LocalSessionManager::default());
    
    // 创建HTTP服务，StreamableHttpService需要一个服务工厂函数
    let http_service = rmcp::transport::streamable_http_server::tower::StreamableHttpService::new(
        move || Ok(server.clone()),
        session_manager,
        config,
    );
    
    // 创建Axum路由器，将HTTP服务作为处理程序
    let app = Router::new()
        .fallback_service(http_service);
    
    // 启动HTTP服务器
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await.map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("HTTP server error: {:?}", e))
    })
}