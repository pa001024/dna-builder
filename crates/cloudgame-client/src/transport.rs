//! WebTransport 传输层（对应 worker 里的 WebTransport + bidi stream + datagrams）。

use std::sync::mpsc::Sender;

use anyhow::{Context, Result};
use wtransport::{ClientConfig, Connection, Endpoint};

use crate::wgc::WgcCmd;

/// 建立 WT 连接 `https://{host}:{port}/v2/game`，证书走 SHA-256 hash pinning。
/// 出站数据从 out_rx 取（stream/datagram 分路），入站回灌 wasm。
pub async fn connect(
    host: &str,
    port: u16,
    cert_hashes: Vec<Vec<u8>>,
    engine: Sender<WgcCmd>,
    stream_out: tokio::sync::mpsc::Receiver<Vec<u8>>,
    dgram_out: tokio::sync::mpsc::Receiver<Vec<u8>>,
) -> Result<()> {
    let url = format!("https://{host}:{port}/v2/game");
    let builder = ClientConfig::builder().with_bind_default();
    let tls = if !cert_hashes.is_empty() {
        let hashes: Vec<wtransport::tls::Sha256Digest> = cert_hashes
            .iter()
            .filter_map(|h| <[u8; 32]>::try_from(h.as_slice()).ok())
            .map(Into::into)
            .collect();
        wtransport::tls::client::build_default_tls_config(
            std::sync::Arc::new(rustls::RootCertStore::empty()),
            Some(std::sync::Arc::new(wtransport::tls::client::ServerHashVerification::new(hashes))),
        )
    } else {
        wtransport::tls::client::build_default_tls_config(
            std::sync::Arc::new(rustls::RootCertStore::empty()),
            Some(std::sync::Arc::new(wtransport::tls::client::NoServerVerification::new())),
        )
    };
    // 媒体走 QUIC DATAGRAM —— quinn 默认不分配 datagram 缓冲区
    let mut tc = wtransport::config::QuicTransportConfig::default();
    tc.datagram_receive_buffer_size(Some(16 * 1024 * 1024));
    tc.datagram_send_buffer_size(1024 * 1024);
    let endpoint = Endpoint::client(builder.with_custom_tls_and_transport(tls, tc).build())?;
    let conn: Connection = endpoint.connect(&url).await.context("wt connect")?;
    tracing::info!("WebTransport connected: {url} max_dgram={:?}", conn.max_datagram_size());

    // bidi stream
    let (mut send, mut recv) = conn.open_bi().await?.await?;

    // stream 出站
    let mut stream_out = stream_out;
    tokio::spawn(async move {
        while let Some(data) = stream_out.recv().await {
            if send.write_all(&data).await.is_err() {
                break;
            }
        }
    });

    // stream 入站
    let eng = engine.clone();
    tokio::spawn(async move {
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match recv.read(&mut buf).await {
                Ok(Some(n)) => {
                    crate::ui::add_rx_bytes(n);
                    let _ = eng.send(WgcCmd::StreamData(buf[..n].to_vec()));
                }
                _ => break,
            }
        }
    });

    // datagram 出站
    let conn2 = conn.clone();
    tokio::spawn(async move {
        let mut dgram_out = dgram_out;
        while let Some(data) = dgram_out.recv().await {
            if conn2.send_datagram(&data).is_err() {
                break;
            }
        }
    });

    // datagram 入站 —— 热路径零 I/O;统计视频 PT=96 的 seq 缺口
    static DTX_N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let mut last_seq: Option<u16> = None;
    let mut gaps = 0u64;
    let mut reordered = 0u64;
    loop {
        match conn.receive_datagram().await {
            Ok(dg) => {
                crate::ui::add_rx_bytes(dg.len());
                let n = DTX_N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if dg.len() >= 12 && (dg[0] & 0xc0) == 0x80 {
                    let pt = dg[1] & 0x7f;
                    let ssrc = u32::from_be_bytes([dg[8], dg[9], dg[10], dg[11]]);
                    if n % 2000 == 1999 {
                        let seq = u16::from_be_bytes([dg[2], dg[3]]);
                        tracing::info!("dgram stat: {n} pkts pt={pt} ssrc={ssrc:x} seq={seq:x} len={} gaps={gaps} reo={reordered}", dg.len());
                    }
                    if pt == 96 {
                        let seq = u16::from_be_bytes([dg[2], dg[3]]);
                        if let Some(prev) = last_seq {
                            let d = seq.wrapping_sub(prev);
                            if d != 1 {
                                if d > 1 && d < 0x8000 { gaps += (d - 1) as u64; }
                                else { reordered += 1; }
                            }
                        }
                        last_seq = Some(seq);
                    }
                }
                let _ = engine.send(WgcCmd::DatagramData(dg.to_vec()));
            }
            Err(e) => {
                tracing::warn!("datagram recv end: {e}");
                break;
            }
        }
    }
    let _ = engine.send(WgcCmd::OnDisconnect { sid: 0 });
    Ok(())
}
