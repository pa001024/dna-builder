//! 「小小狩月人」奖励管道的协议核心：换行分帧 + JSON 解码。
//!
//! 与 Tauri、进程状态无关，只做「字节流 → 事件」的纯转换，因此可以脱离应用单独测试。
//! 传输与运行状态在 [`super::afk_bridge`]，协议文档见 `specs/afk-support-protocol.md`。

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

/// 单行上限：超过即认为流已错位，丢弃半包并重新同步。
pub const MAX_LINE_BYTES: usize = 1 << 20;

/// 归一化后的事件：`kind` 由 [`AfkEventKind`] 的 tag 提供，其余为公共字段。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AfkEvent {
    /// 本地接收时刻（Unix 毫秒）。**不是**事件发生时刻：连接瞬间会回放积压。
    pub received_at: u64,
    /// 原始行（不含行尾分隔符），便于排查与前端展示
    pub raw: String,
    /// 解析结果，字段扁平化到对象顶层（`kind` + 各业务字段）
    #[serde(flatten)]
    pub kind: AfkEventKind,
}

/// 协议内的事件类型。字段与官方 `HandlePipeMessage` 的分支逐条对齐。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AfkEventKind {
    /// 掉落/奖励（也是官方分发逻辑的兜底分支）
    Reward {
        /// 物品 ID；缺省为 `None`（官方默认 0）
        id: Option<i64>,
        /// 物品名（本地化文本）
        name: String,
        /// 品质 1..5
        rarity: i64,
        /// 数量
        count: i64,
    },
    /// 铸造完成
    Craft {
        name: String,
        rarity: i64,
        count: i64,
    },
    /// 委托/副本进出
    Dungeon {
        /// 官方同时接受数字与字符串，这里统一成字符串
        id: String,
        /// 只会有 `enter` / `complete`
        status: String,
        name: String,
    },
    /// 角色状态（驱动官方浮窗像素动画）
    Character {
        id: i64,
        skin: Option<i64>,
        state: String,
        name: String,
        scene: Option<String>,
    },
    /// 强制刷怪（官方调试/联动用）
    Monster { id: i64 },
    /// 聊天未读数
    Chat { team: i64, world: i64, party: i64 },
    /// 游戏语言
    Language { lang: String },
    /// 官方工具 UI 指令（游戏 → 工具）。DNA Builder 只记录不执行。
    Control {
        /// `shutdown` / `hittest` / `history` / `craftpanel` / `scroll` /
        /// `settings` / `tab` / `zoom`
        action: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        index: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        x: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        y: Option<f64>,
    },
}

/// 一帧解析失败的原因。
#[derive(Clone, Debug, PartialEq)]
pub enum AfkParseError {
    /// JSON 非法或根不是对象
    Json(String),
    /// JSON 合法但官方实现会静默丢弃
    Dropped(&'static str),
}

impl std::fmt::Display for AfkParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AfkParseError::Json(e) => write!(f, "invalid JSON: {e}"),
            AfkParseError::Dropped(r) => write!(f, "dropped: {r}"),
        }
    }
}

/// 当前 Unix 毫秒。
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 读取整数字段，语义对齐 `JsonElement.TryGetInt32(out x)`：
/// 字段存在但类型/范围不符时得到 0，字段不存在时用调用方给的默认值。
fn int_field(root: &Value, key: &str, default: i64) -> i64 {
    match root.get(key) {
        None => default,
        Some(v) => v.as_i64().unwrap_or(0),
    }
}

/// 读取浮点字段，语义对齐官方对 `ValueKind::Number` 的显式判断：非数字即 `None`。
fn num_field(root: &Value, key: &str) -> Option<f64> {
    root.get(key).and_then(Value::as_f64)
}

