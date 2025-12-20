use axum::{
    routing::{get, post},
    Json,
    Router,
    serve,
    http::StatusCode,
};

use std::net::SocketAddr;
use tokio::net::TcpListener;

use super::protocol::{ImageGrabRequest, ImageGrabResponseData, Response, RunScriptRequest, RunScriptResponseData};
use super::tools::{image_grab, run_script};

// 健康检查端点
async fn health_check() -> Json<Response<String>> {
    Json(Response::success("OK".to_string()))
}

// 截图游戏窗口端点
async fn handle_image_grab(Json(request): Json<ImageGrabRequest>) -> (StatusCode, Json<Response<ImageGrabResponseData>>) {
    match image_grab(&request.process_name) {
        Ok(image_data) => {
            let response_data = ImageGrabResponseData {
                image: image_data,
            };
            (StatusCode::OK, Json(Response::success(response_data)))
        },
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(Response::error(&format!("{:?}", e))))
        },
    }
}

// 执行AHKv2脚本端点
async fn handle_run_script(Json(request): Json<RunScriptRequest>) -> (StatusCode, Json<Response<RunScriptResponseData>>) {
    match run_script(&request.script) {
        Ok((output, error)) => {
            let response_data = RunScriptResponseData {
                output,
                error,
            };
            (StatusCode::OK, Json(Response::success(response_data)))
        },
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(Response::error(&format!("{:?}", e))))
        },
    }
}

// 创建路由
pub fn create_router() -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/image_grab", post(handle_image_grab))
        .route("/api/run_script", post(handle_run_script))
}

// 启动服务器
pub async fn start_server(addr: SocketAddr) {
    let app = create_router();

    println!("MCP Server started on http://{}", addr);

    let listener = TcpListener::bind(addr).await.unwrap();
    
    match serve(listener, app.into_make_service()).await {
        Ok(()) => println!("MCP Server stopped gracefully"),
        Err(e) => eprintln!("MCP Server error: {}", e),
    }
}
