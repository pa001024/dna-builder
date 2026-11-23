//! 实时日志分析：独立线程 tail `EM.log`，按行解析为结构化事件并分包上报前端。
//! 解析口径逐字对照 `.tmp/log-analysis/oracle/emlog.cjs`，接口契约见 `.docs/log-analysis/ARCHITECTURE.md` 第 3 节。

use std::{
    borrow::Cow,
    fs::{self, File},
    io::{ErrorKind, Read, Seek, SeekFrom},
    mem,
    ops::Range,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const EVENT_BATCH: &str = "log-analysis://batch";
const EVENT_STATUS: &str = "log-analysis://status";
const EVENT_LIFECYCLE: &str = "log-analysis://lifecycle";

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const FLUSH_INTERVAL: Duration = Duration::from_millis(250);
const STATUS_INTERVAL: Duration = Duration::from_secs(1);
const STOP_WAIT: Duration = Duration::from_millis(100);
const MISSING_TOLERANCE: Duration = Duration::from_secs(5);
const MAX_BATCH_EVENTS: usize = 512;
const MAX_LINE_BYTES: usize = 1024 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;

/* ---------- 对外数据结构 ---------- */

/// `log_analysis_start` 的返回信息。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogAnalysisStartInfo {
    pub path: String,
    pub file_size: u64,
    pub from_start: bool,
    pub started_at: f64,
}

/// 监听会话状态（status 事件载荷同名结构）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogAnalysisStatus {
    pub running: bool,
    pub path: Option<String>,
    pub bytes_read: u64,
    pub lines_read: u64,
    pub file_size: u64,
    pub started_at: Option<f64>,
    pub error: Option<String>,
}

