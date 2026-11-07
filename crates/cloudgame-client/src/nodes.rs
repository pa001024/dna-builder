//! 线路（节点）列表 + 测速，逐条对齐官方 SDK（welink.pretty.js 14330-15200）：
//! 1. `GET {config}/ping/{md5hex(tenantKey+"H5")}.html?t=<ms>` → `{lines[], pingNum, timeOut, ...}`
//!    注意：这个 URL 是**租户配置 + 全量线路表**，不是测速请求；md5 的输入是 tenantKey，不是 nodeId。
//! 2. 每条线路开 `wss://{lineH5Addr}/ws`，发 `{"type":"ping","index":i,"ws_index":idx}`，
//!    收 `{"type":"pong","index":i}`；默认 5 次 / 单次超时 500ms，取平均 RTT（截断取整）。
//! 3. 按 nodeId 去重保留更小 ping；官方「推荐节点」= 最小 ping 的单个节点。

use std::time::Duration;

use anyhow::{Context, Result};
use serde_json::Value;

use crate::config;
use crate::ui;
use crate::ui::NodeRow;

/// 官方默认 pingNum / 单次 pong 超时 / 全局测速超时（可被租户配置覆盖）。
const PING_NUM: usize = 5;
const PING_TIMEOUT_MS: u64 = 500;
const SPEED_TOTAL_TIMEOUT_S: u64 = 20;
/// 测速成功的门槛：至少一个节点 < 500ms（官方 Gb）。
const MAX_ACCEPTABLE_MS: u32 = 500;

struct Line {
    node_id: String,
    name: String,
    addr: String,
    ping: Option<u32>,
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn config_hosts() -> [&'static str; 2] {
    [config::NODE_CONFIG_BASE, config::NODE_CONFIG_BASE_BAK]
}

/// 拉租户配置 + 全量线路表（官方 `/ping/{md5(tenantKey+"H5")}.html`）。
async fn fetch_lines(tenant_key: &str) -> Result<(Vec<Line>, usize, u64)> {
    let hash = format!("{:x}", md5::compute(format!("{tenant_key}H5")));
    let cli = reqwest::Client::builder()
        .timeout(Duration::from_millis(2500))
        .build()?;
    let mut last_err = None;
    for host in config_hosts() {
        let url = format!("{host}/ping/{hash}.html?t={}", now_ms());
        match cli.get(&url).send().await {
            Ok(r) if r.status().is_success() => {
                let v: Value = r.json().await.context("ping lines json")?;
                let ping_num = v
                    .get("pingNum")
                    .and_then(Value::as_str)
                    .and_then(|s| s.parse().ok())
                    .filter(|n| *n > 0)
                    .unwrap_or(PING_NUM);
                let timeout = v
                    .get("timeOut")
                    .and_then(Value::as_str)
                    .and_then(|s| s.parse().ok())
                    .filter(|n| *n > 0)
                    .unwrap_or(PING_TIMEOUT_MS);
                let mut out: Vec<Line> = Vec::new();
                for l in v.get("lines").and_then(Value::as_array).cloned().unwrap_or_default() {
                    let Some(addr) = l.get("lineH5Addr").and_then(Value::as_str).filter(|s| !s.is_empty()) else {
                        continue;
                    };
                    let node_id = l
                        .get("nodeId")
                        .map(|x| x.as_str().map(str::to_string).unwrap_or_else(|| x.to_string()))
                        .unwrap_or_default();
                    if node_id.is_empty() {
                        continue;
                    }
                    // 官方 wb()：按 (lineH5Addr, nodeId) 去重
                    if out.iter().any(|x| x.node_id == node_id && x.addr == addr) {
                        continue;
                    }
                    let name = l
                        .get("nodeName")
                        .or_else(|| l.get("nodeAlias"))
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&node_id)
                        .to_string();
                    out.push(Line { node_id, name, addr: addr.to_string(), ping: None });
                }
                return Ok((out, ping_num, timeout));
            }
            Ok(r) => last_err = Some(anyhow::anyhow!("{host}: status {}", r.status())),
            Err(e) => last_err = Some(anyhow::anyhow!("{host}: {e:#}")),
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("no config host")))
}

