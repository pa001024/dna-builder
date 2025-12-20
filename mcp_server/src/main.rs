#[tokio::main]
async fn main() {
    // 设置服务器地址，默认监听本地28080端口
    let addr = "127.0.0.1:28080";

    println!("Starting MCP Server on {}", addr);

    // 启动服务器
    match dna_mcp_server::run_server(addr).await {
        Ok(_) => println!("Server stopped gracefully"),
        Err(e) => println!("Server error: {}", e),
    }
}
