//! 从 web bundle 逆向出的固定配置常量。

pub const SDK_API_BASE: &str = "https://sdk-api.yingxiong.com";
pub const USDK_API_BASE: &str = "https://usdk.yingxiong.com/hu";
pub const CLOUDGAME_PAGE_URL: &str = "https://dna.yingxiong.com/cloudgame/";
pub const SIGNAL_DOMAIN: &str = "wss://webrtc-signaling.vlinkcloud.cn";
pub const NODE_CONFIG_BASE: &str = "https://paas-sdk-config.vlinkcloud.cn";
pub const NODE_CONFIG_BASE_BAK: &str = "https://paas-sdk-config-ks.vlinkcloud.cn";

pub const APP_KEY: &str = "qkMwl7BaLLBBxxLbHBXw";
pub const APP_SECRET: &str = "kun4PXFFDDJHwSVsSR3A";
pub const PRODUCT_ID: &str = "D10724A";
pub const PROJECT_ID: &str = "P39425A";
pub const SERVER_ID: &str = "M1706A";
pub const PKG: &str = "com.cloudegame.h5";
pub const GAME_NAME: &str = "二重螺旋";
pub const CID: &str = "314";
pub const CHANNEL: &str = "heroh5cloud";
/// 游戏内 login 消息的 pcode。
pub const GAME_PCODE: &str = "17337";
/// checklgn 信封的 _e_ / aki。
pub const USDK_AKI: &str = "1373718187";
/// usdk AES key（base64 → utf8）。
pub const USDK_AK_B64: &str = "dDNWeEtjZXdKdm9XUUNmVjdjV1lSQ1hZaWs1U1ZObmo=";
pub const CSDK_VERSION: &str = "5.0.0";
pub const SDK_CLIENT_VER: &str = "5.11.4.260113143905-wlweb-release";

/// play.lg / VideoSettings 的 codecType：18 = H264（SDP 中剥 H265）。
pub const CODEC_TYPE_H264: i64 = 18;
/// wasm open_session 的 video_codec:官方 iw[codecType] 映射 {18:1(H264), 21:2(H265)}
pub const VIDEO_CODEC: i32 = 1;
pub const BIT_RATE: i64 = 10_000;
pub const FPS: i64 = 60;

/// channelParams（GAME_CONFIG_INTERNAL）合并进每个 sdk-api 请求体。
pub fn channel_params() -> serde_json::Value {
    serde_json::json!({
        "productId": PRODUCT_ID,
        "projectId": PROJECT_ID,
        "serverId": SERVER_ID,
        "appKey": APP_KEY,
        "appSecret": APP_SECRET,
        "pkg": PKG,
        "gameName": GAME_NAME,
        "cid": CID,
        "channel": CHANNEL,
    })
}

/// CONFIG_COMMON_DATA。
pub fn common_data() -> serde_json::Value {
    serde_json::json!({
        "__e__": "1",
        "grant_type": "authorization_code",
        "redirect_uri": "1",
        "response_type": "code",
        "market": "PC",
        "platform": "PC",
        "sdkVersion": CSDK_VERSION,
    })
}

pub fn usdk_aes_key() -> ([u8; 32], [u8; 16]) {
    use base64::Engine;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(USDK_AK_B64)
        .expect("USDK_AK_B64");
    let mut key = [0u8; 32];
    key.copy_from_slice(&raw[..32]);
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&raw[..16]);
    (key, iv)
}