impl LogAnalysisStatus {
    fn idle() -> Self {
        Self {
            running: false,
            path: None,
            bytes_read: 0,
            lines_read: 0,
            file_size: 0,
            started_at: None,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LifecyclePayload {
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogBatch {
    seq: u64,
    events: Vec<LogEvent>,
    bytes_read: u64,
    lines_read: u64,
    file_size: u64,
    eof: bool,
}

/// 结构化日志事件：`k` 为判别标签，字段一律 camelCase。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "k", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum LogEvent {
    Cmd {
        t: f64,
        line: String,
    },
    Diag {
        t: f64,
        enable: bool,
        force: bool,
        effective: bool,
    },
    DunEnter {
        t: f64,
        dungeon_id: i64,
    },
    EnterGuide {
        t: f64,
        dungeon_id: i64,
    },
    DunInit {
        t: f64,
        mode: String,
    },
    SoloFloor {
        t: f64,
        floor_id: i64,
        level: i64,
    },
    SoloInit {
        t: f64,
        dungeon_id: i64,
    },
    Level {
        t: f64,
        level_id: String,
        package: String,
    },
    Map {
        t: f64,
        name: String,
    },
    Taskbar {
        t: f64,
        id: i64,
        status: String,
        name: String,
    },
    HbEnter {
        t: f64,
        boss_id: i64,
        diff: i64,
    },
    Region {
        t: f64,
        region_id: i64,
    },
    Vote {
        t: f64,
        battle_num: i64,
    },
    Preload {
        t: f64,
        unit_id: i64,
        count: i64,
    },
    UnitCreate {
        t: f64,
        eid: i64,
        unit_id: i64,
        unit_type: String,
        x: f64,
        y: f64,
        z: f64,
    },
    AiCreate {
        t: f64,
        unit_id: i64,
        eid: i64,
    },
    Spawn {
        t: f64,
        bp: String,
        obj_id: i64,
        model_id: i64,
    },
    Death {
        t: f64,
        bp: String,
        obj_id: i64,
        eid: i64,
        create_type: String,
        creator_id: i64,
    },
    DeathLoc {
        t: f64,
        x: f64,
        y: f64,
        z: f64,
    },
    RealDead {
        t: f64,
        bp: String,
        obj_id: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        dead_type: Option<i64>,
    },
    DeadDetail {
        t: f64,
        bp: String,
        obj_id: i64,
        eid: i64,
        create_type: String,
        creator_id: i64,
    },
    Reason {
        t: f64,
        bp: String,
        obj_id: i64,
        reason: String,
    },
    Alive {
        t: f64,
        unit_spawn_id: i64,
        total_need: i64,
        members_num: i64,
        expected_sum: i64,
        alive_sum: i64,
    },
    Quota {
        t: f64,
        unit_spawn_id: i64,
        need_before: i64,
        quota_left: i64,
        total_need: i64,
    },
    Team {
        t: f64,
        index: i64,
        unit_spawn_id: i64,
        team_locs: i64,
    },
    Mvp {
        t: f64,
        index: i64,
        name: String,
        damage: f64,
        score: f64,
    },
    MvpMeta {
        t: f64,
        score: f64,
        index: i64,
        name: String,
    },
    Factor {
        t: f64,
        value: f64,
    },
    Settle {
        t: f64,
        win: bool,
        player_time: Option<f64>,
        game_time: Option<f64>,
        dungeon_id: i64,
    },
    Finish {
        t: f64,
        dungeon_id: i64,
        ok: bool,
        player_time: Option<f64>,
        game_time: Option<f64>,
    },
    Reward {
        t: f64,
        json: String,
    },
    RewardRate {
        t: f64,
        kind: String,
        value: i64,
    },
    Hit {
        t: f64,
        x: f64,
        y: f64,
        z: f64,
        pawn: Option<String>,
    },
    EidInit {
        t: f64,
        bp: String,
        eid: i64,
    },
    Skill {
        t: f64,
        eid: i64,
        skill_id: i64,
        local_role: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        phase: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        action: Option<String>,
    },
    PanelSkill {
        t: f64,
        skill_id: i64,
    },
    SlotSet {
        t: f64,
        slot: String,
        bp: Option<String>,
    },
    SlotName {
        t: f64,
        key: String,
    },
    SlotEn {
        t: f64,
        code: String,
    },
    SlotText {
        t: f64,
        text: String,
    },
    RiftInit {
        t: f64,
    },
    RiftTimer {
        t: f64,
        total_time: i64,
    },
    RiftEnterRoom {
        t: f64,
        room_id: i64,
    },
    RiftSpawn {
        t: f64,
        room_id: i64,
        spawn_id: i64,
    },
    RiftClear {
        t: f64,
        room_id: i64,
    },
    RiftTotal {
        t: f64,
    },
    RiftBossPick {
        t: f64,
        unit_id: i64,
    },
    RiftBossActive {
        t: f64,
        eid: i64,
        unit_id: i64,
    },
    RiftBossDead {
        t: f64,
    },
}

/* ---------- 正则表（逐字移植参考解析器） ---------- */

const PRE: &str = r"MonsterDeadAnimationEnd|Monster::RealOnDead|CurrentModelId is|EMMonsterSpawn|CreateAIUnit Type Monster|CreateUnitSuccess|CalculateMVP|OnDungeonFinish, DungeonId is|DungeonSettlement: OnLoaded|EnterDungeon callback|SystemGuide EnterDungeonEvent|InitDungeonComponent|SoloRaidComponent:Init|LevelId :|BattleNum =|预加载副本战斗资源|MapLevelName is|LogInit: Command Line|bEnableShippingLog|打中位置|PlayDeadAnimation|RealOnDungeonFinish|WBP_MainBar_C:Set|Character Name: BP_|ACharacterBase::Start RealUseSkill|RefreshRoleSkillButton|SendTaskbarDungeonStatus|LogTaskbarReward: DispatchJson:|OnRewardRateUpdate|OnEnterHardBoss|CurrentRegionId is|RiftComponent:";

struct RiftPatterns {
    init: Regex,
    timer: Regex,
    enter: Regex,
    spawn: Regex,
    clear: Regex,
    total: Regex,
    boss_pick: Regex,
    boss_active: Regex,
    boss_dead: Regex,
}

struct Patterns {
    pre: Regex,
    ts: Regex,
    death: Regex,
    death_lite: Regex,
    death_loc: Regex,
    real_dead: Regex,
    dead_detail: Regex,
    spawn: Regex,
    unit_create: Regex,
    ai_create: Regex,
    alive: Regex,
    quota: Regex,
    team: Regex,
    mvp: Regex,
    mvp_meta: Regex,
    factor: Regex,
    settle: Regex,
    settle_new: Regex,
    enter: Regex,
    enter_guide: Regex,
    init_dungeon: Regex,
    solo_floor: Regex,
    solo_init: Regex,
    level: Regex,
    dungeon_map: Regex,
    taskbar: Regex,
    reward: Regex,
    reward_rate: Regex,
    hb_enter: Regex,
    region_now: Regex,
    vote: Regex,
    preload: Regex,
    hit: Regex,
    cmd: Regex,
    diag: Regex,
    reason: Regex,
    set_name_slot: Regex,
    set_name_actor: Regex,
    slot_name: Regex,
    slot_en: Regex,
    slot_text: Regex,
    eid_init: Regex,
    skill: Regex,
    panel_skill: Regex,
    finish: Regex,
    rift: RiftPatterns,
}

impl Patterns {
    fn compile(source: &str) -> Regex {
        Regex::new(source).expect("日志解析正则必须可编译")
    }

    fn new() -> Self {
        Self {
            pre: Self::compile(PRE),
            ts: Self::compile(r"^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]"),
            death: Self::compile(
                r"MonsterDeadAnimationEnd\. Monster (\S+?)_C_(\d+) Eid (-?\d+) CreateType is (\w*) CreatorId is (-?\d+)",
            ),
            death_lite: Self::compile(
                r"MonsterDeadAnimationEnd\. Monster (\S+?)_C_(\d+) Eid (-?\d+)",
            ),
            death_loc: Self::compile(
                r"MonsterDeadAnimationEnd\. DamageCauserLocation=X=(-?[\d.]+) Y=(-?[\d.]+) Z=(-?[\d.]+)",
            ),
            real_dead: Self::compile(r"Monster::RealOnDead\s+(BP_\S+?)_C_(\d+)(?:,\s*(-?\d+))?"),
            dead_detail: Self::compile(
                r"PlayDeadAnimation\. Monster (BP_\S+?)_C_(\d+) Eid (-?\d+) CreateType is (\w*) CreatorId is (-?\d+)",
            ),
            spawn: Self::compile(r"Monster (\S+?)_C_(\d+) CurrentModelId is (\d+)"),
            unit_create: Self::compile(
                r"CreateUnitSuccess\s+Eid:\s*(-?\d+)\s+UnitId:\s*(-?\d+)\s+UnitType:\s*(\w+)\s+Loc:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)",
            ),
            ai_create: Self::compile(r"CreateAIUnit Type Monster, UnitId (\d+), Eid (-?\d+)"),
            alive: Self::compile(
                r"CalcTeamNeedSpawnMonsterInfos UnitSpawnId: (\d+) TotalNeed: (\d+) MembersNum: (\d+) ExpectedSum: (\d+) AliveSum: (\d+)",
            ),
            quota: Self::compile(
                r"配额对齐 UnitSpawnId: (\d+) NeedBeforeQuota: (\d+) QuotaLeft: (\d+) TotalNeed: (\d+)",
            ),
            team: Self::compile(r"SpawnNextTeam 刷第 (\d+) 队 UnitSpawnId: (\d+) TeamLocs: (\d+)"),
            mvp: Self::compile(
                r"CalculateMVP PlayerIndex:\s*(\d+)\s*PlayerName:\s*(.+?)\s*PlayerDamage:\s*(-?[\d.eE+]+)\s*PlayerScore:\s*(-?[\d.eE+]+)",
            ),
            mvp_meta: Self::compile(
                r"CalculateMVP MVPScore:\s*(-?[\d.eE+]+)\s*MVPIndex\s*(\d+)\s*MVPName\s*(\S+)",
            ),
            factor: Self::compile(r"CalculateMVP MVPFactor:\s*(-?[\d.eE+]+)"),
            settle: Self::compile(
                r"DungeonSettlement: OnLoaded.*?IsWin\s*(\w+).*?PlayerTime\s*([\d.]+|nil).*?DungeonId\s*(-?\d+)",
            ),
            settle_new: Self::compile(
                r"OnDungeonFinish, DungeonId is (\d+), IsWin is (\w+), PlayerTime is ([\d.]+|nil), GameTime is ([\d.]+|nil)",
            ),
            enter: Self::compile(r"EnterDungeon callback, Ret is (\d+), DungeonId is (\d+)"),
            enter_guide: Self::compile(r"SystemGuide EnterDungeonEvent DungeonId:\s*(\d+)"),
            init_dungeon: Self::compile(r"InitDungeonComponent 初始化成功！GameModeType: (\w+)"),
            solo_floor: Self::compile(r"SoloRaidComponent:Init FloorId\s+(\d+)\s+Level\s+(\d+)"),
            solo_init: Self::compile(r"SoloRaidComponent:Init!\s+(\d+)"),
            level: Self::compile(r"LevelId : (\w+), LevelPackage : (\S+)"),
            dungeon_map: Self::compile(r"MapLevelName is (\S+)"),
            taskbar: Self::compile(
                r"SendTaskbarDungeonStatus called: id=(\d+), status=(\w+), name=(.*?)\s*$",
            ),
            reward: Self::compile(r"LogTaskbarReward: DispatchJson: (\{.*\})\s*$"),
            reward_rate: Self::compile(r"OnRewardRateUpdate\s+(Bonus|Exp)\s+(-?\d+)"),
            hb_enter: Self::compile(r"OnEnterHardBoss\t(\d+)\t(\d+)"),
            region_now: Self::compile(r"CurrentRegionId is\t(\d+)"),
            vote: Self::compile(r"Vote::: BattleNum = (\d+)"),
            preload: Self::compile(r"预加载副本战斗资源，UnitId：(\d+)\s+加载数量：\s*(\d+)"),
            hit: Self::compile(
                r"打中位置：V\(X=(-?[\d.]+), Y=(-?[\d.]+), Z=(-?[\d.]+)\)(?:.*?Pawn名字：([^,\s]+))?",
            ),
            cmd: Self::compile(r"LogInit: Command Line: (.*)$"),
            diag: Self::compile(
                r"bEnableShippingLog (\w+), bForceEnableShippingLog (\w+), bEffectiveEnableShippingLog (\w+)",
            ),
            reason: Self::compile(
                r"Monster (\S+?)_C_(\d+) PlayDeadAnimation\. DeathReason is (\w+)",
            ),
            set_name_slot: Self::compile(r"WBP_MainBar_C:SetName\s+(\S+)"),
            set_name_actor: Self::compile(r"WBP_MainBar_C:SetName\s+\S+\s+.*?(BP_\w+)\s*$"),
            slot_name: Self::compile(r"WBP_MainBar_C:SetPhantomName NameKey\s+(\S+)"),
            slot_en: Self::compile(r"WBP_MainBar_C:SetPhantomName ContentEN\s+(\S+)"),
            slot_text: Self::compile(r"WBP_MainBar_C:SetPhantomName GetText\s+(.+?)\s*$"),
            eid_init: Self::compile(r"Character Name: (BP_\w+?) Init Success.*?Eid:\s*(\d+)"),
            skill: Self::compile(
                r"ACharacterBase::Start RealUseSkill,Eid:(\d+),SkillI:(\d+),LocalRole:(\d+)",
            ),
            panel_skill: Self::compile(r"RefreshRoleSkillButton\s+\d+\s+(\d+)"),
            finish: Self::compile(
                r"RealOnDungeonFinish\t(\d+)\t(\w+)(?:[\s\S]*?\t([\d.]+)\t([\d.]+))?\s*$",
            ),
            rift: RiftPatterns {
                init: Self::compile(r"RiftComponent:InitRiftBaseInfo 玩法开启"),
                timer: Self::compile(r"RiftComponent:StartRiftMainTimer.*?TotalTime\s+(\d+)"),
                enter: Self::compile(r"RiftComponent:EnterRoom 进入房间 RoomId\s+(\d+)"),
                spawn: Self::compile(
                    r"RiftComponent:ActiveRoomMonsterSpawn.*?RoomId\s+(\d+).*?SpawnId\s+(\d+)",
                ),
                clear: Self::compile(r"RiftComponent:OnRiftRoomReached 房间达标 RoomId\s+(\d+)"),
                total: Self::compile(r"RiftComponent:OnRiftTotalReached"),
                boss_pick: Self::compile(r"RiftComponent:RandomRiftBossUnitId.*?UnitId\s+(\d+)"),
                boss_active: Self::compile(
                    r"RiftComponent:OnStaticCreatorEvent 最终 Boss 静态点已激活.*?Eid\s+(-?\d+).*?UnitId\s+(\d+)",
                ),
                boss_dead: Self::compile(r"RiftComponent:OnRiftFinalBossDead"),
            },
        }
    }
}

fn patterns() -> &'static Patterns {
    static PATTERNS: OnceLock<Patterns> = OnceLock::new();
    PATTERNS.get_or_init(Patterns::new)
}

/* ---------- 解析器 ---------- */

struct LogParser {
    /// 整份日志都没有时间戳时使用的兜底时刻（会话 startedAt）。
    fallback_t: f64,
    last_t: Option<f64>,
    /// 每行时间戳正则的捕获位置复用，避免 200 万行各自分配捕获存储。
    ts_captures: regex::CaptureLocations,
}

impl LogParser {
    fn new(fallback_t: f64) -> Self {
        Self {
            fallback_t,
            last_t: None,
            ts_captures: patterns().ts.capture_locations(),
        }
    }

    fn reset(&mut self) {
        self.last_t = None;
    }

    /// 解析一行日志，返回该行产生的事件（通常 0 或 1 条）。
    fn feed_line(&mut self, line: &str) -> Vec<LogEvent> {
        let mut out = Vec::new();
        let p = patterns();

        let t = match p.ts.captures_read(&mut self.ts_captures, line) {
            Some(_) => match parse_timestamp(line, &self.ts_captures) {
                Some(t) => {
                    self.last_t = Some(t);
                    t
                }
                None => self.last_t.unwrap_or(self.fallback_t),
            },
            None => self.last_t.unwrap_or(self.fallback_t),
        };

        if !p.pre.is_match(line) {
            return out;
        }

        if line.contains("RiftComponent:") {
            if let Some(caps) = p.rift.enter.captures(line) {
                out.push(LogEvent::RiftEnterRoom {
                    t,
                    room_id: int(&caps[1]),
                });
            } else if let Some(caps) = p.rift.spawn.captures(line) {
                out.push(LogEvent::RiftSpawn {
                    t,
                    room_id: int(&caps[1]),
                    spawn_id: int(&caps[2]),
                });
            } else if let Some(caps) = p.rift.clear.captures(line) {
                out.push(LogEvent::RiftClear {
                    t,
                    room_id: int(&caps[1]),
                });
            } else if p.rift.total.is_match(line) {
                out.push(LogEvent::RiftTotal { t });
            } else if let Some(caps) = p.rift.boss_pick.captures(line) {
                out.push(LogEvent::RiftBossPick {
                    t,
                    unit_id: int(&caps[1]),
                });
            } else if let Some(caps) = p.rift.boss_active.captures(line) {
                out.push(LogEvent::RiftBossActive {
                    t,
                    eid: int(&caps[1]),
                    unit_id: int(&caps[2]),
                });
            } else if p.rift.boss_dead.is_match(line) {
                out.push(LogEvent::RiftBossDead { t });
            } else if p.rift.init.is_match(line) {
                out.push(LogEvent::RiftInit { t });
            } else if let Some(caps) = p.rift.timer.captures(line) {
                out.push(LogEvent::RiftTimer {
                    t,
                    total_time: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("Monster::RealOnDead") {
            if let Some(caps) = p.real_dead.captures(line) {
                out.push(LogEvent::RealDead {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    dead_type: caps.get(3).map(|m| int(m.as_str())),
                });
            }
            return out;
        }

        if line.contains("MonsterDeadAnimationEnd") {
            if let Some(caps) = p.death_loc.captures(line) {
                out.push(LogEvent::DeathLoc {
                    t,
                    x: float(&caps[1]),
                    y: float(&caps[2]),
                    z: float(&caps[3]),
                });
                return out;
            }
            if let Some(caps) = p.death.captures(line) {
                out.push(LogEvent::Death {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    eid: int(&caps[3]),
                    create_type: caps[4].to_string(),
                    creator_id: int(&caps[5]),
                });
            } else if let Some(caps) = p.death_lite.captures(line) {
                // 参考解析器的精简兜底行没有 CreateType/CreatorId，用空值占位保住这次击杀
                out.push(LogEvent::Death {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    eid: int(&caps[3]),
                    create_type: String::new(),
                    creator_id: 0,
                });
            }
            return out;
        }

        if line.contains("PlayDeadAnimation") {
            if let Some(caps) = p.dead_detail.captures(line) {
                out.push(LogEvent::DeadDetail {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    eid: int(&caps[3]),
                    create_type: caps[4].to_string(),
                    creator_id: int(&caps[5]),
                });
            }
            if let Some(caps) = p.reason.captures(line) {
                out.push(LogEvent::Reason {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    reason: caps[3].to_string(),
                });
            }
            return out;
        }

        if line.contains("SetPhantomName") {
            if let Some(caps) = p.slot_name.captures(line) {
                out.push(LogEvent::SlotName {
                    t,
                    key: caps[1].to_string(),
                });
            } else if let Some(caps) = p.slot_en.captures(line) {
                out.push(LogEvent::SlotEn {
                    t,
                    code: caps[1].to_string(),
                });
            } else if let Some(caps) = p.slot_text.captures(line) {
                out.push(LogEvent::SlotText {
                    t,
                    text: caps[1].trim().to_string(),
                });
            }
            return out;
        }

        if line.contains("WBP_MainBar_C:SetName") {
            if let Some(caps) = p.set_name_actor.captures(line) {
                let bp = &caps[1];
                // 只把玩家/协战角色记为槽位；BOSS 召唤物也会打印 SetName，忽略以免污染槽位
                if bp.starts_with("BP_PlayerCharacter") || bp.starts_with("BP_PhantomCharacter") {
                    if let Some(slot) = p.set_name_slot.captures(line) {
                        out.push(LogEvent::SlotSet {
                            t,
                            slot: slot[1].to_string(),
                            bp: Some(bp.to_string()),
                        });
                    }
                }
            }
            return out;
        }

        if line.contains("Character Name: BP_") {
            if let Some(caps) = p.eid_init.captures(line) {
                out.push(LogEvent::EidInit {
                    t,
                    bp: caps[1].to_string(),
                    eid: int(&caps[2]),
                });
            }
            return out;
        }

        if line.contains("RefreshRoleSkillButton") {
            if let Some(caps) = p.panel_skill.captures(line) {
                out.push(LogEvent::PanelSkill {
                    t,
                    skill_id: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("ACharacterBase::Start RealUseSkill") {
            if let Some(caps) = p.skill.captures(line) {
                // 只认起手：参考正则同时命中 Finish/RealStopSkill，会把每次施放放大 3 倍
                out.push(LogEvent::Skill {
                    t,
                    eid: int(&caps[1]),
                    skill_id: int(&caps[2]),
                    local_role: int(&caps[3]),
                    phase: Some("start".to_string()),
                    action: Some("use".to_string()),
                });
            }
            return out;
        }

        if line.contains("CreateUnitSuccess") {
            if let Some(caps) = p.unit_create.captures(line) {
                out.push(LogEvent::UnitCreate {
                    t,
                    eid: int(&caps[1]),
                    unit_id: int(&caps[2]),
                    unit_type: caps[3].to_string(),
                    x: float(&caps[4]),
                    y: float(&caps[5]),
                    z: float(&caps[6]),
                });
            }
            return out;
        }

        if line.contains("CreateAIUnit Type Monster") {
            if let Some(caps) = p.ai_create.captures(line) {
                out.push(LogEvent::AiCreate {
                    t,
                    unit_id: int(&caps[1]),
                    eid: int(&caps[2]),
                });
            }
            return out;
        }

        if line.contains("CurrentModelId is") {
            if let Some(caps) = p.spawn.captures(line) {
                out.push(LogEvent::Spawn {
                    t,
                    bp: caps[1].to_string(),
                    obj_id: int(&caps[2]),
                    model_id: int(&caps[3]),
                });
            }
            return out;
        }

        if line.contains("EMMonsterSpawn") {
            if let Some(caps) = p.alive.captures(line) {
                out.push(LogEvent::Alive {
                    t,
                    unit_spawn_id: int(&caps[1]),
                    total_need: int(&caps[2]),
                    members_num: int(&caps[3]),
                    expected_sum: int(&caps[4]),
                    alive_sum: int(&caps[5]),
                });
                return out;
            }
            if let Some(caps) = p.quota.captures(line) {
                out.push(LogEvent::Quota {
                    t,
                    unit_spawn_id: int(&caps[1]),
                    need_before: int(&caps[2]),
                    quota_left: int(&caps[3]),
                    total_need: int(&caps[4]),
                });
                return out;
            }
            if let Some(caps) = p.team.captures(line) {
                out.push(LogEvent::Team {
                    t,
                    index: int(&caps[1]),
                    unit_spawn_id: int(&caps[2]),
                    team_locs: int(&caps[3]),
                });
            }
            return out;
        }

        if line.contains("CalculateMVP") {
            if let Some(caps) = p.mvp.captures(line) {
                out.push(LogEvent::Mvp {
                    t,
                    index: int(&caps[1]),
                    name: caps[2].trim().to_string(),
                    damage: float(&caps[3]),
                    score: float(&caps[4]),
                });
                return out;
            }
            if let Some(caps) = p.mvp_meta.captures(line) {
                out.push(LogEvent::MvpMeta {
                    t,
                    score: float(&caps[1]),
                    index: int(&caps[2]),
                    name: caps[3].to_string(),
                });
                return out;
            }
            if let Some(caps) = p.factor.captures(line) {
                out.push(LogEvent::Factor {
                    t,
                    value: float(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("RealOnDungeonFinish") {
            if let Some(caps) = p.finish.captures(line) {
                out.push(LogEvent::Finish {
                    t,
                    dungeon_id: int(&caps[1]),
                    ok: &caps[2] == "true",
                    player_time: caps.get(3).map(|m| float(m.as_str())),
                    game_time: caps.get(4).map(|m| float(m.as_str())),
                });
            }
            return out;
        }

        if line.contains("OnDungeonFinish, DungeonId is") {
            if let Some(caps) = p.settle_new.captures(line) {
                out.push(LogEvent::Settle {
                    t,
                    win: &caps[2] == "true",
                    player_time: caps.get(3).and_then(parse_time),
                    game_time: caps.get(4).and_then(parse_time),
                    dungeon_id: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("DungeonSettlement: OnLoaded") {
            if let Some(caps) = p.settle.captures(line) {
                out.push(LogEvent::Settle {
                    t,
                    win: &caps[1] == "true",
                    player_time: caps.get(2).and_then(parse_time),
                    game_time: None,
                    dungeon_id: int(&caps[3]),
                });
            }
            return out;
        }

        if line.contains("EnterDungeon callback") {
            if let Some(caps) = p.enter.captures(line) {
                out.push(LogEvent::DunEnter {
                    t,
                    dungeon_id: int(&caps[2]),
                });
            }
            return out;
        }

        if line.contains("SystemGuide EnterDungeonEvent") {
            if let Some(caps) = p.enter_guide.captures(line) {
                out.push(LogEvent::EnterGuide {
                    t,
                    dungeon_id: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("InitDungeonComponent") {
            if let Some(caps) = p.init_dungeon.captures(line) {
                out.push(LogEvent::DunInit {
                    t,
                    mode: caps[1].to_string(),
                });
            }
            return out;
        }

        if line.contains("SoloRaidComponent:Init") {
            if let Some(caps) = p.solo_floor.captures(line) {
                out.push(LogEvent::SoloFloor {
                    t,
                    floor_id: int(&caps[1]),
                    level: int(&caps[2]),
                });
            }
            if let Some(caps) = p.solo_init.captures(line) {
                out.push(LogEvent::SoloInit {
                    t,
                    dungeon_id: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("LogTaskbarReward: DispatchJson:") && line.contains("\"type\":\"reward\"")
        {
            if let Some(caps) = p.reward.captures(line) {
                out.push(LogEvent::Reward {
                    t,
                    json: caps[1].to_string(),
                });
            }
            return out;
        }

        if line.contains("OnRewardRateUpdate") {
            if let Some(caps) = p.reward_rate.captures(line) {
                out.push(LogEvent::RewardRate {
                    t,
                    kind: if &caps[1] == "Bonus" { "bonus" } else { "exp" }.to_string(),
                    value: int(&caps[2]),
                });
            }
            return out;
        }

        if line.contains("SendTaskbarDungeonStatus") {
            if let Some(caps) = p.taskbar.captures(line) {
                out.push(LogEvent::Taskbar {
                    t,
                    id: int(&caps[1]),
                    status: caps[2].to_string(),
                    name: caps[3].trim().to_string(),
                });
            }
            return out;
        }

        if let Some(caps) = p.hb_enter.captures(line) {
            out.push(LogEvent::HbEnter {
                t,
                boss_id: int(&caps[1]),
                diff: int(&caps[2]),
            });
            return out;
        }

        if let Some(caps) = p.region_now.captures(line) {
            out.push(LogEvent::Region {
                t,
                region_id: int(&caps[1]),
            });
            return out;
        }

        if let Some(caps) = p.dungeon_map.captures(line) {
            let name = caps[1].rsplit('/').next().unwrap_or(&caps[1]).to_string();
            out.push(LogEvent::Map { t, name });
            return out;
        }

        if line.contains("LevelId :") {
            if let Some(caps) = p.level.captures(line) {
                // 保留原始 levelId；归一化只在前端显示/匹配时做，不能当作权威地图 ID
                out.push(LogEvent::Level {
                    t,
                    level_id: caps[1].to_string(),
                    package: caps[2].to_string(),
                });
            }
            return out;
        }

        if line.contains("BattleNum =") {
            if let Some(caps) = p.vote.captures(line) {
                out.push(LogEvent::Vote {
                    t,
                    battle_num: int(&caps[1]),
                });
            }
            return out;
        }

        if line.contains("预加载副本战斗资源") {
            if let Some(caps) = p.preload.captures(line) {
                out.push(LogEvent::Preload {
                    t,
                    unit_id: int(&caps[1]),
                    count: int(&caps[2]),
                });
            }
            return out;
        }

        if line.contains("打中位置") {
            if let Some(caps) = p.hit.captures(line) {
                out.push(LogEvent::Hit {
                    t,
                    x: float(&caps[1]),
                    y: float(&caps[2]),
                    z: float(&caps[3]),
                    pawn: caps.get(4).map(|m| m.as_str().to_string()),
                });
            }
            return out;
        }

        if line.contains("LogInit: Command Line") {
            if let Some(caps) = p.cmd.captures(line) {
                out.push(LogEvent::Cmd {
                    t,
                    line: caps[1].trim().to_string(),
                });
            }
            return out;
        }

        if line.contains("bEnableShippingLog") {
            if let Some(caps) = p.diag.captures(line) {
                out.push(LogEvent::Diag {
                    t,
                    enable: &caps[1] == "True",
                    force: &caps[2] == "True",
                    effective: &caps[3] == "True",
                });
            }
        }

        out
    }
}

fn int(value: &str) -> i64 {
    value.parse().unwrap_or_default()
}

fn float(value: &str) -> f64 {
    value.parse().unwrap_or_default()
}

fn parse_time(value: regex::Match<'_>) -> Option<f64> {
    if value.as_str() == "nil" {
        None
    } else {
        value.as_str().parse::<f64>().ok()
    }
}

/// 日志行时间戳是 UTC，直接解析为 Unix 秒，不做时区换算。
fn parse_timestamp(line: &str, caps: &regex::CaptureLocations) -> Option<f64> {
    let part = |index| {
        let (start, end) = caps.get(index)?;
        line.get(start..end)?.parse::<i64>().ok()
    };
    let year = part(1)?;
    let month = part(2)?;
    let day = part(3)?;
    let hour = part(4)?;
    let minute = part(5)?;
    let second = part(6)?;
    let millis = part(7)?;
    let days = days_from_civil(year, month, day);
    Some(
        days as f64 * 86_400.0
            + hour as f64 * 3_600.0
            + minute as f64 * 60.0
            + second as f64
            + millis as f64 / 1_000.0,
    )
}

/// Howard Hinnant 的 civil-from-days 逆向算法（1970-01-01 起的天数）。
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - i64::from(month <= 2);
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/* ---------- 完整行缓冲 ---------- */

/// 只产出以 `\n` 结尾的完整行；首行去 BOM、行尾去 CR，超长行（>1MB）整行丢弃。
struct LineBuffer {
    buf: Vec<u8>,
    discarding: bool,
    first: bool,
}

impl LineBuffer {
    fn new() -> Self {
        Self {
            buf: Vec::new(),
            discarding: false,
            first: true,
        }
    }

    fn reset(&mut self) {
        self.buf.clear();
        self.discarding = false;
        self.first = true;
    }

    /// 追加字节并收集完整行的字节区间（相对当前 buf，CR/BOM 已处理）。
    /// 返回（本次结束的行数，可压缩的字节数）；调用方消费完区间后再 compact。
    fn push(&mut self, bytes: &[u8], out: &mut Vec<Range<usize>>) -> (usize, usize) {
        self.buf.extend_from_slice(bytes);
        let mut index = 0usize;
        let mut completed = 0usize;
        while index < self.buf.len() {
            if self.discarding {
                if let Some(offset) = self.buf[index..].iter().position(|b| *b == b'\n') {
                    index += offset + 1;
                    self.discarding = false;
                } else {
                    index = self.buf.len();
                }
                continue;
            }
            let Some(offset) = self.buf[index..].iter().position(|b| *b == b'\n') else {
                if self.buf.len() - index > MAX_LINE_BYTES {
                    self.discarding = true;
                    self.first = false;
                    completed += 1;
                    index = self.buf.len();
                }
                break;
            };
            let end = index + offset;
            let mut line_end = end;
            if line_end > index && self.buf[line_end - 1] == b'\r' {
                line_end -= 1;
            }
            let mut line_start = index;
            index = end + 1;
            completed += 1;
            if line_end - line_start > MAX_LINE_BYTES {
                self.first = false;
                continue;
            }
            if self.first {
                self.first = false;
                if self.buf[line_start..line_end].starts_with(&[0xEF, 0xBB, 0xBF]) {
                    line_start += 3;
                }
            }
            out.push(line_start..line_end);
        }
        (completed, index)
    }

    /// 把区间解码为文本；合法 UTF-8 保持借用，仅非法字节生成修复文本。
    fn text(&self, range: Range<usize>) -> Cow<'_, str> {
        String::from_utf8_lossy(&self.buf[range])
    }

    /// 丢弃已处理的前缀，保留跨块半行。
    fn compact(&mut self, consumed: usize) {
        if consumed > 0 {
            self.buf.drain(..consumed);
        }
    }
}

/* ---------- 会话与线程 ---------- */

struct SharedRun {
    stop: AtomicBool,
    status: Mutex<LogAnalysisStatus>,
}

struct RunHandle {
    shared: Arc<SharedRun>,
    handle: Option<JoinHandle<()>>,
}

/// 由 `lib.rs` 通过 `app.manage` 注入，跨命令共享当前监听会话。
#[derive(Default)]
pub struct LogAnalysisState {
    inner: Mutex<Option<RunHandle>>,
}

/// 启动日志监听：先停旧会话，再开独立线程从指定位置 tail。
#[tauri::command]
pub async fn log_analysis_start(
    app: AppHandle,
    state: tauri::State<'_, LogAnalysisState>,
    path: String,
    from_start: bool,
) -> Result<LogAnalysisStartInfo, String> {
    let metadata = fs::metadata(&path).map_err(|_| format!("日志文件不存在: {path}"))?;
    if !metadata.is_file() {
        return Err(format!("日志文件不存在: {path}"));
    }

    let file_size = metadata.len();
    let started_at = now_unix_seconds();
    let start_pos = if from_start { 0 } else { file_size };
    let fallback_t = fallback_timestamp(from_start, started_at);

    let previous = state
        .inner
        .lock()
        .map_err(|_| "日志分析状态锁已损坏".to_string())?
        .take();
    if let Some(run) = previous {
        stop_run(run);
    }

    let shared = Arc::new(SharedRun {
        stop: AtomicBool::new(false),
        status: Mutex::new(LogAnalysisStatus {
            running: true,
            path: Some(path.clone()),
            bytes_read: start_pos,
            lines_read: 0,
            file_size,
            started_at: Some(started_at),
            error: None,
        }),
    });
    let thread_shared = shared.clone();
    let thread_app = app.clone();
    let thread_path = path.clone();
    let handle = thread::Builder::new()
        .name("log-analysis-tail".to_string())
        .spawn(move || {
            run_tail(
                thread_app,
                thread_path,
                start_pos,
                fallback_t,
                thread_shared,
            )
        })
        .map_err(|err| format!("启动日志分析线程失败: {err}"))?;

    *state
        .inner
        .lock()
        .map_err(|_| "日志分析状态锁已损坏".to_string())? = Some(RunHandle {
        shared,
        handle: Some(handle),
    });

    let _ = app.emit(
        EVENT_LIFECYCLE,
        LifecyclePayload {
            state: "started",
            path: Some(path.clone()),
            reason: None,
            message: None,
        },
    );

    Ok(LogAnalysisStartInfo {
        path,
        file_size,
        from_start,
        started_at,
    })
}

/// 停止当前监听会话；线程在收到停止信号后会先 flush 尾包再退出。
#[tauri::command]
pub fn log_analysis_stop(state: tauri::State<'_, LogAnalysisState>) -> Result<(), String> {
    let run = state
        .inner
        .lock()
        .map_err(|_| "日志分析状态锁已损坏".to_string())?
        .take();
    if let Some(run) = run {
        stop_run(run);
    }
    Ok(())
}

/// 读取当前监听状态（页面刷新后恢复运行态）。
#[tauri::command]
pub fn log_analysis_status(state: tauri::State<'_, LogAnalysisState>) -> LogAnalysisStatus {
    state
        .inner
        .lock()
        .ok()
        .and_then(|inner| inner.as_ref().map(|run| run.shared.clone()))
        .and_then(|shared| shared.status.lock().ok().map(|status| status.clone()))
        .unwrap_or_else(LogAnalysisStatus::idle)
}

fn stop_run(run: RunHandle) {
    run.shared.stop.store(true, Ordering::SeqCst);
    if let Some(handle) = run.handle {
        let deadline = Instant::now() + STOP_WAIT;
        while !handle.is_finished() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(2));
        }
    }
}

fn now_unix_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or_default()
}

/// 无时间戳行的兜底时刻：从头回放必须用 0，不能用当前时刻。
/// 日志首行早于开始监听时刻，用当前时刻会把历史事件当成「未来」，
/// 触发前端逐条时间倒退修正并放大偏移，最终撑爆逐秒数组。
fn fallback_timestamp(from_start: bool, started_at: f64) -> f64 {
    if from_start { 0.0 } else { started_at }
}

fn run_tail(app: AppHandle, path: String, start_pos: u64, fallback_t: f64, shared: Arc<SharedRun>) {
    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(err) => {
            report_fatal(&app, &shared, &path, format!("无法打开日志文件: {err}"));
            return;
        }
    };
    // 文件游标必须与逻辑偏移对齐：from_start=false 时跳过已有内容，否则新数据会从旧位置重复读取
    if let Err(err) = file.seek(SeekFrom::Start(start_pos)) {
        report_fatal(&app, &shared, &path, format!("无法定位日志文件: {err}"));
        return;
    }
    let metadata = match file.metadata() {
        Ok(metadata) => metadata,
        Err(err) => {
            report_fatal(&app, &shared, &path, format!("无法读取日志文件信息: {err}"));
            return;
        }
    };
    let mut session = TailSession {
        app,
        path,
        shared,
        file,
        file_id: file_identity(&metadata),
        file_size: metadata.len(),
        pos: start_pos,
        parser: LogParser::new(fallback_t),
        lines: LineBuffer::new(),
        lines_read: 0,
        seq: 1,
        events: Vec::new(),
        last_flush: Instant::now(),
        last_status: Instant::now(),
        missing_since: None,
        finished: false,
    };
    session.sync_status();

    while !session.shared.stop.load(Ordering::Relaxed) {
        session.tick();
        if session.finished {
            break;
        }
        sleep_interruptible(&session.shared, POLL_INTERVAL);
    }
    if !session.finished {
        session.finalize();
    }
}

fn report_fatal(app: &AppHandle, shared: &SharedRun, path: &str, message: String) {
    if let Ok(mut status) = shared.status.lock() {
        status.running = false;
        status.error = Some(message.clone());
    }
    let _ = app.emit(
        EVENT_LIFECYCLE,
        LifecyclePayload {
            state: "error",
            path: Some(path.to_string()),
            reason: None,
            message: Some(message),
        },
    );
}

fn sleep_interruptible(shared: &SharedRun, total: Duration) {
    let step = Duration::from_millis(20);
    let started = Instant::now();
    while !shared.stop.load(Ordering::Relaxed) {
        let elapsed = started.elapsed();
        if elapsed >= total {
            break;
        }
        thread::sleep(step.min(total - elapsed));
    }
}

struct TailSession {
    app: AppHandle,
    path: String,
    shared: Arc<SharedRun>,
    file: File,
    file_id: Option<(u64, u64)>,
    file_size: u64,
    pos: u64,
    parser: LogParser,
    lines: LineBuffer,
    lines_read: u64,
    seq: u64,
    events: Vec<LogEvent>,
    last_flush: Instant,
    last_status: Instant,
    missing_since: Option<Instant>,
    finished: bool,
}

impl TailSession {
    fn tick(&mut self) {
        let metadata = match fs::metadata(&self.path) {
            Ok(metadata) => metadata,
            Err(err) => {
                let since = *self.missing_since.get_or_insert_with(Instant::now);
                if since.elapsed() >= MISSING_TOLERANCE {
                    self.fail(format!("日志文件不可访问: {err}"));
                }
                return;
            }
        };
        self.missing_since = None;
        let len = metadata.len();
        let identity = file_identity(&metadata);
        let replaced = matches!(
            (&self.file_id, &identity),
            (Some(previous), Some(current)) if previous != current
        );
        if replaced || len < self.pos {
            let reason = if replaced { "replaced" } else { "truncated" };
            if !self.reset_tracking(reason, len, identity) {
                return;
            }
        } else {
            self.file_size = len;
        }
        if self.file_size > self.pos {
            self.read_available(self.file_size);
        }
        if !self.finished {
            self.maybe_flush();
            self.maybe_status();
        }
    }

    fn reset_tracking(&mut self, reason: &str, len: u64, identity: Option<(u64, u64)>) -> bool {
        let mut file = match File::open(&self.path) {
            Ok(file) => file,
            Err(_) => {
                self.missing_since.get_or_insert_with(Instant::now);
                return false;
            }
        };
        if file.seek(SeekFrom::Start(0)).is_err() {
            self.missing_since.get_or_insert_with(Instant::now);
            return false;
        }
        self.file = file;
        self.file_id = identity;
        self.file_size = len;
        self.pos = 0;
        self.lines_read = 0;
        self.parser.reset();
        self.lines.reset();
        self.sync_status();
        self.emit_lifecycle("reset", Some(reason), None);
        true
    }

    fn read_available(&mut self, limit: u64) {
        let mut chunk = vec![0u8; READ_CHUNK_BYTES];
        let mut ranges = Vec::new();
        let mut remaining = limit.saturating_sub(self.pos);
        while remaining > 0 && !self.shared.stop.load(Ordering::Relaxed) {
            let want = remaining.min(chunk.len() as u64) as usize;
            match self.file.read(&mut chunk[..want]) {
                Ok(0) => break,
                Ok(read) => {
                    self.pos += read as u64;
                    remaining = remaining.saturating_sub(read as u64);
                    ranges.clear();
                    let (completed, consumed) = self.lines.push(&chunk[..read], &mut ranges);
                    self.lines_read += completed as u64;
                    for range in ranges.drain(..) {
                        // text 借用 line buffer；解析结果已拥有字段，块结束后即可安全 flush
                        let line_events = {
                            let text = self.lines.text(range);
                            self.parser.feed_line(text.as_ref())
                        };
                        for event in line_events {
                            self.events.push(event);
                            if self.events.len() >= MAX_BATCH_EVENTS {
                                self.flush();
                            }
                        }
                    }
                    self.lines.compact(consumed);
                    self.sync_status();
                }
                Err(err) if err.kind() == ErrorKind::Interrupted => continue,
                Err(err) => {
                    self.fail(format!("读取日志文件失败: {err}"));
                    break;
                }
            }
        }
    }

    fn flush(&mut self) {
        if self.events.is_empty() {
            self.last_flush = Instant::now();
            return;
        }
        let batch = LogBatch {
            seq: self.seq,
            events: mem::take(&mut self.events),
            bytes_read: self.pos,
            lines_read: self.lines_read,
            file_size: self.file_size,
            eof: self.pos >= self.file_size,
        };
        self.seq += 1;
        self.last_flush = Instant::now();
        self.sync_status();
        let _ = self.app.emit(EVENT_BATCH, batch);
    }

    fn maybe_flush(&mut self) {
        if !self.events.is_empty() && self.last_flush.elapsed() >= FLUSH_INTERVAL {
            self.flush();
        }
    }

    fn maybe_status(&mut self) {
        if self.last_status.elapsed() < STATUS_INTERVAL {
            return;
        }
        self.last_status = Instant::now();
        self.sync_status();
        let payload = self
            .shared
            .status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| LogAnalysisStatus::idle());
        let _ = self.app.emit(EVENT_STATUS, payload);
    }

    fn sync_status(&self) {
        if let Ok(mut status) = self.shared.status.lock() {
            status.running = !self.finished && !self.shared.stop.load(Ordering::Relaxed);
            status.bytes_read = self.pos;
            status.lines_read = self.lines_read;
            status.file_size = self.file_size;
        }
    }

    fn emit_lifecycle(&self, state: &'static str, reason: Option<&str>, message: Option<&str>) {
        let _ = self.app.emit(
            EVENT_LIFECYCLE,
            LifecyclePayload {
                state,
                path: Some(self.path.clone()),
                reason: reason.map(str::to_string),
                message: message.map(str::to_string),
            },
        );
    }

    fn finalize(&mut self) {
        self.flush();
        if let Ok(mut status) = self.shared.status.lock() {
            status.running = false;
        }
        self.emit_lifecycle("stopped", None, None);
    }

    fn fail(&mut self, message: String) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.flush();
        if let Ok(mut status) = self.shared.status.lock() {
            status.running = false;
            status.error = Some(message.clone());
        }
        self.emit_lifecycle("error", None, Some(&message));
    }
}

#[cfg(windows)]
fn file_identity(metadata: &fs::Metadata) -> Option<(u64, u64)> {
    use std::os::windows::fs::MetadataExt;
    // 卷序列号 / 文件索引的 std 接口仍不稳定，用「创建时间」判断文件是否被重建；
    // 单纯追加写入不会改变创建时间，日志轮转生成的新文件会。
    Some((metadata.creation_time(), 0))
}

#[cfg(unix)]
fn file_identity(metadata: &fs::Metadata) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    Some((metadata.dev(), metadata.ino()))
}

#[cfg(not(any(windows, unix)))]
fn file_identity(_metadata: &fs::Metadata) -> Option<(u64, u64)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const TS: &str = "[2026.11.21-09.48.38:832][171]";

    fn line(body: &str) -> String {
        format!("{TS}{body}")
    }

    fn event(parser: &mut LogParser, source: &str) -> LogEvent {
        let mut events = parser.feed_line(source);
        assert_eq!(events.len(), 1, "应产出 1 条事件: {source}");
        events.remove(0)
    }

    fn no_event(parser: &mut LogParser, source: &str) {
        let events = parser.feed_line(source);
        assert!(events.is_empty(), "不应产出事件: {source} -> {events:?}");
    }

    fn t_of(event: &LogEvent) -> f64 {
        match event {
            LogEvent::Cmd { t, .. }
            | LogEvent::Diag { t, .. }
            | LogEvent::DunEnter { t, .. }
            | LogEvent::EnterGuide { t, .. }
            | LogEvent::DunInit { t, .. }
            | LogEvent::SoloFloor { t, .. }
            | LogEvent::SoloInit { t, .. }
            | LogEvent::Level { t, .. }
            | LogEvent::Map { t, .. }
            | LogEvent::Taskbar { t, .. }
            | LogEvent::HbEnter { t, .. }
            | LogEvent::Region { t, .. }
            | LogEvent::Vote { t, .. }
            | LogEvent::Preload { t, .. }
            | LogEvent::UnitCreate { t, .. }
            | LogEvent::AiCreate { t, .. }
            | LogEvent::Spawn { t, .. }
            | LogEvent::Death { t, .. }
            | LogEvent::DeathLoc { t, .. }
            | LogEvent::RealDead { t, .. }
            | LogEvent::DeadDetail { t, .. }
            | LogEvent::Reason { t, .. }
            | LogEvent::Alive { t, .. }
            | LogEvent::Quota { t, .. }
            | LogEvent::Team { t, .. }
            | LogEvent::Mvp { t, .. }
            | LogEvent::MvpMeta { t, .. }
            | LogEvent::Factor { t, .. }
            | LogEvent::Settle { t, .. }
            | LogEvent::Finish { t, .. }
            | LogEvent::Reward { t, .. }
            | LogEvent::RewardRate { t, .. }
            | LogEvent::Hit { t, .. }
            | LogEvent::EidInit { t, .. }
            | LogEvent::Skill { t, .. }
            | LogEvent::PanelSkill { t, .. }
            | LogEvent::SlotSet { t, .. }
            | LogEvent::SlotName { t, .. }
            | LogEvent::SlotEn { t, .. }
            | LogEvent::SlotText { t, .. }
            | LogEvent::RiftInit { t }
            | LogEvent::RiftTimer { t, .. }
            | LogEvent::RiftEnterRoom { t, .. }
            | LogEvent::RiftSpawn { t, .. }
            | LogEvent::RiftClear { t, .. }
            | LogEvent::RiftTotal { t }
            | LogEvent::RiftBossPick { t, .. }
            | LogEvent::RiftBossActive { t, .. }
            | LogEvent::RiftBossDead { t } => *t,
        }
    }

    #[test]
    fn timestamp_uses_utc_encoded_unix_seconds() {
        let mut parser = LogParser::new(0.0);
        let event = event(
            &mut parser,
            "[2024.01.01-00.00.00:000]LogTemp: CreateUnitSuccess  Eid: 1  UnitId: 2  UnitType: Monster  Loc: 1.0 2.0 3.0",
        );
        assert!((t_of(&event) - 1_704_067_200.0).abs() < 1e-6);
    }

    #[test]
    fn timestamp_crosses_midnight_monotonically() {
        let mut parser = LogParser::new(0.0);
        let first = event(
            &mut parser,
            "[2026.11.21-23.59.59:999]LogMonster: Monster BP_Mon_Gr_Piaofu_C_1 CurrentModelId is 420101 BirthTime is -1.0",
        );
        let second = event(
            &mut parser,
            "[2026.11.22-00.00.00:001]LogMonster: Monster BP_Mon_Gr_Piaofu_C_2 CurrentModelId is 420101 BirthTime is -1.0",
        );
        assert!(t_of(&second) > t_of(&first));
        assert!((t_of(&second) - t_of(&first) - 0.002).abs() < 1e-6);
    }

    #[test]
    fn failed_timestamp_capture_does_not_reuse_stale_groups() {
        let mut parser = LogParser::new(1234.5);
        parser.feed_line("[2024.01.01-00.00.00:000]LogTemp: noise");
        // 全角数字与非法月份都不应命中；复用 CaptureLocations 不能留下上一行的捕获位置
        parser.feed_line("[２０２４.０１.０１-００.００.００:０００]LogTemp: noise");
        parser.feed_line("[2024.01.XX-00.00.00:000]LogTemp: noise");
        let inherited = parser.feed_line("LogInit: Command Line: fixture");
        assert!(matches!(inherited.as_slice(), [LogEvent::Cmd { t, .. }] if *t == 1_704_067_200.0));
        let next = parser.feed_line("[2024.01.02-00.00.00:001]LogInit: Command Line: fixture");
        assert!(
            matches!(next.as_slice(), [LogEvent::Cmd { t, .. }] if (*t - 1_704_153_600.001).abs() < 1e-6)
        );
    }

    #[test]
    fn reset_clears_time_state_without_stale_capture_inheritance() {
        let mut parser = LogParser::new(1234.5);
        parser.feed_line("[2024.01.01-00.00.00:000]LogTemp: noise");
        parser.reset();
        let out = parser.feed_line("LogInit: Command Line: fixture");
        assert!(matches!(out.as_slice(), [LogEvent::Cmd { t, .. }] if *t == 1234.5));
    }

    #[test]
    fn untimestamped_lines_inherit_previous_timestamp() {
        let mut parser = LogParser::new(500.0);
        let first = event(
            &mut parser,
            &line(
                "LogTemp: CreateUnitSuccess  Eid: 8  UnitId: 90001  UnitType: Mechanism  Loc: 1.0 2.0 3.0",
            ),
        );
        let second = event(
            &mut parser,
            "LogTemp: CreateUnitSuccess  Eid: 9  UnitId: 90002  UnitType: Mechanism  Loc: 4.0 5.0 6.0",
        );
        assert_eq!(t_of(&first), t_of(&second));

        let mut fresh = LogParser::new(1234.5);
        let fallback = event(
            &mut fresh,
            "LogInit: Command Line:  -EnableShippingLog -LogTimes -LogFiles",
        );
        assert_eq!(t_of(&fallback), 1234.5);
    }

    #[test]
    fn parses_death_family() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line(
                "LogMonster: MonsterDeadAnimationEnd. Monster BP_Boss_Kuxiu_C_2147463516 Eid 2 CreateType is StaticCreator CreatorId is 1001.",
            ),
        ) {
            LogEvent::Death {
                bp,
                obj_id,
                eid,
                create_type,
                creator_id,
                ..
            } => {
                assert_eq!(bp, "BP_Boss_Kuxiu");
                assert_eq!(obj_id, 2147463516);
                assert_eq!(eid, 2);
                assert_eq!(create_type, "StaticCreator");
                assert_eq!(creator_id, 1001);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: MonsterDeadAnimationEnd. Monster BP_Baiheng_Summoned_C_2147456332 Eid 33 CreateType is  CreatorId is 0.",
            ),
        ) {
            LogEvent::Death {
                bp,
                obj_id,
                eid,
                create_type,
                creator_id,
                ..
            } => {
                assert_eq!(bp, "BP_Baiheng_Summoned");
                assert_eq!(obj_id, 2147456332);
                assert_eq!(eid, 33);
                assert_eq!(create_type, "");
                assert_eq!(creator_id, 0);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: MonsterDeadAnimationEnd. DamageCauserLocation=X=757.832 Y=-1497.145 Z=-972.948 DeadForce=0.000000",
            ),
        ) {
            LogEvent::DeathLoc { x, y, z, .. } => {
                assert!((x - 757.832).abs() < 1e-6);
                assert!((y + 1497.145).abs() < 1e-6);
                assert!((z + 972.948).abs() < 1e-6);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogMonster: Display: Monster::RealOnDead BP_Boss_Kuxiu_C_2147463516, 2"),
        ) {
            LogEvent::RealDead {
                bp,
                obj_id,
                dead_type,
                ..
            } => {
                assert_eq!(bp, "BP_Boss_Kuxiu");
                assert_eq!(obj_id, 2147463516);
                assert_eq!(dead_type, Some(2));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: PlayDeadAnimation. Monster BP_Baiheng_Summoned_C_2147456332 Eid 33 CreateType is  CreatorId is 0.bDeadHitDisable=False",
            ),
        ) {
            LogEvent::DeadDetail {
                bp,
                eid,
                create_type,
                creator_id,
                ..
            } => {
                assert_eq!(bp, "BP_Baiheng_Summoned");
                assert_eq!(eid, 33);
                assert_eq!(create_type, "");
                assert_eq!(creator_id, 0);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: PlayDeadAnimation. Monster BP_Boss_Kuxiu_C_2147463516 Eid 2 CreateType is StaticCreator CreatorId is 1001.bDeadHitDisable=False",
            ),
        ) {
            LogEvent::DeadDetail {
                bp,
                obj_id,
                eid,
                create_type,
                creator_id,
                ..
            } => {
                assert_eq!(bp, "BP_Boss_Kuxiu");
                assert_eq!(obj_id, 2147463516);
                assert_eq!(eid, 2);
                assert_eq!(create_type, "StaticCreator");
                assert_eq!(creator_id, 1001);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: Monster BP_Boss_Kuxiu_C_2147463516 PlayDeadAnimation. DeathReason is Damage.",
            ),
        ) {
            LogEvent::Reason {
                bp, obj_id, reason, ..
            } => {
                assert_eq!(bp, "BP_Boss_Kuxiu");
                assert_eq!(obj_id, 2147463516);
                assert_eq!(reason, "Damage");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_spawn_pipeline() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line(
                "LogTemp: CreateUnitSuccess  Eid: 2  UnitId: 8513605  UnitType: Monster  Loc: -660.000000 -670.000000 -915.000000",
            ),
        ) {
            LogEvent::UnitCreate {
                eid,
                unit_id,
                unit_type,
                x,
                y,
                z,
                ..
            } => {
                assert_eq!(eid, 2);
                assert_eq!(unit_id, 8513605);
                assert_eq!(unit_type, "Monster");
                assert!((x + 660.0).abs() < 1e-6);
                assert!((y + 670.0).abs() < 1e-6);
                assert!((z + 915.0).abs() < 1e-6);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogTemp: CreateAIUnit Type Monster, UnitId 8513605, Eid 2"),
        ) {
            LogEvent::AiCreate { unit_id, eid, .. } => {
                assert_eq!((unit_id, eid), (8513605, 2));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogMonster: Monster BP_Yuming_Summoned_C_2147453933 CurrentModelId is 420101 BirthTime is -1.000000 NeedPlayBirthMontage.",
            ),
        ) {
            LogEvent::Spawn {
                bp,
                obj_id,
                model_id,
                ..
            } => {
                assert_eq!(bp, "BP_Yuming_Summoned");
                assert_eq!(obj_id, 2147453933);
                assert_eq!(model_id, 420101);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogEMMonsterSpawn: CalcTeamNeedSpawnMonsterInfos UnitSpawnId: 7 TotalNeed: 10 MembersNum: 3 ExpectedSum: 30 AliveSum: 12",
            ),
        ) {
            LogEvent::Alive {
                unit_spawn_id,
                total_need,
                members_num,
                expected_sum,
                alive_sum,
                ..
            } => {
                assert_eq!(
                    (
                        unit_spawn_id,
                        total_need,
                        members_num,
                        expected_sum,
                        alive_sum
                    ),
                    (7, 10, 3, 30, 12)
                );
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogEMMonsterSpawn: 配额对齐 UnitSpawnId: 7 NeedBeforeQuota: 4 QuotaLeft: 2 TotalNeed: 10",
            ),
        ) {
            LogEvent::Quota {
                unit_spawn_id,
                need_before,
                quota_left,
                total_need,
                ..
            } => {
                assert_eq!(
                    (unit_spawn_id, need_before, quota_left, total_need),
                    (7, 4, 2, 10)
                );
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogEMMonsterSpawn: SpawnNextTeam 刷第 2 队 UnitSpawnId: 7 TeamLocs: 5"),
        ) {
            LogEvent::Team {
                index,
                unit_spawn_id,
                team_locs,
                ..
            } => {
                assert_eq!((index, unit_spawn_id, team_locs), (2, 7, 5));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_mvp_settle_and_finish() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tCalculateMVP PlayerIndex: \t1\tPlayerName: \t维塔\tPlayerDamage: \t83282001920.0\tPlayerScore: \t2.8485642192121",
            ),
        ) {
            LogEvent::Mvp {
                index,
                name,
                damage,
                score,
                ..
            } => {
                assert_eq!(index, 1);
                assert_eq!(name, "维塔");
                assert!((damage - 83_282_001_920.0).abs() < 1.0);
                assert!((score - 2.8485642192121).abs() < 1e-9);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tCalculateMVP MVPScore: \t2.8485642192121\tMVPIndex\t1\tMVPName\t维塔",
            ),
        ) {
            LogEvent::MvpMeta {
                score, index, name, ..
            } => {
                assert!((score - 2.8485642192121).abs() < 1e-9);
                assert_eq!(index, 1);
                assert_eq!(name, "维塔");
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: nil\t [Debug Log]: \tCalculateMVP MVPFactor:\t1.4661701917648"),
        ) {
            LogEvent::Factor { value, .. } => assert!((value - 1.4661701917648).abs() < 1e-9),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \t[ObjectId('690041EF56DE646A294AD388') Avatar]\tOnDungeonFinish, DungeonId is 40604, IsWin is true, PlayerTime is 71.294860839844, GameTime is 71.465789794922",
            ),
        ) {
            LogEvent::Settle {
                win,
                player_time,
                game_time,
                dungeon_id,
                ..
            } => {
                assert!(win);
                assert_eq!(player_time, Some(71.294860839844));
                assert_eq!(game_time, Some(71.465789794922));
                assert_eq!(dungeon_id, 40604);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tDungeonSettlement: OnLoaded widget IsWin\ttrue\tPlayerTime\t71.29\tDungeonId\t40604",
            ),
        ) {
            LogEvent::Settle {
                win,
                player_time,
                game_time,
                dungeon_id,
                ..
            } => {
                assert!(win);
                assert_eq!(player_time, Some(71.29));
                assert_eq!(game_time, None);
                assert_eq!(dungeon_id, 40604);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tDungeonSettlement: OnLoaded widget IsWin\tfalse\tPlayerTime\tnil\tDungeonId\t-1",
            ),
        ) {
            LogEvent::Settle {
                win,
                player_time,
                dungeon_id,
                ..
            } => {
                assert!(!win);
                assert_eq!(player_time, None);
                assert_eq!(dungeon_id, -1);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\tLogicServer_OnDungeonFinish RealOnDungeonFinish\t40604\ttrue\ttable: 1\ttable: 2\t71.294860839844\t71.465789794922",
            ),
        ) {
            LogEvent::Finish {
                dungeon_id,
                ok,
                player_time,
                game_time,
                ..
            } => {
                assert_eq!(dungeon_id, 40604);
                assert!(ok);
                assert_eq!(player_time, Some(71.294860839844));
                assert_eq!(game_time, Some(71.465789794922));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: RealOnDungeonFinish\t40604\ttrue"),
        ) {
            LogEvent::Finish {
                dungeon_id,
                ok,
                player_time,
                game_time,
                ..
            } => {
                assert_eq!(dungeon_id, 40604);
                assert!(ok);
                assert_eq!(player_time, None);
                assert_eq!(game_time, None);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_misc_world_events() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line(
                "LogTaskbarReward: Library::SendTaskbarDungeonStatus called: id=40604, status=enter, name=",
            ),
        ) {
            LogEvent::Taskbar {
                id, status, name, ..
            } => {
                assert_eq!(id, 40604);
                assert_eq!(status, "enter");
                assert_eq!(name, "");
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogTaskbarReward: Library::SendTaskbarDungeonStatus called: id=28001, status=enter, name=永恒梦魇·西比尔",
            ),
        ) {
            LogEvent::Taskbar {
                id, status, name, ..
            } => {
                assert_eq!(id, 28001);
                assert_eq!(status, "enter");
                assert_eq!(name, "永恒梦魇·西比尔");
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(&mut parser, &line("LogTemp: OnEnterHardBoss\t3\t5")) {
            LogEvent::HbEnter { boss_id, diff, .. } => {
                assert_eq!((boss_id, diff), (3, 5));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tLogEMAudioManager Avatr CurrentRegionId is\t101304",
            ),
        ) {
            LogEvent::Region { region_id, .. } => assert_eq!(region_id, 101304),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: nil\tOnRewardRateUpdate\tBonus\t1500"),
        ) {
            LogEvent::RewardRate { kind, value, .. } => {
                assert_eq!(kind, "bonus");
                assert_eq!(value, 1500);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: nil\tOnRewardRateUpdate\tExp\t1500"),
        ) {
            LogEvent::RewardRate { kind, value, .. } => {
                assert_eq!(kind, "exp");
                assert_eq!(value, 1500);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogTemp: 半高：160.000000,打中位置：V(X=-660.00, Y=-670.00, Z=-1062.10),打中目标：SM_Balcony_Ring2,Pawn名字：BP_Boss_Kuxiu_C_2147463516,SurfacePos：V(X=-660.00, Y=-670.00, Z=-915.00)",
            ),
        ) {
            LogEvent::Hit { x, y, z, pawn, .. } => {
                assert!((x + 660.0).abs() < 1e-6);
                assert!((y + 670.0).abs() < 1e-6);
                assert!((z + 1062.10).abs() < 1e-6);
                assert_eq!(pawn.as_deref(), Some("BP_Boss_Kuxiu_C_2147463516"));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogTemp: 打中位置：V(X=1.5, Y=2.5, Z=3.5),打中目标：Actor_6"),
        ) {
            LogEvent::Hit { pawn, .. } => assert_eq!(pawn, None),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogTaskbarReward: DispatchJson: {\"type\":\"reward\",\"id\":14,\"name\":\"赤色残响\",\"rarity\":4,\"count\":2}",
            ),
        ) {
            LogEvent::Reward { json, .. } => {
                assert!(json.contains("\"type\":\"reward\""));
                assert!(json.ends_with('}'));
            }
            other => panic!("unexpected {other:?}"),
        }
        no_event(
            &mut parser,
            &line("LogTaskbarReward: DispatchJson: {\"type\":\"character\",\"id\":4103}"),
        );
    }

    #[test]
    fn parses_slots_and_skills() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line(
                "LogUnLua: nil\t [Debug Log]: \tCharacter Name: BP_PhantomCharacter_C_2147462760 Init Success: 1 ServerInit Success: 1, Eid: 5",
            ),
        ) {
            LogEvent::EidInit { bp, eid, .. } => {
                assert_eq!(bp, "BP_PhantomCharacter_C_2147462760");
                assert_eq!(eid, 5);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: WBP_MainBar_C:SetName 1\tnil\tfalse\tBP_PlayerCharacter_C_2147479437"),
        ) {
            LogEvent::SlotSet { slot, bp, .. } => {
                assert_eq!(slot, "1");
                assert_eq!(bp.as_deref(), Some("BP_PlayerCharacter_C_2147479437"));
            }
            other => panic!("unexpected {other:?}"),
        }
        no_event(
            &mut parser,
            &line(
                "LogUnLua: WBP_MainBar_C:SetName 3\tnil\ttrue\tBP_Boss_Linen_Summon1_C_2147461111",
            ),
        );

        match event(
            &mut parser,
            &line("LogUnLua: WBP_MainBar_C:SetPhantomName NameKey UI_CHAR_NAME_2401"),
        ) {
            LogEvent::SlotName { key, .. } => assert_eq!(key, "UI_CHAR_NAME_2401"),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: WBP_MainBar_C:SetPhantomName ContentEN Zhiliu"),
        ) {
            LogEvent::SlotEn { code, .. } => assert_eq!(code, "Zhiliu"),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: WBP_MainBar_C:SetPhantomName GetText 止流"),
        ) {
            LogEvent::SlotText { text, .. } => assert_eq!(text, "止流"),
            other => panic!("unexpected {other:?}"),
        }

        let start_use = event(
            &mut parser,
            &line(
                "LogTemp: gmy@ACharacterBase::Start RealUseSkill,Eid:1,SkillI:1040101,LocalRole:3,InstanceId:0",
            ),
        );
        match &start_use {
            LogEvent::Skill {
                eid,
                skill_id,
                local_role,
                phase,
                action,
                ..
            } => {
                assert_eq!((*eid, *skill_id, *local_role), (1, 1040101, 3));
                assert_eq!(phase.as_deref(), Some("start"));
                assert_eq!(action.as_deref(), Some("use"));
            }
            other => panic!("unexpected {other:?}"),
        }

        // P17：只认 Start RealUseSkill；Finish / RealStopSkill 不再计数
        no_event(
            &mut parser,
            &line(
                "LogTemp: gmy@ACharacterBase::Finish RealUseSkill,Eid:1,SkillI:1040101,LocalRole:3,InstanceId=0",
            ),
        );
        no_event(
            &mut parser,
            &line(
                "LogTemp: gmy@ACharacterBase::Finish RealStopSkill,Eid:1,SkillI:1040101,LocalRole:3,InstanceId:0",
            ),
        );
        no_event(
            &mut parser,
            &line(
                "LogCharacterBase: gmy@ACharacterBase::Start RealStopSkill,Eid:1,SkillI:1040101,CurSkillId=1040101,LocalRole:3,InstanceId:0,Reason=0",
            ),
        );

        match event(
            &mut parser,
            &line(
                "LogUnLua: gmy@WBP_Player_SkillPanel_PC_C WBP_Player_SkillPanel_PC_C:RefreshRoleSkillButton\t13\t410301",
            ),
        ) {
            LogEvent::PanelSkill { skill_id, .. } => assert_eq!(skill_id, 410301),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_match_flow_events() {
        let mut parser = LogParser::new(0.0);

        match event(
            &mut parser,
            &line("LogTemp: Warning: wzj-  预加载副本战斗资源，UnitId：410399   加载数量： 89"),
        ) {
            LogEvent::Preload { unit_id, count, .. } => {
                assert_eq!(unit_id, 410399);
                assert_eq!(count, 89);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            "LogInit: Command Line:  -EnableShippingLog -LogTimes -LogFiles",
        ) {
            LogEvent::Cmd { line, .. } => {
                assert_eq!(line, "-EnableShippingLog -LogTimes -LogFiles")
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            "LogTemp: Warning: bEnableShippingLog True, bForceEnableShippingLog False, bEffectiveEnableShippingLog True",
        ) {
            LogEvent::Diag {
                enable,
                force,
                effective,
                ..
            } => {
                assert!(enable);
                assert!(!force);
                assert!(effective);
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogWC: Display: LevelId : Chapter01_Kuangkeng_Part_01, LevelPackage : /Game/Maps/Levels/Chapter01/Chapter01_KuangKeng_Main/Art_Data/Chapter01_Kuangkeng_Part_01_Art/Chapter01_Kuangkeng_Part_01_Art",
            ),
        ) {
            LogEvent::Level {
                level_id, package, ..
            } => {
                assert_eq!(level_id, "Chapter01_Kuangkeng_Part_01");
                assert!(package.starts_with("/Game/Maps/"));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogSnowMoon: ChangeDungeonByDungeonId, MapLevelName is /Game/Maps/Prologue_AsycCombat",
            ),
        ) {
            LogEvent::Map { name, .. } => assert_eq!(name, "Prologue_AsycCombat"),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogGameMode: EnterDungeon callback, Ret is 0, DungeonId is 40604"),
        ) {
            LogEvent::DunEnter { dungeon_id, .. } => assert_eq!(dungeon_id, 40604),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogUnLua: nil\t [Debug Log]: \tSystemGuide EnterDungeonEvent DungeonId:\t40604"),
        ) {
            LogEvent::EnterGuide { dungeon_id, .. } => assert_eq!(dungeon_id, 40604),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line(
                "LogGameMode: AEMGameMode::InitDungeonComponent 初始化成功！GameModeType: AsyncCombat",
            ),
        ) {
            LogEvent::DunInit { mode, .. } => assert_eq!(mode, "AsyncCombat"),
            other => panic!("unexpected {other:?}"),
        }

        match event(
            &mut parser,
            &line("LogTemp: SoloRaidComponent:Init FloorId 1120 Level 180"),
        ) {
            LogEvent::SoloFloor {
                floor_id, level, ..
            } => {
                assert_eq!((floor_id, level), (1120, 180));
            }
            other => panic!("unexpected {other:?}"),
        }

        match event(&mut parser, &line("LogTemp: SoloRaidComponent:Init! 21704")) {
            LogEvent::SoloInit { dungeon_id, .. } => assert_eq!(dungeon_id, 21704),
            other => panic!("unexpected {other:?}"),
        }

        match event(&mut parser, &line("LogUnLua: Vote::: BattleNum = 7")) {
            LogEvent::Vote { battle_num, .. } => assert_eq!(battle_num, 7),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_all_rift_events() {
        let mut parser = LogParser::new(0.0);

        assert!(matches!(
            event(
                &mut parser,
                &line("LogRift: RiftComponent:InitRiftBaseInfo 玩法开启")
            ),
            LogEvent::RiftInit { .. }
        ));
        match event(
            &mut parser,
            &line("LogRift: RiftComponent:StartRiftMainTimer 开始 TotalTime 180"),
        ) {
            LogEvent::RiftTimer { total_time, .. } => assert_eq!(total_time, 180),
            other => panic!("unexpected {other:?}"),
        }
        match event(
            &mut parser,
            &line("LogRift: RiftComponent:EnterRoom 进入房间 RoomId 3"),
        ) {
            LogEvent::RiftEnterRoom { room_id, .. } => assert_eq!(room_id, 3),
            other => panic!("unexpected {other:?}"),
        }
        match event(
            &mut parser,
            &line("LogRift: RiftComponent:ActiveRoomMonsterSpawn RoomId 3 SpawnId 9"),
        ) {
            LogEvent::RiftSpawn {
                room_id, spawn_id, ..
            } => assert_eq!((room_id, spawn_id), (3, 9)),
            other => panic!("unexpected {other:?}"),
        }
        match event(
            &mut parser,
            &line("LogRift: RiftComponent:OnRiftRoomReached 房间达标 RoomId 3"),
        ) {
            LogEvent::RiftClear { room_id, .. } => assert_eq!(room_id, 3),
            other => panic!("unexpected {other:?}"),
        }
        assert!(matches!(
            event(
                &mut parser,
                &line("LogRift: RiftComponent:OnRiftTotalReached")
            ),
            LogEvent::RiftTotal { .. }
        ));
        match event(
            &mut parser,
            &line("LogRift: RiftComponent:RandomRiftBossUnitId 随机 Boss UnitId 8515605"),
        ) {
            LogEvent::RiftBossPick { unit_id, .. } => assert_eq!(unit_id, 8515605),
            other => panic!("unexpected {other:?}"),
        }
        match event(
            &mut parser,
            &line(
                "LogRift: RiftComponent:OnStaticCreatorEvent 最终 Boss 静态点已激活 Eid 93 UnitId 8515605",
            ),
        ) {
            LogEvent::RiftBossActive { eid, unit_id, .. } => {
                assert_eq!((eid, unit_id), (93, 8515605));
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(matches!(
            event(
                &mut parser,
                &line("LogRift: RiftComponent:OnRiftFinalBossDead")
            ),
            LogEvent::RiftBossDead { .. }
        ));
    }

    #[test]
    fn dropped_lines_produce_no_events() {
        let mut parser = LogParser::new(0.0);
        no_event(
            &mut parser,
            &line("LogTemp: Display: Something completely unrelated"),
        );
        no_event(
            &mut parser,
            &line("LogStaticMesh: [Me_DungeonSettlement_01] Mesh is marked for CPU read."),
        );
        no_event(
            &mut parser,
            &line(
                "LogTemp: gmy@ACharacterBase::Finish RealUseSkill,Eid:1,SkillI:1040101,LocalRole:3,InstanceId=0",
            ),
        );
        no_event(
            &mut parser,
            &line("LogTaskbarReward: Trying to connect pipe: \\\\.\\pipe\\TBH_RewardPipe"),
        );
    }

    #[test]
    fn serde_uses_camel_case_tag_and_fields() {
        let payload = LogEvent::DunEnter {
            t: 1.5,
            dungeon_id: 40604,
        };
        let value = serde_json::to_value(&payload).unwrap();
        assert_eq!(value["k"], "dunEnter");
        assert_eq!(value["dungeonId"], 40604);
        assert_eq!(value["t"], 1.5);

        let skill = LogEvent::Skill {
            t: 2.0,
            eid: 1,
            skill_id: 1040101,
            local_role: 3,
            phase: Some("start".to_string()),
            action: Some("use".to_string()),
        };
        let value = serde_json::to_value(&skill).unwrap();
        assert_eq!(value["k"], "skill");
        assert_eq!(value["skillId"], 1040101);
        assert_eq!(value["localRole"], 3);
        assert_eq!(value["phase"], "start");
        assert_eq!(value["action"], "use");

        let settle = LogEvent::Settle {
            t: 3.0,
            win: true,
            player_time: Some(71.25),
            game_time: Some(71.5),
            dungeon_id: 40604,
        };
        let value = serde_json::to_value(&settle).unwrap();
        assert_eq!(value["k"], "settle");
        assert_eq!(value["playerTime"], 71.25);
        assert_eq!(value["gameTime"], 71.5);
        assert_eq!(value["dungeonId"], 40604);

        let ai = LogEvent::AiCreate {
            t: 4.0,
            unit_id: 8513605,
            eid: 2,
        };
        let value = serde_json::to_value(&ai).unwrap();
        assert_eq!(value["k"], "aiCreate");
        assert_eq!(value["unitId"], 8513605);
        assert_eq!(value["eid"], 2);
    }

    /// 测试便捷：推入字节、取出完整行并压缩缓冲。
    fn drain(buffer: &mut LineBuffer, bytes: &[u8]) -> (usize, Vec<String>) {
        let mut ranges = Vec::new();
        let (completed, consumed) = buffer.push(bytes, &mut ranges);
        let lines = ranges
            .iter()
            .map(|range| buffer.text(range.clone()).into_owned())
            .collect();
        buffer.compact(consumed);
        (completed, lines)
    }

    #[test]
    fn line_buffer_handles_bom_crlf_and_partial_lines() {
        let mut buffer = LineBuffer::new();

        let (completed, lines) = drain(&mut buffer, b"\xEF\xBB\xBFfirst\nsecond");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec!["first".to_string()]);

        let (completed, lines) = drain(&mut buffer, b"\r\nthird\r\n");
        assert_eq!(completed, 2);
        assert_eq!(lines, vec!["second".to_string(), "third".to_string()]);

        let (completed, lines) = drain(&mut buffer, b"incomplete");
        assert_eq!(completed, 0);
        assert!(lines.is_empty());
    }

    #[test]
    fn line_buffer_discards_overlong_lines() {
        let mut buffer = LineBuffer::new();
        let mut huge = vec![b'a'; MAX_LINE_BYTES + 16];
        huge.push(b'\n');
        let (completed, lines) = drain(&mut buffer, &huge);
        assert_eq!(completed, 1);
        assert!(lines.is_empty());

        let (completed, lines) = drain(&mut buffer, b"ok\n");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec!["ok".to_string()]);
    }

    #[test]
    fn line_buffer_keeps_bom_rules_after_overlong_first_line() {
        let mut buffer = LineBuffer::new();
        let mut input = vec![b'a'; MAX_LINE_BYTES + 1];
        input.extend_from_slice(b"\n\xEF\xBB\xBFok\n");
        let (completed, lines) = drain(&mut buffer, &input);
        assert_eq!(completed, 2);
        assert_eq!(lines, vec!["\u{feff}ok".to_string()]);
    }

    #[test]
    fn line_buffer_handles_empty_first_line_and_split_bom() {
        let mut buffer = LineBuffer::new();
        let (completed, lines) = drain(&mut buffer, b"\xEF\xBB\xBF\r\n");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec![String::new()]);

        let (_, lines) = drain(&mut buffer, b"\xEF\xBB\xBFx\n");
        assert_eq!(lines, vec!["\u{feff}x".to_string()]);

        let mut split = LineBuffer::new();
        let (completed, lines) = drain(&mut split, b"\xEF\xBB");
        assert_eq!(completed, 0);
        assert!(lines.is_empty());
        let (completed, lines) = drain(&mut split, b"\xBFok\n");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec!["ok".to_string()]);
    }

    #[test]
    fn line_buffer_handles_cross_chunk_crlf_and_invalid_utf8() {
        let mut buffer = LineBuffer::new();
        let (completed, lines) = drain(&mut buffer, b"a\r");
        assert_eq!(completed, 0);
        assert!(lines.is_empty());
        let (completed, lines) = drain(&mut buffer, b"\nb\r\r\nc\r\nd");
        assert_eq!(completed, 3);
        assert_eq!(
            lines,
            vec!["a".to_string(), "b\r".to_string(), "c".to_string()]
        );
        let (completed, lines) = drain(&mut buffer, b"e\n");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec!["de".to_string()]);

        let mut invalid = LineBuffer::new();
        let (completed, lines) = drain(&mut invalid, b"\xEF\xBB\xBFbad\xFF\n");
        assert_eq!(completed, 1);
        assert_eq!(lines, vec!["bad\u{FFFD}".to_string()]);
    }

    #[test]
    fn replay_fallback_precedes_log_timestamps() {
        let started_at = 1_795_267_380.0;
        assert_eq!(fallback_timestamp(true, started_at), 0.0);
        assert_eq!(fallback_timestamp(false, started_at), started_at);
    }
}