/// 单条线路的 WebSocket RTT 测速（官方 I/C 流程）。
async fn ping_line(addr: String, ws_index: usize, times: usize, timeout_ms: u64) -> Option<u32> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let url = format!("wss://{addr}/ws");
    let (mut ws, _) = tokio::time::timeout(Duration::from_secs(4), tokio_tungstenite::connect_async(&url))
        .await
        .ok()?
        .ok()?;

    let mut total = 0f64;
    let mut got = 0usize;
    for i in 0..times {
        let payload = serde_json::json!({ "type": "ping", "index": i, "ws_index": ws_index }).to_string();
        let t0 = std::time::Instant::now();
        if ws.send(Message::Text(payload.into())).await.is_err() {
            break;
        }
        let deadline = Duration::from_millis(timeout_ms);
        let mut ok = false;
        loop {
            match tokio::time::timeout(deadline, ws.next()).await {
                Ok(Some(Ok(Message::Text(t)))) => {
                    if t.contains("\"pong\"") {
                        ok = true;
                        break;
                    }
                }
                Ok(Some(Ok(_))) => continue,
                _ => break,
            }
        }
        if !ok {
            break;
        }
        total += t0.elapsed().as_millis() as f64;
        got += 1;
    }
    let _ = ws.close(None).await;
    if got == 0 { None } else { Some((total / got as f64).round() as u32) }
}

/// 租户全量线路测速（官方 getNode(null, ..., ALL) 的等价实现）。
pub async fn measure(tenant_key: &str) -> Result<Vec<NodeRow>> {
    let (mut lines, ping_num, timeout_ms) = fetch_lines(tenant_key).await?;
    if lines.is_empty() {
        anyhow::bail!("线路表为空");
    }
    tracing::info!("lines: {} 条，pingNum={ping_num} timeout={timeout_ms}ms", lines.len());

    // 并发测速，整体 20s 上限（官方 JA）
    let mut handles = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        let addr = l.addr.clone();
        handles.push(tokio::spawn(async move {
            ping_line(addr, i, ping_num, timeout_ms).await
        }));
    }
    let deadline = tokio::time::Instant::now() + Duration::from_secs(SPEED_TOTAL_TIMEOUT_S);
    for (i, h) in handles.into_iter().enumerate() {
        let ping = match tokio::time::timeout_at(deadline, h).await {
            Ok(Ok(p)) => p,
            _ => None,
        };
        lines[i].ping = ping;
    }

    // 官方 wh()：按 nodeId 去重，保留 pingResult 更小的一条
    let mut rows: Vec<NodeRow> = Vec::new();
    for l in lines {
        match rows.iter_mut().find(|r| r.id == l.node_id) {
            Some(existing) => {
                if let Some(p) = l.ping {
                    if existing.ping.map_or(true, |old| p <= old) {
                        existing.ping = Some(p);
                        existing.name = l.name;
                    }
                }
            }
            None => rows.push(NodeRow { id: l.node_id, name: l.name, ping: l.ping }),
        }
    }
    // 可用的排前面（官方弹窗默认选 nodeList[0]，推荐模式取最小 ping）
    rows.sort_by_key(|r| r.ping.unwrap_or(u32::MAX));
    let ok = rows.iter().any(|r| r.ping.is_some_and(|p| p < MAX_ACCEPTABLE_MS));
    if !ok {
        tracing::warn!("所有线路测速失败或均 >= {MAX_ACCEPTABLE_MS}ms");
    }
    Ok(rows)
}

/// 开流前同步测速（带超时）：返回 (选中的 nodeId, 全部节点的 ping 上报)。
/// `saved` 非空时仍测速用于上报，但选中项用 `saved`。
pub async fn prepare(tenant_key: &str, saved: &str) -> (String, Vec<Value>) {
    let rows = match tokio::time::timeout(Duration::from_secs(SPEED_TOTAL_TIMEOUT_S), measure(tenant_key)).await {
        Ok(Ok(rows)) => rows,
        Ok(Err(e)) => {
            tracing::warn!("节点测速失败: {e:#}");
            Vec::new()
        }
        Err(_) => {
            tracing::warn!("节点测速超时");
            Vec::new()
        }
    };
    let ping = rows
        .iter()
        .filter_map(|r| r.ping.map(|ms| serde_json::json!({ "nodeId": r.id, "result": ms })))
        .collect();
    let node = if !saved.is_empty() && rows.iter().any(|r| r.id == saved) {
        saved.to_string()
    } else {
        rows.first().map(|r| r.id.clone()).unwrap_or_default()
    };
    if !rows.is_empty() {
        ui::set_nodes(rows, node.clone());
    }
    (node, ping)
}
