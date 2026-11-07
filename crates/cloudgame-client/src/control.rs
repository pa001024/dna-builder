//! 会话内控制类 SimpleCmd：分辨率 / 码率。
//! 对应官方 JS 的 setGameResolution / setBitrateRange。

use std::sync::mpsc::Sender;

use crate::proto::SimpleCmd;
use crate::wgc::WgcCmd;

/// 画质档位（官方 bitRateLevelMap，单位 kbps）：(名称, 自适应下限, 固定码率)。
pub const QUALITY: [(&str, i64, i64); 3] = [
    ("标准", 2_000, 6_000),
    ("高清", 4_000, 10_000),
    ("超清", 8_000, 12_000),
];
/// 官方默认档位 "hight"。
pub const DEFAULT_QUALITY: usize = 1;

pub fn send(eng: &Sender<WgcCmd>, cmd: &str, arg: &str, arg1: &str) {
    let c = SimpleCmd {
        cmd: cmd.into(),
        arg: arg.into(),
        arg1: arg1.into(),
        ..Default::default()
    };
    let _ = eng.send(WgcCmd::Protobuf { sid: 0, data: c.encode() });
}

/// 官方 setGameResolution(w,h)：arg=宽, arg1=高，请求游戏按该分辨率出流。
pub fn set_game_resolution(eng: &Sender<WgcCmd>, w: u32, h: u32) {
    // H.264 要求偶数宽高
    let (w, h) = ((w.max(320) / 2) * 2, (h.max(180) / 2) * 2);
    tracing::info!("SetGameResolution {w}x{h}");
    send(eng, "SetGameResolution", &w.to_string(), &h.to_string());
}

/// 官方 setBitrateRange：先固定档位码率，再放开自适应下限。
pub fn set_bitrate_range(eng: &Sender<WgcCmd>, min: i64, max: i64) {
    tracing::info!("bitrate range {min}..{max}");
    send(eng, "ResetVideoBitrate", &max.to_string(), "");
    send(eng, "autoBitrateAdjust", &min.to_string(), "");
}