/// 读取字符串字段：非字符串即空串（官方多处 `GetString() ?? ""`）。
fn str_field(root: &Value, key: &str) -> String {
    root.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// 可选字符串字段：只在值是字符串时返回。
fn opt_str_field(root: &Value, key: &str) -> Option<String> {
    root.get(key).and_then(Value::as_str).map(str::to_string)
}

/// 解析一条协议帧（已剥掉行尾分隔符）。
///
/// 分支顺序与官方 `MainWindow.HandlePipeMessage` 完全一致：
/// `type` 缺省为 `reward` → 精确匹配控制类 → 大小写不敏感匹配 `craft`/`dungeon`/`chat`
/// → 兜底当 `reward`（无 `name` 则丢弃）。
///
/// @param raw 一行 JSON 文本
/// @returns 归一化事件，或该帧被丢弃的原因
pub fn parse_event(raw: &str) -> Result<AfkEventKind, AfkParseError> {
    let root: Value = serde_json::from_str(raw).map_err(|e| AfkParseError::Json(e.to_string()))?;
    if !root.is_object() {
        return Err(AfkParseError::Json("root is not an object".into()));
    }
    let ty = root.get("type").and_then(Value::as_str).unwrap_or("reward");

    // 1) 官方 switch：精确匹配，区分大小写
    match ty {
        "shutdown" => {
            return Ok(AfkEventKind::Control {
                action: "shutdown".into(),
                index: None,
                value: None,
                x: None,
                y: None,
            });
        }
        "language" => {
            return Ok(AfkEventKind::Language {
                lang: str_field(&root, "lang"),
            });
        }
        "hittest" => {
            return Ok(AfkEventKind::Control {
                action: "hittest".into(),
                index: None,
                value: None,
                x: Some(num_field(&root, "x").unwrap_or(0.0)),
                y: Some(num_field(&root, "y").unwrap_or(0.0)),
            });
        }
        "history" => {
            return Ok(AfkEventKind::Control {
                action: "history".into(),
                index: None,
                value: None,
                x: None,
                y: None,
            });
        }
        "craftpanel" => {
            return Ok(AfkEventKind::Control {
                action: "craftpanel".into(),
                index: None,
                value: None,
                x: None,
                y: None,
            });
        }
        "settings" => {
            return Ok(AfkEventKind::Control {
                action: "settings".into(),
                index: None,
                value: None,
                x: None,
                y: None,
            });
        }
        "scroll" => {
            return match num_field(&root, "value") {
                Some(v) => Ok(AfkEventKind::Control {
                    action: "scroll".into(),
                    index: None,
                    value: Some(v),
                    x: None,
                    y: None,
                }),
                // 官方只在 value 是数字时动作，否则整条忽略
                None => Err(AfkParseError::Dropped("scroll without numeric 'value'")),
            };
        }
        "tab" => {
            return match num_field(&root, "index") {
                Some(v) => Ok(AfkEventKind::Control {
                    action: "tab".into(),
                    index: Some(v as i64),
                    value: None,
                    x: None,
                    y: None,
                }),
                None => Err(AfkParseError::Dropped("tab without numeric 'index'")),
            };
        }
        "zoom" => {
            return match num_field(&root, "value") {
                Some(v) => Ok(AfkEventKind::Control {
                    action: "zoom".into(),
                    index: None,
                    value: Some(v),
                    x: None,
                    y: None,
                }),
                None => Err(AfkParseError::Dropped("zoom without numeric 'value'")),
            };
        }
        "character" => {
            if root.get("id").and_then(Value::as_i64).is_none() {
                return Err(AfkParseError::Dropped("character without numeric 'id'"));
            }
            return Ok(AfkEventKind::Character {
                id: int_field(&root, "id", 0),
                skin: root.get("skin").and_then(Value::as_i64),
                state: root
                    .get("state")
                    .and_then(Value::as_str)
                    .unwrap_or("idle")
                    .to_string(),
                name: str_field(&root, "name"),
                scene: opt_str_field(&root, "scene"),
            });
        }
        "monster" => {
            if root.get("id").and_then(Value::as_i64).is_none() {
                return Err(AfkParseError::Dropped("monster without numeric 'id'"));
            }
            return Ok(AfkEventKind::Monster {
                id: int_field(&root, "id", 0),
            });
        }
        _ => {}
    }

    // 2) 之后三个分支官方用的是 OrdinalIgnoreCase
    if ty.eq_ignore_ascii_case("craft") {
        return match opt_str_field(&root, "name") {
            Some(name) => Ok(AfkEventKind::Craft {
                name,
                rarity: int_field(&root, "rarity", 1),
                count: int_field(&root, "count", 1),
            }),
            None => Err(AfkParseError::Dropped("craft without string 'name'")),
        };
    }
    if ty.eq_ignore_ascii_case("dungeon") {
        let id = match root.get("id") {
            Some(Value::Number(n)) => n.as_i64().map(|v| v.to_string()).unwrap_or_default(),
            Some(Value::String(s)) => s.clone(),
            _ => String::new(),
        };
        let status = str_field(&root, "status").to_ascii_lowercase();
        if status != "enter" && status != "complete" {
            return Err(AfkParseError::Dropped("dungeon with unsupported 'status'"));
        }
        return Ok(AfkEventKind::Dungeon {
            id,
            status,
            name: str_field(&root, "name"),
        });
    }
    if ty.eq_ignore_ascii_case("chat") {
        // 官方的兼容字段：count 会覆盖 party
        let party = if root.get("count").is_some() {
            int_field(&root, "count", 0)
        } else {
            int_field(&root, "party", 0)
        };
        return Ok(AfkEventKind::Chat {
            team: int_field(&root, "team", 0),
            world: int_field(&root, "world", 0),
            party,
        });
    }

    // 3) 兜底：有 name 就是奖励，否则丢弃（官方会打 "reward message missing 'name' field."）
    match opt_str_field(&root, "name") {
        Some(name) => Ok(AfkEventKind::Reward {
            id: root.get("id").and_then(Value::as_i64),
            name,
            rarity: int_field(&root, "rarity", 1),
            count: int_field(&root, "count", 1),
        }),
        None => Err(AfkParseError::Dropped("reward without string 'name'")),
    }
}

/// 行切分器。
///
/// 协议是字节流 + 换行分帧（官方 `StreamReader.ReadLine`），单次 `read` 的返回边界
/// 与消息边界完全无关，因此必须自己缓冲并按 `\r\n` / `\n` / `\r` 切分。
#[derive(Default)]
pub struct LineSplitter {
    pending: Vec<u8>,
}

impl LineSplitter {
    /// 喂入一段字节，对每个完整行回调一次（行尾分隔符已剥离）。
    ///
    /// 末尾单独出现的 `\r` 会留到下一次，避免把被切断的 `\r\n` 当成两行。
    ///
    /// @param data 新读到的字节
    /// @param on_line 每个完整行的回调
    /// @returns 缓冲是否因超过 [`MAX_LINE_BYTES`] 被整体丢弃
    pub fn push_with(&mut self, data: &[u8], mut on_line: impl FnMut(&[u8])) -> bool {
        self.pending.extend_from_slice(data);
        let len = self.pending.len();
        let mut start = 0usize;
        let mut i = 0usize;
        while i < len {
            match self.pending[i] {
                b'\n' => {
                    on_line(&self.pending[start..i]);
                    start = i + 1;
                }
                b'\r' => {
                    let next = self.pending.get(i + 1);
                    match next {
                        // 被切断的 \r\n：留到下次
                        None => break,
                        Some(b'\n') => {
                            on_line(&self.pending[start..i]);
                            start = i + 2;
                            i += 1;
                        }
                        Some(_) => {
                            on_line(&self.pending[start..i]);
                            start = i + 1;
                        }
                    }
                }
                _ => {}
            }
            i += 1;
        }
        if start > 0 {
            self.pending.drain(..start);
        }
        if self.pending.len() > MAX_LINE_BYTES {
            self.pending.clear();
            return true;
        }
        false
    }

    /// 连接结束时的残留半行（官方 `ReadLine` 在 EOF 仍会返回它）。
    pub fn finish(&mut self) -> Option<&[u8]> {
        if self.pending.is_empty() {
            None
        } else {
            Some(&self.pending)
        }
    }
}

/// 真实帧样本：2026-10-22 08:01:37 会话里官方 `Read line:` 记录的原文（未做任何改写）。
/// 放在模块级而非 tests 内，供 `afk_bridge` 的管道端到端测试共用。
#[cfg(test)]
pub const REAL_REWARD: &str = r#"{"type":"reward","id":51007,"name":"坚守","rarity":5,"count":1}"#;
#[cfg(test)]
pub const REAL_DUNGEON: &str =
    r#"{"type":"dungeon","id":"616006","status":"complete","name":"避险"}"#;
#[cfg(test)]
pub const REAL_CHARACTER: &str =
    r#"{"type":"character","id":4103,"state":"combat","name":"黎瑟·浴火","scene":"BG06"}"#;

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实帧必须解析成预期事件。
    #[test]
    fn parses_real_frames() {
        assert_eq!(
            parse_event(REAL_REWARD).unwrap(),
            AfkEventKind::Reward {
                id: Some(51007),
                name: "坚守".into(),
                rarity: 5,
                count: 1
            }
        );
        assert_eq!(
            parse_event(REAL_DUNGEON).unwrap(),
            AfkEventKind::Dungeon {
                id: "616006".into(),
                status: "complete".into(),
                name: "避险".into()
            }
        );
        assert_eq!(
            parse_event(REAL_CHARACTER).unwrap(),
            AfkEventKind::Character {
                id: 4103,
                skin: None,
                state: "combat".into(),
                name: "黎瑟·浴火".into(),
                scene: Some("BG06".into())
            }
        );
        assert_eq!(
            parse_event(r#"{"type":"language","lang":"zh"}"#).unwrap(),
            AfkEventKind::Language { lang: "zh".into() }
        );
    }

    /// `type` 缺省时官方按 reward 处理；没有 name 则丢弃。
    #[test]
    fn reward_is_catch_all() {
        assert_eq!(
            parse_event(r#"{"name":"金币袋"}"#).unwrap(),
            AfkEventKind::Reward {
                id: None,
                name: "金币袋".into(),
                rarity: 1,
                count: 1
            }
        );
        assert_eq!(
            parse_event(r#"{"name":"金币袋","rarity":3,"count":2,"id":30001}"#).unwrap(),
            AfkEventKind::Reward {
                id: Some(30001),
                name: "金币袋".into(),
                rarity: 3,
                count: 2
            }
        );
        assert_eq!(
            parse_event(r#"{"type":"unknown-type"}"#),
            Err(AfkParseError::Dropped("reward without string 'name'"))
        );
        assert!(matches!(
            parse_event("{not json"),
            Err(AfkParseError::Json(_))
        ));
        assert!(matches!(parse_event("[]"), Err(AfkParseError::Json(_))));
    }

    /// 官方分支细节：dungeon.id 接受数字；status 大小写不敏感且只认 enter/complete。
    #[test]
    fn dungeon_variants() {
        assert_eq!(
            parse_event(r#"{"type":"Dungeon","id":64102,"status":"ENTER","name":"扼守/无尽"}"#)
                .unwrap(),
            AfkEventKind::Dungeon {
                id: "64102".into(),
                status: "enter".into(),
                name: "扼守/无尽".into()
            }
        );
        assert!(matches!(
            parse_event(r#"{"type":"dungeon","id":1,"status":"abandon"}"#),
            Err(AfkParseError::Dropped(_))
        ));
    }

    /// craft / chat / 控制类分支与字段校验。
    #[test]
    fn craft_chat_control() {
        assert_eq!(
            parse_event(r#"{"type":"craft","name":"铸造长剑","rarity":3}"#).unwrap(),
            AfkEventKind::Craft {
                name: "铸造长剑".into(),
                rarity: 3,
                count: 1
            }
        );
        assert!(matches!(
            parse_event(r#"{"type":"craft","name":1}"#),
            Err(AfkParseError::Dropped(_))
        ));
        assert_eq!(
            parse_event(r#"{"type":"chat","team":1,"world":2,"count":9}"#).unwrap(),
            AfkEventKind::Chat {
                team: 1,
                world: 2,
                party: 9
            }
        );
        assert_eq!(
            parse_event(r#"{"type":"zoom","value":1.5}"#).unwrap(),
            AfkEventKind::Control {
                action: "zoom".into(),
                index: None,
                value: Some(1.5),
                x: None,
                y: None
            }
        );
        // 官方要求 numeric id，缺失整条丢弃
        assert!(matches!(
            parse_event(r#"{"type":"character"}"#),
            Err(AfkParseError::Dropped(_))
        ));
        assert!(matches!(
            parse_event(r#"{"type":"monster","id":"1"}"#),
            Err(AfkParseError::Dropped(_))
        ));
    }

    /// 真实帧按任意字节边界切分（含 `\r\n` 被切断）也必须还原成完整行。
    #[test]
    fn splits_frames_on_any_boundary() {
        let frames = [REAL_REWARD, REAL_DUNGEON, REAL_CHARACTER];
        // 前两帧用 \r\n / \n 分帧，最后一帧没有行尾（EOF 残留）
        let stream = format!("{}\r\n{}\n{}", frames[0], frames[1], frames[2]);
        let mut splitter = LineSplitter::default();
        let mut lines: Vec<String> = Vec::new();
        for chunk in stream.as_bytes().chunks(3) {
            splitter.push_with(chunk, |line| {
                lines.push(String::from_utf8_lossy(line).into_owned())
            });
        }
        if let Some(rest) = splitter.finish() {
            lines.push(String::from_utf8_lossy(rest).into_owned());
        }
        assert_eq!(lines, frames.to_vec());
        for line in &lines {
            assert!(parse_event(line).is_ok(), "解析失败: {line}");
        }
    }

    /// 下发到前端的 JSON 必须是扁平结构：`kind` 与业务字段同级。
    #[test]
    fn event_serializes_flat() {
        let event = AfkEvent {
            received_at: 1,
            raw: REAL_REWARD.into(),
            kind: parse_event(REAL_REWARD).unwrap(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["kind"], "reward");
        assert_eq!(json["name"], "坚守");
        assert_eq!(json["rarity"], 5);
        assert_eq!(json["raw"], REAL_REWARD);
        assert_eq!(json["receivedAt"], 1);
        assert!(json.get("received_at").is_none(), "前端类型用 receivedAt");
    }
}
