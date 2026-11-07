//! WeLink datachannel protobuf 消息（对应 jspb 生成的 proto.CG.PROTO / proto.WLCGV2）。

use prost::Message;

#[derive(Clone, PartialEq, Message)]
pub struct SimpleCmd {
    #[prost(string, tag = "1")]
    pub cmd: String,
    #[prost(string, tag = "2")]
    pub arg: String,
    #[prost(bytes = "vec", tag = "3")]
    pub data: Vec<u8>,
    #[prost(string, tag = "4")]
    pub arg1: String,
    #[prost(string, tag = "5")]
    pub arg2: String,
}

impl SimpleCmd {
    pub fn new(cmd: &str) -> Self {
        Self {
            cmd: cmd.to_string(),
            arg: String::new(),
            data: Vec::new(),
            arg1: String::new(),
            arg2: String::new(),
        }
    }

    pub fn decode(buf: &[u8]) -> Option<Self> {
        <Self as Message>::decode(buf).ok()
    }

    pub fn encode(&self) -> Vec<u8> {
        self.encode_to_vec()
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct VideoSettings {
    #[prost(int32, tag = "1")]
    pub width: i32,
    #[prost(int32, tag = "2")]
    pub height: i32,
    #[prost(int32, tag = "3")]
    pub codec_type: i32,
    #[prost(int32, tag = "4")]
    pub bit_rate: i32,
    #[prost(int32, tag = "5")]
    pub fps: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct ClientFirstOnline {
    #[prost(int32, tag = "1")]
    pub gsm_id: i32,
    #[prost(int32, tag = "2")]
    pub game_id: i32,
    #[prost(string, tag = "3")]
    pub device_uuid: String,
    #[prost(string, tag = "4")]
    pub token: String,
    #[prost(string, tag = "5")]
    pub client_ver: String,
    #[prost(message, optional, tag = "7")]
    pub video: Option<VideoSettings>,
    #[prost(string, tag = "8")]
    pub gsm_token: String,
    #[prost(string, tag = "9")]
    pub serial_id: String,
    #[prost(string, tag = "10")]
    pub save_id: String,
    #[prost(string, tag = "11")]
    pub game_id_str: String,
    #[prost(string, tag = "12")]
    pub game_mode: String,
    #[prost(string, tag = "13")]
    pub instance_id: String,
    #[prost(string, tag = "14")]
    pub account_id: String,
    #[prost(string, tag = "15")]
    pub cmd_line: String,
    #[prost(string, tag = "16")]
    pub extparam: String,
    #[prost(string, tag = "17")]
    pub gamepath: String,
    #[prost(string, tag = "18")]
    pub cfgpath: String,
    #[prost(string, tag = "19")]
    pub package: String,
    #[prost(string, tag = "20")]
    pub activity: String,
    #[prost(string, tag = "21")]
    pub background_image: String,
    #[prost(string, tag = "22")]
    pub platform: String,
    #[prost(int32, tag = "23")]
    pub cursor: i32,
    #[prost(int32, tag = "24")]
    pub pause: i32,
    #[prost(string, tag = "25")]
    pub sdk_info: String,
}

#[derive(Clone, Copy, PartialEq, Message)]
pub struct CoordinatePos {
    #[prost(int32, tag = "1")]
    pub x: i32,
    #[prost(int32, tag = "2")]
    pub y: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct OneInputOpData {
    #[prost(int32, tag = "1")]
    pub input_op: i32,
    #[prost(int32, tag = "2")]
    pub input_state: i32,
    #[prost(int32, tag = "3")]
    pub value: i32,
    #[prost(message, optional, tag = "4")]
    pub cursor_pos: Option<CoordinatePos>,
    #[prost(message, optional, tag = "5")]
    pub mouse_pos: Option<CoordinatePos>,
    #[prost(int32, tag = "6")]
    pub op_device: i32,
    #[prost(int32, tag = "7")]
    pub xinput_user_index: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct InputOpData {
    #[prost(message, repeated, tag = "1")]
    pub op_list: Vec<OneInputOpData>,
}

/// wasm mouse export 的 action 码表（Z3）—— 与 InputOP protobuf(512+)不同！
pub mod z3 {
    pub const LEFT: i32 = 1;
    pub const MIDDLE: i32 = 2;
    pub const RIGHT: i32 = 3;
    pub const WHEEL: i32 = 4;
    pub const MOV: i32 = 5;
    pub const XBUTTON1_BACK: i32 = 7;
    pub const XBUTTON2_FORWARD: i32 = 8;
}

pub mod input_op {
    pub const MOUSE_BUTTON_LEFT: i32 = 512;
    pub const MOUSE_BUTTON_MIDDLE: i32 = 513;
    pub const MOUSE_BUTTON_RIGHT: i32 = 514;
    pub const MOUSE_WHEEL: i32 = 515;
    pub const MOUSE_MOV: i32 = 516;
    pub const MOUSE_XBUTTON1_BACK: i32 = 518;
    pub const MOUSE_XBUTTON2_FORWARD: i32 = 519;
}

pub mod input_state {
    pub const DEFAULT: i32 = 1;
    pub const DOWN: i32 = 2;
    pub const UP: i32 = 3;
}

pub mod op_device {
    pub const KEYBOARD: i32 = 1;
    pub const MOUSE: i32 = 2;
    pub const TOUCH: i32 = 16;
}

/// 构造一条输入指令并包装成 SimpleCmd{cmd:"CtrlMsg", data:InputOPData}。
pub fn ctrl_msg(op: OneInputOpData) -> SimpleCmd {
    let mut cmd = SimpleCmd::new("CtrlMsg");
    cmd.data = InputOpData { op_list: vec![op] }.encode_to_vec();
    cmd
}

/// SimpleCmd{cmd:"PackedData", arg:sdpInfo, data:base64(encodeURI(packedData))}。
pub fn packed_data_cmd(packed_data: &str, sdp_info_json: &str) -> SimpleCmd {
    let mut cmd = SimpleCmd::new("PackedData");
    cmd.arg = sdp_info_json.to_string();
    cmd.data = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        encode_uri_component(packed_data),
    )
    .into_bytes();
    cmd
}

/// SimpleCmd{cmd:"SendDataToGame", arg:base64(json), arg1:index}
pub fn send_data_to_game_cmd(json: &str, index: u64) -> SimpleCmd {
    let mut cmd = SimpleCmd::new("SendDataToGame");
    cmd.arg = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, json.as_bytes());
    cmd.arg1 = index.to_string();
    cmd
}

/// SimpleCmd{cmd:"PackedData", arg:sdp_json, data:encodeURI(packed_data)}
/// jspb setData(字符串) 序列化时按 base64 解码，线上字节=encodeURI 后的原文。
pub fn packed_data_dispatch_cmd(packed_data: &str, sdp_json: &str) -> SimpleCmd {
    let mut cmd = SimpleCmd::new("PackedData");
    cmd.arg = sdp_json.to_string();
    cmd.data = encode_uri(packed_data).into_bytes();
    cmd
}

/// JS encodeURI：保留 unreserved + reserved 字符。
fn encode_uri(s: &str) -> String {
    const UNESCAPED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,#";
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        if UNESCAPED.contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// JS btoa。
fn btoa(s: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(s.as_bytes()).into_bytes()
}

fn encode_uri_component(s: &str) -> Vec<u8> {
    const UNRESERVED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()";
    let mut out = Vec::with_capacity(s.len());
    for &b in s.as_bytes() {
        if UNRESERVED.contains(&b) {
            out.push(b);
        } else {
            out.extend_from_slice(format!("%{b:02X}").as_bytes());
        }
    }
    out
}
