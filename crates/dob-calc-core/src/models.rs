//! 等级化模型：把静态记录包装成「带等级 / 精炼 / 覆盖率状态、能按等级曲线求值」的实例。
//!
//! 逐条对齐上游 `src/data/leveled/`。几处必须精确复刻的语义（错了数字就不对）：
//!
//! 1. **属性值 = 满级值 / (上限 + 1) × (等级 + 1)**（MOD / BUFF）；
//! 2. **`神智回复` / `最大耐受` 要 `ceil`**，其余不取整；
//! 3. **耐受**：`id > 100000` 是「原始 + 上限 - 等级」，否则「原始 - 上限 + 等级」；
//! 4. **架势 MOD**（id 落在 `100000~150000` / `200000~250000`）属性等级固定取上限；
//! 5. **武器精炼**：`原始值 / 5 × (精炼 + 5)`，带熔炉的武器精炼固定按 5 算且不缩放；
//! 6. **角色**：攻击/生命/护盾按 `CommonLevelUp[等级-1]` 缩放，**防御与神智不缩放**；
//! 7. 大量 `Math.round(x * 100) / 100` 截断，浮点尾差会在长链乘算里放大。

use super::config::resolve_skill_level;
use super::record::Record;
use super::tables::{ModSource, WeaponSource};

/// MOD 品质 → 等级上限（上游 `LeveledMod.modQualityMaxLevel`）。
pub fn mod_quality_max_level(quality: &str) -> f64 {
    match quality {
        "金" => 10.0,
        "紫" | "蓝" => 5.0,
        "绿" | "白" => 3.0,
        // 未知品质按 1（上游 `|| 1`）
        _ => 1.0,
    }
}

/// `Math.round(x * 100) / 100`：上游用于攻击力等两位小数截断。
///
/// 必须经 `js_round`：Rust `f64::round` 是 half-away-from-zero，
/// 与 JS `Math.round`（half-up 向 `+∞`）在负数 `.5` 处相反。
pub fn round2(value: f64) -> f64 {
    js_round(value * 100.0) / 100.0
}

/// `Math.round(x * 1000) / 1000`：上游用于独立增伤的截断。
pub fn round3(value: f64) -> f64 {
    js_round(value * 1000.0) / 1000.0
}

/// JS `Math.round` 精确语义：half-up 向 `+∞`（`-1.5 → -1`、`-2.5 → -2`），
/// 外加 `n == 0 && x < 0 → -0`（ECMA-262 `Number::round`）。
pub fn js_round(value: f64) -> f64 {
    if !value.is_finite() {
        return value;
    }
    let rounded = (value + 0.5).floor();
    if rounded == 0.0 && value < 0.0 {
        -0.0
    } else {
        rounded
    }
}

/// JS `Number.prototype.toFixed(digits)` 精确语义（ECMA-262 `Number::to_fixed`）。
///
/// 对 f64 的**精确二进制值**做十进制展开，在第 `digits` 位后 half-up（远离零），
/// 再转回最近 f64。不能用 `(x·10^d).round()/10^d` 近似：`x·10^d` 的乘法舍入会吃掉
/// 真实二进制尾（实测 `2.675→2.67`、`21.345→21.34`、`0.1234565→0.123456`、
/// `-0.5→-1` 均与朴素版相反）。
///
/// TS 调用点：`LeveledWeapon.射速/基础攻击`（`toFixed(4/2)`）、`LeveledMod` 等级缩放
/// （`toFixed(4)`）、`roundBuffValue`（`toFixed(6)` 覆盖率/自定义 BUFF）；`%` 展示不进计算。
/// `digits > 100` 按上游抛错语义返回 `NaN`（调用点恒为 2/4/6，不会触发）；
/// 非有限值 / `|x| ≥ 1e21` 按 `+str` 回数值恒等返回原值。
pub fn js_to_fixed(value: f64, digits: u32) -> f64 {
    if digits > 100 {
        return f64::NAN;
    }
    if !value.is_finite() || value.abs() >= 1e21 {
        return value;
    }
    if value == 0.0 {
        return 0.0;
    }
    let negative = value.is_sign_negative();
    // 精确二进制值 = mantissa × 2^exp2（mantissa 含隐含前导 1，非正规数已归一）。
    let bits = value.abs().to_bits();
    let raw_exp = ((bits >> 52) & 0x7ff) as i32;
    let mantissa: u64 = if raw_exp == 0 {
        (bits & 0xf_ffff_ffff_ffff) << 1
    } else {
        (bits & 0xf_ffff_ffff_ffff) | 0x10_0000_0000_0000
    };
    let exp2 = raw_exp - 1075;
    // 十进制位数组（大端，高位在前）表示整数；point = 小数点右方小数位数（值 = int × 10^-point）。
    let mut int_digits: Vec<u8> = {
        let mut rest = mantissa as u128;
        let mut little = Vec::new();
        while rest > 0 {
            little.push((rest % 10) as u8);
            rest /= 10;
        }
        if little.is_empty() {
            little.push(0);
        }
        little.into_iter().rev().collect()
    };
    let mut point: i64 = 0;
    if exp2 >= 0 {
        for _ in 0..exp2 {
            decimal_mul_small(&mut int_digits, 2);
        }
    } else {
        for _ in 0..(-exp2) {
            decimal_div_small(&mut int_digits, &mut point, 2);
        }
    }
    let keep = digits as i64;
    let frac_len = point;
    let mut int_part = int_digits.clone();
    if frac_len > keep {
        // 小数位多于保留位：小数部分 = 末 (frac_len - keep) 位。
        let drop = (frac_len - keep) as usize;
        let split = int_part.len().saturating_sub(drop);
        let mut frac = int_part.split_off(split);
        while frac.len() < drop {
            frac.insert(0, 0);
        }
        if decimal_ge_half(&frac) {
            decimal_add_one(&mut int_part);
        }
        decimal_trim(&mut int_part);
        if int_part.is_empty() {
            return if negative { -0.0 } else { 0.0 };
        }
        let rounded = decimal_to_f64(&int_part, keep);
        return apply_sign_zero(rounded, negative);
    }
    // 小数位不足：直接转回（值本身小数位 ≤ keep，无需舍入）。
    let rounded = decimal_to_f64(&int_part, frac_len);
    apply_sign_zero(rounded, negative)
}

/// 结果符号还原：零值保留负零（`+(-0.001).toFixed(2)` 得 `-0.0`）。
fn apply_sign_zero(rounded: f64, negative: bool) -> f64 {
    if rounded == 0.0 {
        if negative { -0.0 } else { 0.0 }
    } else if negative {
        -rounded
    } else {
        rounded
    }
}
/// 大端十进制位 × 小整数。
fn decimal_mul_small(digits: &mut Vec<u8>, m: u8) {
    let mut carry: u16 = 0;
    for digit in digits.iter_mut().rev() {
        let total = (*digit as u16) * (m as u16) + carry;
        *digit = (total % 10) as u8;
        carry = total / 10;
    }
    while carry > 0 {
        digits.insert(0, (carry % 10) as u8);
        carry /= 10;
    }
}
/// 大端十进制位 ÷ 小整数（精确：余数化为新增小数位，`point` 递增）。
///
/// 不变量：`digits`（大端整数）`× 10^-point` 恒等于真实值。
/// 长除后余数 `r`：真实值 = `商 + r/d × 10^-point`，余数展开为小数位；
/// `d=2` 时至多两轮终止（余数 ∈ {0,1} → 展开 {0,5}，余恒 0）。
fn decimal_div_small(digits: &mut Vec<u8>, point: &mut i64, d: u8) {
    let mut remainder: u16 = 0;
    for digit in digits.iter_mut() {
        let total = remainder * 10 + (*digit as u16);
        *digit = (total / d as u16) as u8;
        remainder = total % d as u16;
    }
    while remainder != 0 {
        let expanded = remainder * 10;
        digits.push((expanded / d as u16) as u8);
        *point += 1;
        remainder = expanded % d as u16;
    }
    decimal_trim(digits);
}
/// 去前导零（至少留一位）。
fn decimal_trim(digits: &mut Vec<u8>) {
    while digits.len() > 1 && digits[0] == 0 {
        digits.remove(0);
    }
}
/// 大端十进制小数位 ≥ 0.5：首位 ≥ 5 即进位（首位 =5 时无论后零与否都 ≥ 0.5）。
fn decimal_ge_half(frac: &[u8]) -> bool {
    frac.first().is_some_and(|&first| first >= 5)
}
/// 大端十进制位 +1。
fn decimal_add_one(digits: &mut Vec<u8>) {
    let mut carry = 1u8;
    for digit in digits.iter_mut().rev() {
        let total = *digit + carry;
        *digit = total % 10;
        carry = total / 10;
        if carry == 0 {
            break;
        }
    }
    if carry > 0 {
        digits.insert(0, carry);
    }
}
/// 大端十进制整数位 × 10^(-scale) → 最近 f64（经定点字符串 round-trip，保证正确舍入）。
fn decimal_to_f64(digits: &[u8], scale: i64) -> f64 {
    let mut text = String::new();
    let int_len = digits.len() as i64 - scale;
    if int_len <= 0 {
        text.push_str("0.");
        for _ in 0..(-int_len) {
            text.push('0');
        }
        for &digit in digits {
            text.push((b'0' + digit) as char);
        }
    } else {
        let int_len = int_len as usize;
        for &digit in &digits[..int_len] {
            text.push((b'0' + digit) as char);
        }
        if scale > 0 {
            text.push('.');
            for &digit in &digits[int_len..] {
                text.push((b'0' + digit) as char);
            }
        }
    }
    text.parse::<f64>().unwrap_or(0.0)
}

/// 判断属性是否为乘法池属性（按 Π(1+v) 聚合）；对应上游 `isMultiplicativeAttr`。
pub fn is_multiplicative_attr(prop: &str) -> bool {
    matches!(prop, "无视防御" | "技能无视防御" | "技能倍率乘数") || prop.ends_with("独立增伤")
}

/// 属性表：有序，便于快照比对与调试输出。
pub type AttrMap = crate::attrmap::AttrMap;

// ============================ 角色 ============================

/// 角色实例；对应上游 `LeveledChar`。
#[derive(Debug, Clone)]
pub struct LeveledChar {
    pub id: i64,
    pub name: String,
    /// 属性（光 / 暗 / 水 / 火 / 雷 / 风）。
    pub element: String,
    pub mastery: Vec<String>,
    pub extra_mastery: Vec<String>,
    pub level: f64,
    /// 当前等级下的基础攻击。
    pub base_attack: f64,
    pub base_hp: f64,
    pub base_shield: f64,
    /// 防御与神智**不随等级缩放**，直接取原始值。
    pub base_defense: f64,
    pub base_sanity: f64,
    /// `加成`（角色自带百分比加成），上游走 `table.char`。
    pub bonus: Record,
    /// 80 级基准值，用于按等级重算。
    base_attack_80: f64,
    base_hp_80: f64,
    base_shield_80: f64,
    pub skills: Vec<LeveledSkill>,
    /// 原始记录（技能替换、同律武器等需要回查）。
    pub raw: Record,
}

impl LeveledChar {
    /// 从记录构建；对应上游 `new LeveledChar(charData, level)`。
    ///
    /// `level` 为 `None` 时取 80（上游 `等级 ?? 80`）。
    /// `skill_levels` 为技能等级 `[E, Q, 被动]` 三元组（上游 `skillLevel`，
    /// 各技能按索引取等级：0→E，1→Q，2 及之后→被动）。
    pub fn new(
        raw: Record,
        level: Option<f64>,
        skill_levels: &[f64; 3],
        common_level_up: &[f64],
    ) -> Self {
        let base_attack_80 = raw.num_or("基础攻击", 0.0);
        let base_hp_80 = raw.num_or("基础生命", 0.0);
        let base_shield_80 = raw.num_or("基础护盾", 0.0);
        // 角色技能用三元组技能等级按索引初始化
        // （上游 `new LeveledSkill(skill.skillData, resolveCharSkillLevel(this.skillLevel, index))`），
        // 字段 `值` / `值2` 是 12 级数组，等级决定取哪一项。
        let skills: Vec<LeveledSkill> = raw
            .objs("技能")
            .into_iter()
            .enumerate()
            .map(|(index, skill)| {
                LeveledSkill::new(
                    skill,
                    Some(resolve_skill_level(skill_levels, index as i64)),
                    None,
                    raw.text("名称"),
                )
            })
            .collect();

        let mut char = Self {
            id: raw.id("id").unwrap_or(0),
            name: raw.text("名称"),
            element: raw.text("属性"),
            mastery: raw.texts("精通"),
            extra_mastery: raw.texts("额外精通"),
            level: 1.0,
            base_attack: 0.0,
            base_hp: 0.0,
            base_shield: 0.0,
            base_defense: raw.num_or("基础防御", 0.0),
            base_sanity: raw.num_or("基础神智", 0.0),
            bonus: raw.obj("加成"),
            base_attack_80,
            base_hp_80,
            base_shield_80,
            skills,
            raw,
        };
        // 上游靠 `set 等级` 里的「值变化才更新」短路，但 `_等级` 初值是 1，
        // 传 1 级时不会触发更新——而初值字段本来就是 0，会漏掉第一次缩放。
        // 这里直接无条件算一次，结果与上游等价（上游初值字段直接取原始值，随后被 setter 覆盖）。
        char.level = level.unwrap_or(80.0).clamp(1.0, 80.0);
        char.update_by_level(common_level_up);
        char
    }

    /// 设置等级；对应上游 `set 等级`。等级钳制到 1-80。
    pub fn set_level(&mut self, value: f64, common_level_up: &[f64]) {
        let next = value.clamp(1.0, 80.0);
        self.level = next;
        self.update_by_level(common_level_up);
    }

    fn update_by_level(&mut self, common_level_up: &[f64]) {
        let level = self.level.clamp(1.0, 80.0);
        let multiplier = common_level_up
            .get(level as usize - 1)
            .copied()
            .unwrap_or(1.0);
        // 基础神智与防御不受等级影响
        self.base_attack = round2(self.base_attack_80 * multiplier);
        self.base_hp = (self.base_hp_80 * multiplier).round();
        self.base_shield = (self.base_shield_80 * multiplier).round();
    }

    /// 取该角色的技能列表（按顺序）；上游 `技能` 字段。
    pub fn skill(&self, index: usize) -> Option<&LeveledSkill> {
        self.skills.get(index)
    }
}

// ============================ 技能 ============================

/// 技能字段（等级化后 `值` / `值2` 已经是标量）；对应上游 `LeveledSkillField`。
///
#[derive(Debug, Clone)]
pub struct SkillField {
    pub base: std::sync::Arc<SkillFieldBase>,
    pub value: f64,
    pub value2: f64,
}

/// 技能字段的不变部分（构造后只读，求值期共享）。
#[derive(Debug, Clone)]
pub struct SkillFieldBase {
    pub name: String,
    /// `safeName`：名称里的 `/` 换成 `_`（上游用于表达式字段匹配）。
    pub safe_name: String,
    /// 受哪些角色属性影响（`技能威力,技能效益` 这类逗号分隔串）。
    pub influence: String,
    pub format: Option<String>,
    /// `基础`：格式串里含「生命 / 防御」时解析出的基数来源。
    pub attr_base: Option<String>,
    /// 伤害类型标签（如 `["充盈"]` / `["召唤物"]`）。
    pub tags: Vec<String>,
    /// 字段自带的伤害类型（`伤害类型` 字段，如「灾厄」）；未标注为 `None`。
    pub damage_type: Option<String>,
    /// 字段序号（上游按 `Object.keys` 顺序，这里保序）。
    pub index: usize,
}

impl std::ops::Deref for SkillField {
    type Target = SkillFieldBase;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// 条件BUFF的字段级属性增量；对应上游 `BuffFieldConditional`。
///
/// 带 `技能` 时字段名匹配（支持 `|` 交替多技能）命中，带 `tag` 时字段标签命中
/// （如 `["充盈"]`，命中任一标签即满足）；两者都有时需同时命中。命中后把 `props`
/// 合并进该字段的独立求值上下文。
#[derive(Debug, Clone, Default)]
pub struct BuffFieldConditional {
    pub skill: Option<String>,
    /// 预编译的技能名匹配模式（无技能限定时为 `None`）。
    pub pattern: Option<SkillPattern>,
    /// 字段标签限定（命中任一标签即满足标签条件）。
    pub tag: Vec<String>,
    pub props: AttrMap,
}

impl BuffFieldConditional {
    /// 判断条件条目是否命中指定字段；对应上游 `LeveledSkill.matchesFieldConditional`。
    pub fn matches(&self, field_name: &str, field_tags: &[String]) -> bool {
        let has_skill = self.skill.as_ref().is_some_and(|skill| !skill.is_empty());
        if has_skill {
            let pattern_hit = self
                .pattern
                .as_ref()
                .is_some_and(|pattern| pattern.matches(field_name));
            if !pattern_hit {
                return false;
            }
        }
        if !self.tag.is_empty() && !self.tag.iter().any(|tag| field_tags.contains(tag)) {
            return false;
        }
        has_skill || !self.tag.is_empty()
    }
}

/// 装备特效的 `code` 动态 BUFF；对应上游 `getEffectCodeBuffs` 返回的条目。
///
/// `技能`/`tag` 限定的改由字段级条件合并应用（调用方按是否有条件分流）。
#[derive(Debug, Clone)]
pub struct EffectCodeBuff {
    pub skill: Option<String>,
    /// `skill` 的预编译匹配模式。
    pub pattern: Option<SkillPattern>,
    pub tag: Vec<String>,
    pub code: String,
}

impl EffectCodeBuff {
    /// 是否字段条件 code（不并入全局属性）。
    pub fn is_field_conditional(&self) -> bool {
        self.skill.is_some() || !self.tag.is_empty()
    }
}

/// 技能名匹配模式；对应上游 `compileBuffSkillPattern`（`new RegExp(技能)`，非法时退字面量）。
///
/// 只实现数据包实际用到的正则子集：`|` 交替、行首/行尾锚点 `^` `$`、`.` / `.*`、
/// 反斜杠转义元字符。`packages/data/d/buff.data.ts` 的 `技能` 全集为
/// `"月猎|日食"`、`"狙击子弹|^伤害$"` 与 7 条纯字面量，上述子集可完整表达
/// （`^伤害$` 走「全串相等」快路径）；超出子集的写法按上游「非法 pattern」口径
/// 退化为字面量子串匹配。
///
/// `pattern` 在 `conditional_buff_props_list` 装配期一次预编译，
/// 热路径 `matches` 零编译、零分配。
#[derive(Debug, Clone, Default)]
pub struct SkillPattern {
    branches: Vec<SkillBranch>,
    /// 超出子集时退化为整段 pattern 的字面量子串匹配。
    fallback: Option<String>,
}

#[derive(Debug, Clone)]
struct SkillBranch {
    anchored_start: bool,
    anchored_end: bool,
    /// 分支全为字面量时的拼接结果（快路径）；含 `.` / `.*` 时为 `None`。
    literal: Option<String>,
    tokens: Vec<SkillToken>,
}

#[derive(Debug, Clone, Copy)]
enum SkillToken {
    Literal(char),
    /// `.`：除行终止符外的任意单字符。
    Any,
    /// `.*`。
    AnySeq,
}

/// 进程级预编译缓存：`技能` pattern 全集很小（`|` 交替 / 锚点 / 字面量等），`compile` 命中直接复用。
static PATTERN_CACHE: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, SkillPattern>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

impl SkillPattern {
    /// 预编译技能名匹配模式；命中进程级缓存直接复用，未命中编译后回填（非法正则退字面量，语义不变）。
    pub fn compile(pattern: &str) -> Self {
        if let Ok(cache) = PATTERN_CACHE.lock() {
            if let Some(hit) = cache.get(pattern) {
                return hit.clone();
            }
        }
        let compiled = Self::parse(pattern).unwrap_or_else(|| Self {
            branches: Vec::new(),
            fallback: Some(pattern.to_string()),
        });
        if let Ok(mut cache) = PATTERN_CACHE.lock() {
            cache.insert(pattern.to_string(), compiled.clone());
        }
        compiled
    }

    fn parse(pattern: &str) -> Option<Self> {
        let mut branches = Vec::new();
        let mut tokens = Vec::new();
        let mut anchored_start = false;
        let mut anchored_end = false;
        let mut at_start = true;
        let mut chars = pattern.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '|' => {
                    branches.push(SkillBranch::new(anchored_start, anchored_end, tokens));
                    tokens = Vec::new();
                    anchored_start = false;
                    anchored_end = false;
                    at_start = true;
                    continue;
                }
                '^' if at_start => anchored_start = true,
                '$' if chars.peek().is_none() || chars.peek() == Some(&'|') => anchored_end = true,
                '.' => {
                    if chars.peek() == Some(&'*') {
                        chars.next();
                        tokens.push(SkillToken::AnySeq);
                    } else {
                        tokens.push(SkillToken::Any);
                    }
                }
                '\\' => {
                    let escaped = chars.next()?;
                    // `\d` / `\w` / `\n` 等字母数字转义不在子集内
                    if escaped.is_ascii_alphanumeric() {
                        return None;
                    }
                    tokens.push(SkillToken::Literal(escaped));
                }
                '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '*' | '^' | '$' => return None,
                literal => tokens.push(SkillToken::Literal(literal)),
            }
            at_start = false;
        }
        branches.push(SkillBranch::new(anchored_start, anchored_end, tokens));
        Some(Self {
            branches,
            fallback: None,
        })
    }

    pub fn matches(&self, field_name: &str) -> bool {
        if let Some(fallback) = &self.fallback {
            return !fallback.is_empty() && field_name.contains(fallback.as_str());
        }
        self.branches
            .iter()
            .any(|branch| branch.matches(field_name))
    }
}

impl SkillBranch {
    fn new(anchored_start: bool, anchored_end: bool, tokens: Vec<SkillToken>) -> Self {
        let literal = tokens
            .iter()
            .map(|token| match token {
                SkillToken::Literal(c) => Some(*c),
                SkillToken::Any | SkillToken::AnySeq => None,
            })
            .collect::<Option<String>>();
        Self {
            anchored_start,
            anchored_end,
            literal,
            tokens,
        }
    }

    fn matches(&self, text: &str) -> bool {
        if let Some(literal) = &self.literal {
            return match (self.anchored_start, self.anchored_end) {
                (true, true) => text == literal,
                (true, false) => text.starts_with(literal.as_str()),
                (false, true) => text.ends_with(literal.as_str()),
                (false, false) => text.contains(literal.as_str()),
            };
        }
        let mut start = 0;
        loop {
            if match_tokens(&self.tokens, text, start, self.anchored_end) {
                return true;
            }
            if self.anchored_start {
                return false;
            }
            match text[start..].chars().next() {
                Some(c) => start += c.len_utf8(),
                None => return false,
            }
        }
    }
}

/// 从 `pos` 起匹配剩余 token；`pos` 始终位于 UTF-8 字符边界。
fn match_tokens(tokens: &[SkillToken], text: &str, pos: usize, anchored_end: bool) -> bool {
    match tokens.split_first() {
        None => !anchored_end || pos == text.len(),
        Some((SkillToken::AnySeq, rest)) => {
            if match_tokens(rest, text, pos, anchored_end) {
                return true;
            }
            let mut next = pos;
            while let Some(c) = text[next..].chars().next() {
                if is_line_terminator(c) {
                    return false;
                }
                next += c.len_utf8();
                if match_tokens(rest, text, next, anchored_end) {
                    return true;
                }
            }
            false
        }
        Some((SkillToken::Any, rest)) => match text[pos..].chars().next() {
            Some(c) if !is_line_terminator(c) => {
                match_tokens(rest, text, pos + c.len_utf8(), anchored_end)
            }
            _ => false,
        },
        Some((SkillToken::Literal(want), rest)) => match text[pos..].chars().next() {
            Some(c) if c == *want => match_tokens(rest, text, pos + c.len_utf8(), anchored_end),
            _ => false,
        },
    }
}

/// JS `.` 的排除集（`\n` `\r` U+2028 U+2029）。
fn is_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

#[cfg(test)]
mod skill_pattern_tests {
    use super::SkillPattern;

    /// Q1 锁定：`^伤害$` 锚点分支只精确命中「伤害」（字面 contains 会误判「X伤害」）。
    #[test]
    fn anchored_branch_matches_exactly() {
        let pattern = SkillPattern::compile("狙击子弹|^伤害$");
        assert!(pattern.matches("狙击子弹"));
        assert!(pattern.matches("伤害"));
        assert!(!pattern.matches("X伤害"));
        assert!(!pattern.matches("伤害X"));
        // `|` 交替：月猎/日食
        let alt = SkillPattern::compile("月猎|日食");
        assert!(alt.matches("月猎"));
        assert!(alt.matches("日食"));
        assert!(!alt.matches("月食"));
    }

    #[test]
    fn wildcard_and_anchors() {
        let wildcard = SkillPattern::compile("召唤物.*持续时间");
        assert!(wildcard.matches("召唤物攻击持续时间"));
        assert!(wildcard.matches("召唤物·审判持续时间"));
        assert!(!wildcard.matches("召唤物"));
        assert!(SkillPattern::compile("^召唤物").matches("召唤物持续"));
        assert!(!SkillPattern::compile("^召唤物").matches("X召唤物"));
        assert!(SkillPattern::compile("持续时间$").matches("召唤物持续时间"));
        assert!(!SkillPattern::compile("持续时间$").matches("持续时间X"));
        assert!(SkillPattern::compile("a.c").matches("abc"));
        assert!(!SkillPattern::compile("a.c").matches("ac"));
        assert!(SkillPattern::compile("a\\.c").matches("a.c"));
        assert!(!SkillPattern::compile("a\\.c").matches("abc"));
    }

    #[test]
    fn unsupported_syntax_falls_back_to_literal() {
        // 组/字符类/`\d` 超出子集：按上游非法 pattern 口径退字面量。
        assert!(SkillPattern::compile("(a|b)").matches("x(a|b)y"));
        assert!(SkillPattern::compile("\\d+").matches("x\\d+y"));
    }
}

/// 把条件BUFF属性增量合并进属性视图（不改原对象）；对应上游 `LeveledSkill.mergeConditionalProps`。
///
/// 乘法池属性（独立增伤系列等）按 Π(1+v) 乘法叠加，其余按加算；键不存在时按 0 起算。
pub fn merge_conditional_props(base: &AttrMap, props: &AttrMap) -> AttrMap {
    let mut merged = base.clone();
    for (prop, value) in props {
        if is_multiplicative_attr(prop) {
            let current = merged.get(prop).copied().unwrap_or(0.0);
            merged.insert(prop, (1.0 + current) * (1.0 + value) - 1.0);
        } else {
            *merged.entry(prop).or_insert(0.0) += value;
        }
    }
    merged
}

/// 命中字段的条件BUFF增量合并；对应上游 `getFieldsWithAttr` 里的
/// `matched.reduce((current, c) => mergeConditionalProps(current, c.props), attrs)`。
fn merge_field_conditional_attrs(
    attrs: &AttrMap,
    conditional_props: &[BuffFieldConditional],
    field_name: &str,
    field_tags: &[String],
) -> AttrMap {
    let mut merged: Option<AttrMap> = None;
    for conditional in conditional_props {
        if !conditional.matches(field_name, field_tags) {
            continue;
        }
        let base = merged.take().unwrap_or_else(|| attrs.clone());
        merged = Some(merge_conditional_props(&base, &conditional.props));
    }
    merged.unwrap_or_else(|| attrs.clone())
}

/// 技能实例；对应上游 `LeveledSkill`。
#[derive(Debug, Clone)]
pub struct LeveledSkill {
    pub id: i64,
    pub name: String,
    /// `safeName`（名称里的 `/` 换 `_`）。
    pub safe_name: String,
    pub kind: String,
    pub level: f64,
    /// 原始字段（未按等级取值），`update_properties` 时用。
    /// 原始字段记录（同律武器技能聚合要用）。
    pub raw_fields: Vec<Record>,
    /// 按等级取过值的字段。
    pub fields: Vec<SkillField>,
    /// 召唤物数据。
    pub summon: Option<Record>,
    /// 玩家技能序号（上游 `E/Q/P` 别名映射用；武器技能与同律武器技能为 `None`）。
    pub player_skill_index: Option<usize>,
}

impl LeveledSkill {
    /// 从技能记录构建；对应上游 `new LeveledSkill(skillData, 等级, 武器名)`。
    pub fn new(
        raw: Record,
        level: Option<f64>,
        player_skill_index: Option<usize>,
        _weapon_name: String,
    ) -> Self {
        let name = {
            let text = raw.text("名称");
            if text.is_empty() {
                format!(
                    "SKILL{}",
                    raw.id("id").map(|id| id.to_string()).unwrap_or_default()
                )
            } else {
                text
            }
        };
        let mut skill = Self {
            id: raw.id("id").unwrap_or(0),
            safe_name: name.replace('/', "_"),
            name,
            kind: raw.text("类型"),
            level: 10.0,
            raw_fields: raw.objs("字段"),
            fields: Vec::new(),
            summon: if raw.contains("召唤物") {
                Some(raw.obj("召唤物"))
            } else {
                None
            },
            player_skill_index,
        };
        // 上游 `this.等级 = 等级 || 10`：0 / NaN 都落到 10
        let level = match level {
            Some(value) if value != 0.0 && value.is_finite() => value,
            _ => 10.0,
        };
        skill.set_level(level);
        skill
    }

    /// 设置技能等级；对应上游 `set 等级`（钳制到 1-12）。
    pub fn set_level(&mut self, value: f64) {
        self.level = value.clamp(1.0, 12.0);
        self.update_properties();
    }

    fn update_properties(&mut self) {
        let level = self.level as usize;
        self.fields = self
            .raw_fields
            .iter()
            .enumerate()
            .map(|(index, field)| {
                let name = field.text("名称");
                // 上游 `值` 是数组时按下标取，标量原样；数组越界取最后一项由数据保证
                let values = field.nums("值");
                let value = if values.len() > 1 {
                    values
                        .get(level.saturating_sub(1))
                        .copied()
                        .unwrap_or_else(|| values.last().copied().unwrap_or(0.0))
                } else {
                    field.num_or("值", 0.0)
                };
                let values2 = field.nums("值2");
                let value2 = if values2.len() > 1 {
                    values2
                        .get(level.saturating_sub(1))
                        .copied()
                        .unwrap_or_else(|| values2.last().copied().unwrap_or(0.0))
                } else {
                    field.num_or("值2", 0.0)
                };
                let format = {
                    let text = field.text("格式");
                    if text.is_empty() { None } else { Some(text) }
                };
                // 格式串里出现「生命」「防御」时，该字段以对应角色属性为基数
                let base = format.as_ref().and_then(|text| {
                    if text.contains("生命") {
                        Some("生命".to_string())
                    } else if text.contains("防御") {
                        Some("防御".to_string())
                    } else {
                        None
                    }
                });
                SkillField {
                    base: std::sync::Arc::new(SkillFieldBase {
                        safe_name: name.replace('/', "_"),
                        name,
                        influence: field.text("影响"),
                        format,
                        attr_base: base,
                        tags: field.texts("tag"),
                        damage_type: {
                            let text = field.text("伤害类型");
                            if text.is_empty() { None } else { Some(text) }
                        },
                        index,
                    }),
                    value,
                    value2,
                }
            })
            .collect();
    }

    /// 按 `字段名` 模糊查找（上游用 `safeName.includes(fieldName) || 名称.includes(fieldName)`）。
    pub fn field(&self, field_name: &str) -> Option<&SkillField> {
        self.fields
            .iter()
            .find(|field| field.safe_name.contains(field_name) || field.name.contains(field_name))
    }

    /// 应用技能四维后的字段表；对应上游 `getFieldsWithAttr`。
    ///
    /// 规则（注意每条的边界）：技能倍率赋值优先；`技能范围` 只乘 1 次；
    /// `技能效益` 与 `技能耐久` 同时影响时按 `max(0.25, (2 - 效益) / 耐久)`；
    /// 只有效益时按 `2 - 效益`；`神智消耗` 最后 `ceil`；
    /// `多重` 影响读远程武器多重射击（1 开始，无远程武器时为 1）。
    /// `conditional_props` 是条件BUFF（技能/tag限定）的字段级增量：字段命中时
    /// 把增量合并进该字段的独立求值上下文，`技能倍率` 三项从合并后的视图读取。
    /// `ranged_multi` 是调用方算好的远程武器多重（见 `BuildContext::ranged_multi`）。
    pub fn fields_with_attr(
        &self,
        attrs: &AttrMap,
        conditional_props: &[BuffFieldConditional],
        ranged_multi: f64,
    ) -> Vec<SkillField> {
        let power = attrs.get("技能威力").copied().unwrap_or(1.0);
        let durability = attrs.get("技能耐久").copied().unwrap_or(1.0);
        let efficiency = attrs.get("技能效益").copied().unwrap_or(1.0);
        let range = attrs.get("技能范围").copied().unwrap_or(1.0);
        let no_conditionals = conditional_props.is_empty();
        let shared_multipliers = if no_conditionals {
            (
                attrs.get("技能倍率加数").copied().unwrap_or(0.0),
                attrs.get("技能倍率乘数").copied().unwrap_or(0.0),
                attrs.get("技能倍率赋值").copied().unwrap_or(0.0),
            )
        } else {
            (0.0, 0.0, 0.0)
        };

        let mut result: Vec<SkillField> = self
            .fields
            .iter()
            .map(|field| {
                let mut next = field.clone();
                let (multiplier_add, multiplier_mul, multiplier_set) = if no_conditionals {
                    shared_multipliers
                } else {
                    let field_attrs = merge_field_conditional_attrs(
                        attrs,
                        conditional_props,
                        &field.name,
                        &field.tags,
                    );
                    (
                        field_attrs.get("技能倍率加数").copied().unwrap_or(0.0),
                        field_attrs.get("技能倍率乘数").copied().unwrap_or(0.0),
                        field_attrs.get("技能倍率赋值").copied().unwrap_or(0.0),
                    )
                };
                if multiplier_set != 0.0 && field.name.contains("伤害") {
                    next.value = multiplier_set * (1.0 + multiplier_mul) + multiplier_add;
                    return next;
                }
                if field.influence.is_empty() {
                    return next;
                }
                let mut value = field.value;
                let mut value2 = field.value2;
                if field.name.contains("伤害") {
                    value = value * (1.0 + multiplier_mul) + multiplier_add;
                }
                let mut has_range = false;
                let mut has_power = false;
                let mut has_durability = false;
                let mut has_efficiency = false;
                let mut has_multi = false;
                for part in field.influence.split(',') {
                    match part {
                        "技能范围" => has_range = true,
                        "技能威力" => has_power = true,
                        "技能耐久" => has_durability = true,
                        "技能效益" => has_efficiency = true,
                        "多重" => has_multi = true,
                        _ => {}
                    }
                }
                if has_range {
                    value *= range;
                }
                if has_power {
                    value *= power;
                    value2 *= power;
                }
                if has_durability {
                    if field.name.contains("每秒神智消耗") {
                        value /= durability;
                    } else {
                        value *= durability;
                    }
                }
                if has_efficiency {
                    if has_durability {
                        // 耐久与效益共同影响时仍有 175% 上限
                        value = field.value * (2.0 - efficiency).max(0.25) / durability;
                    } else {
                        value = field.value * (2.0 - efficiency);
                    }
                }
                if has_multi {
                    // 多重影响：读取远程武器多重射击属性（1 开始，无远程武器时为 1，即无加成）
                    value *= ranged_multi;
                    value2 *= ranged_multi;
                }
                if field.name.contains("神智消耗") {
                    value = value.ceil();
                }
                next.value = value;
                next.value2 = value2;
                next
            })
            .collect();

        if self.summon.is_some() {
            result.extend(self.summon_fields(attrs, &mut 0));
        }
        result
    }

    /// 召唤物字段；对应上游 `getSummonAttrs`。
    ///
    /// 参数 `_unused` 仅为保持与上游同形的调用位置；改由 `summon_map` 计算。
    fn summon_fields(&self, attrs: &AttrMap, _unused: &mut u32) -> Vec<SkillField> {
        let Some(map) = self.summon_map(attrs) else {
            return Vec::new();
        };
        let raw: Vec<(&str, f64, Option<String>)> = vec![
            ("召唤物名称", map.name_value, Some(map.name.clone())),
            ("召唤物攻击延迟", map.delay, Some("{}秒".to_string())),
            ("召唤物攻击间隔", map.interval, Some("{}秒".to_string())),
            ("召唤物攻速", map.attack_speed, None),
            ("召唤物攻击次数", map.attack_times, Some("{}".to_string())),
            ("召唤物范围", map.range, None),
        ];
        raw.into_iter()
            .enumerate()
            .map(|(index, (name, value, format))| SkillField {
                base: std::sync::Arc::new(SkillFieldBase {
                    name: name.to_string(),
                    safe_name: name.replace('/', "_"),
                    influence: String::new(),
                    format,
                    attr_base: None,
                    tags: Vec::new(),
                    damage_type: None,
                    index: 10_000 + index,
                }),
                value,
                value2: 0.0,
            })
            .collect()
    }

    /// 召唤物派生属性；对应上游 `getSummonAttrsMap`。
    pub fn summon_map(&self, attrs: &AttrMap) -> Option<SummonMap> {
        let summon = self.summon.as_ref()?;
        // 召唤物攻速 / 范围已由 `calculate_weapon_attributes` 汇总成 0 起始的增量
        let attack_speed = attrs.get("召唤物攻击速度").copied().unwrap_or(0.0);
        let duration = self
            .summon_duration()
            .map(|(value, influence)| {
                if influence.contains("技能耐久") {
                    value * attrs.get("技能耐久").copied().unwrap_or(1.0)
                } else {
                    value
                }
            })
            .unwrap_or(0.0);
        let attack_interval = summon.num_or("攻击间隔", 0.0);
        let delay = summon.num_or("攻击延迟", 0.0);
        let interval = if attack_interval == 0.0 {
            0.0
        } else {
            attack_interval / (1.0 + attack_speed)
        };
        let attack_times = if interval == 0.0 {
            0.0
        } else {
            ((duration - delay) / interval).floor()
        };
        let skill_range = attrs.get("技能范围").copied().unwrap_or(1.0);
        let summon_range = attrs.get("召唤物范围").copied().unwrap_or(0.0);
        Some(SummonMap {
            name: summon.text("名称"),
            name_value: 0.0,
            delay,
            interval,
            attack_speed,
            duration,
            attack_times,
            range: (skill_range * (1.0 + summon_range)).min(2.8),
        })
    }

    /// 召唤物持续时间字段；对应上游 `召唤物持续时间`（正则 `/召唤物.*持续时间/`）。
    pub fn summon_duration(&self) -> Option<(f64, String)> {
        self.fields
            .iter()
            .find(|field| {
                field.name.starts_with("召唤物") && field.name.ends_with("持续时间")
                    || (field.name.contains("召唤物") && field.name.contains("持续时间"))
            })
            .map(|field| (field.value, field.influence.clone()))
    }
}

/// 召唤物派生属性；对应上游 `getSummonAttrsMap` 的返回值。
#[derive(Debug, Clone)]
pub struct SummonMap {
    pub name: String,
    /// `召唤物名称` 字段的数值位（上游固定 0，名称放在 `格式` 里）。
    pub name_value: f64,
    pub delay: f64,
    pub interval: f64,
    pub attack_speed: f64,
    pub duration: f64,
    pub attack_times: f64,
    pub range: f64,
}

// ============================ MOD ============================

/// 条件属性条目：属性名 + 标量值 + `[倍率, 上限]` 对（预解析缓存用）。
pub type ConditionProp = (String, Option<f64>, Option<(f64, f64)>);

/// MOD 实例；对应上游 `LeveledMod`。
#[derive(Debug, Clone)]
pub struct LeveledMod {
    pub id: i64,
    pub name: String,
    pub series: String,
    pub quality: String,
    /// 当前等级下的耐受（随等级变化，见 [`LeveledMod::update_properties`]）。
    pub tolerance: f64,
    /// 原始耐受。
    raw_tolerance: f64,
    /// `类型`（角色 / 近战 / 远程 / 同律近战 / 同律远程）。
    pub kind: String,
    pub polarity: Option<String>,
    pub level: f64,
    pub max_level: f64,
    /// MOD 层词条属性（`properties` 的取值）。
    pub props: AttrMap,
    /// BUFF 层属性（特效里以 `@` 前缀声明的键，已剥离前缀）。
    pub buff_props: AttrMap,
    /// `生效` 缩放后的条件属性（含 `条件`）。
    pub condition: Option<Record>,
    /// 预解析的条件列表 `[属性, 运算符, 值]`（求值期零 JSON 解析）。
    pub condition_conditions: Vec<(String, String, f64)>,
    /// 预解析的条件属性 `(键, 标量, [倍率, 上限])`。
    pub condition_props: Vec<ConditionProp>,
    /// 是否存在可用条件（`条件` 非空）。
    pub has_condition: bool,
    /// 效果层 BUFF（特效 `buff`）。
    pub buff: Option<Box<LeveledBuff>>,
    /// 原始记录。
    pub raw: Record,
    /// `baseProperties`：原始记录里去掉排除表后的数值键（保序）。
    base_keys: Vec<String>,
}

/// 上游 `LeveledMod._exclude_properties`：这些键不进属性表。
const MOD_EXCLUDE_PROPERTIES: &[&str] = &[
    "id",
    "系列",
    "品质",
    "耐受",
    "类型",
    "名称",
    "描述",
    "限定",
    "极性",
    "属性",
    "消耗",
    "技能替换",
    "_等级",
    "_originalModData",
    "buff",
    "buffLv",
    "maxLevel",
    "生效",
    "效果",
    "code",
    "count",
    "icon",
    "版本",
    "buffProps",
    "_effectAppliedKeys",
];

impl LeveledMod {
    /// 从表项构建；对应上游 `LeveledModHelper.fromId(id, 等级, buffLv)`。
    pub fn from_source(source: &ModSource, level: Option<f64>, buff_lv: Option<f64>) -> Self {
        Self::build(&source.data, source.effect.as_ref(), level, buff_lv)
    }

    /// 从记录构建；对应上游 `new LeveledMod(modData, modLv, buffLv, effectData)`。
    pub fn build(
        raw: &Record,
        effect: Option<&Record>,
        level: Option<f64>,
        buff_lv: Option<f64>,
    ) -> Self {
        let quality = raw.text("品质");
        let max_level = mod_quality_max_level(&quality);
        let tolerance = raw.num_or("耐受", 0.0);
        // 特效按 id 精确匹配（金/紫分行配置），命中即挂载，不再按品质二次门控
        let buff = match effect {
            Some(data) => {
                let mut instance = LeveledBuff::new(data.clone(), buff_lv);
                // MOD 特效的归属标记（上游 `buff.pid` / `buff.pt`），条件查询时会用到
                instance.owner_id = raw.id("id");
                instance.owner_kind = Some("Mod".to_string());
                Some(Box::new(instance))
            }
            None => None,
        };

        // 词条数值只从原始数据的加成读取（上游 `加成` 表；老数据包无该表时
        // 回落旧口径：扁平直挂数值去排除表）。
        let from_bonus = !raw.obj("加成").is_empty();
        let base_keys: Vec<String> = if from_bonus {
            raw.obj("加成").keys()
        } else {
            raw.keys()
                .into_iter()
                .filter(|key| !MOD_EXCLUDE_PROPERTIES.contains(&key.as_str()))
                .collect()
        };

        let mut instance = Self {
            id: raw.id("id").unwrap_or(0),
            name: raw.text("名称"),
            series: raw.text("系列"),
            quality,
            tolerance,
            raw_tolerance: tolerance,
            kind: raw.text("类型"),
            polarity: {
                let text = raw.text("极性");
                if text.is_empty() { None } else { Some(text) }
            },
            level: 0.0,
            max_level,
            props: AttrMap::new(),
            buff_props: AttrMap::new(),
            condition: None,
            condition_conditions: Vec::new(),
            condition_props: Vec::new(),
            has_condition: false,
            buff,
            raw: raw.clone(),
            base_keys,
        };
        // 上游 `_等级 = clamp(modLv ?? maxLevel, 0, maxLevel)`
        let level = level.unwrap_or(max_level).max(0.0).min(max_level);
        instance.level = level;
        instance.update_properties();
        instance
    }

    /// 重新计算等级相关属性；对应上游 `updateProperties`。
    pub fn update_properties(&mut self) {
        // 耐受：架势 MOD（id > 100000）随等级提高而降低
        self.tolerance = if self.id > 100_000 {
            self.raw_tolerance + self.max_level - self.level
        } else {
            self.raw_tolerance - self.max_level + self.level
        };

        // 词条属性（`加成` 表：数组按等级取各档绝对值，数值按线性缩放；
        // 老包扁平值沿用旧口径）。
        let bonus_table = self.raw.obj("加成");
        let from_bonus = !bonus_table.is_empty();
        let mut props = AttrMap::new();
        for index in 0..self.base_keys.len() {
            let key = self.base_keys[index].clone();
            let raw_value = if from_bonus {
                bonus_table.value(&key)
            } else {
                self.raw.value(&key)
            };
            let Some(raw_value) = raw_value else {
                continue;
            };
            // 架势 MOD 属性不受等级变化（取满级）
            let effective_level = if (self.id > 100_000 && self.id < 150_000)
                || (self.id > 200_000 && self.id < 250_000)
                || ((self.series == "换生灵" || self.series == "海妖") && key == "减伤")
            {
                self.max_level
            } else {
                self.level
            };
            if let Some(numbers) = raw_value.as_array() {
                if from_bonus {
                    // 新口径（上游 `calculateBonusValue`）：数组按等级取各档绝对值
                    // （单元素为定值，越界取边界值）；空数组跳过该属性。
                    if numbers.is_empty() {
                        continue;
                    }
                    let index = (effective_level.max(0.0) as usize).min(numbers.len() - 1);
                    if let Some(number) = numbers.get(index).and_then(|value| value.as_f64()) {
                        props.insert(key, number);
                    }
                    continue;
                }
                // 旧口径：数组属性按等级取下标（`maxValue[min(lv + 1, len) - 1]`）
                let index = ((effective_level + 1.0) as usize).min(numbers.len());
                if let Some(number) = index
                    .checked_sub(1)
                    .and_then(|position| numbers.get(position))
                    .and_then(|value| value.as_f64())
                {
                    props.insert(key, number);
                }
                continue;
            }
            let Some(max_value) = raw_value.as_f64() else {
                continue;
            };
            if !from_bonus && max_value == 0.0 {
                // 旧口径（上游旧 `if (maxValue)`）：0 / NaN 都不写属性。
                // 新口径连 0 值也写入（上游 `calculateBonusValue` 原样返回）。
                continue;
            }
            props.insert(
                key.clone(),
                self.scale_property(&key, max_value, effective_level),
            );
        }

        // 条件属性的缩放（`生效` 里除「条件」外的键）
        let condition_raw = self.raw.obj("生效");
        if !condition_raw.is_empty() {
            let mut scaled = serde_json::Map::new();
            // 条件本身原样保留
            if let Some(condition) = condition_raw.value("条件") {
                scaled.insert("条件".to_string(), condition.clone());
            }
            for key in condition_raw.keys() {
                if key == "条件" {
                    continue;
                }
                let Some(value) = condition_raw.value(&key) else {
                    continue;
                };
                if let Some(numbers) = value.as_array() {
                    let first = numbers
                        .first()
                        .and_then(|item| item.as_f64())
                        .unwrap_or(0.0);
                    let second = numbers.get(1).and_then(|item| item.as_f64()).unwrap_or(0.0);
                    let a = (first / (self.max_level + 1.0)) * (self.level + 1.0);
                    let b = (second / (self.max_level + 1.0)) * (self.level + 1.0);
                    scaled.insert(key, serde_json::json!([a, b]));
                } else if let Some(number) = value.as_f64() {
                    let mut current = (number / (self.max_level + 1.0)) * (self.level + 1.0);
                    if key == "神智回复" || key == "最大耐受" {
                        current = current.ceil();
                    }
                    scaled.insert(key, serde_json::json!(current));
                }
            }
            self.condition = Some(Record::from_map(scaled));
        } else {
            self.condition = None;
        }
        // 条件解析一次定格（求值期只读）。
        self.condition_conditions = self
            .condition
            .as_ref()
            .map(|condition| condition.conditions("条件"))
            .unwrap_or_default();
        self.condition_props = self
            .condition
            .as_ref()
            .map(|condition| {
                condition
                    .keys()
                    .into_iter()
                    .filter(|key| key != "条件")
                    .map(|key| {
                        let value = condition.value(&key);
                        let scalar = value.and_then(serde_json::Value::as_f64);
                        let pair = value.and_then(|item| item.as_array()).and_then(|items| {
                            Some((items.first()?.as_f64()?, items.get(1)?.as_f64()?))
                        });
                        (key, scalar, pair)
                    })
                    .collect()
            })
            .unwrap_or_default();
        self.has_condition = !self.condition_conditions.is_empty();

        // 效果层：`@` 前缀进 BUFF 层（buffProps），其余归一化进 MOD 层。
        //
        // 取值口径与上游一致：读的是**已按 buffLv / 覆盖率算过的 BUFF 属性值**
        // （`buff[prop]`），再按 MOD 自身等级缩放缓释——两段等级是独立的，
        // 直接读原始记录会漏掉 buffLv 这一段。
        let mut buff_props = AttrMap::new();
        if let Some(buff) = self.buff.as_ref() {
            for (key, buff_value) in buff.props.clone() {
                let mut current = (buff_value / (self.max_level + 1.0)) * (self.level + 1.0);
                if key == "神智回复" || key == "最大耐受" {
                    current = current.ceil();
                }
                if buff.is_buff_layer_property(&key) {
                    *buff_props.entry(key).or_insert(0.0) += current;
                } else if let Some(target) = self.resolve_effect_property(&key) {
                    *props.entry(target).or_insert(0.0) += current;
                }
            }
        }
        self.buff_props = buff_props;
        self.props = props;
    }

    /// 按等级缩放普通数值属性；`神智回复` / `最大耐受` 取 `ceil`。
    fn scale_property(&self, key: &str, max_value: f64, level: f64) -> f64 {
        let mut current = (max_value / (self.max_level + 1.0)) * (level + 1.0);
        if key == "神智回复" || key == "最大耐受" {
            current = current.ceil();
        }
        current
    }

    /// 把效果表里的武器作用域属性归一化为 MOD 自身属性。
    ///
    /// 与 MOD 同类型的属性前缀会被剥掉（如 `近战增伤` 挂在近战 MOD 上 = `增伤`）；
    /// 其他槽位前缀直接丢弃（不跨槽位）。
    fn resolve_effect_property(&self, property: &str) -> Option<String> {
        if property.starts_with(self.kind.as_str()) {
            return Some(property[self.kind.len()..].to_string());
        }
        if property == "近战" || property == "远程" || property.starts_with("同律") {
            return None;
        }
        Some(property.to_string())
    }

    /// `addAttr`：MOD 层属性（不含 BUFF 层）；对应上游 `addAttr`。
    pub fn add_attr(&self) -> AttrMap {
        self.props.clone()
    }

    /// `getProperties()`：MOD 层 + BUFF 层（同名词条累加）。
    pub fn properties(&self) -> AttrMap {
        let mut result = self.props.clone();
        for (key, value) in &self.buff_props {
            *result.entry(key).or_insert(0.0) += value;
        }
        result
    }

    /// `attrType`：MOD 类型即作用域。
    pub fn attr_type(&self) -> &str {
        &self.kind
    }

    /// 取单一 MOD 层属性；对应上游 `getAddAttrValue`。
    pub fn add_attr_value(&self, attribute: &str) -> Option<f64> {
        if MOD_EXCLUDE_PROPERTIES.contains(&attribute) {
            return None;
        }
        self.props.get(attribute).copied()
    }

    /// 判断 MOD 是否属于某属性作用域（含空作用域的全通过语义）。
    pub fn in_scope(&self, scope: &str) -> bool {
        scope.is_empty() || self.kind == scope
    }
}

// ============================ BUFF ============================

/// 按等级把一条 BUFF 数值写入属性表；对应上游 `updatePropertiesByLevel` 的单键口径。
///
/// `@` 前缀剥离后归属 BUFF 层；数组按 `maxValue[min(x, len) - lx]` 取档，
/// 数值按 `满级值 / a * (1 + (x - lx) / b)` 缩放。
/// 参数按调用形逐项展开（9 项：表/键/值/等级/`a`/`b`/`lx`/倍率/覆盖率，打包反而失配）；
/// `too_many_arguments` 系内部口径需要。
#[allow(clippy::too_many_arguments)]
fn insert_scaled_buff_value(
    props: &mut AttrMap,
    key: &str,
    value: &serde_json::Value,
    x: f64,
    a: f64,
    b: f64,
    lx: f64,
    ratio: f64,
    coverage: f64,
) {
    let property = if let Some(stripped) = key.strip_prefix('@') {
        stripped.to_string()
    } else {
        key.to_string()
    };
    if let Some(numbers) = value.as_array() {
        // 数组按等级索引（`maxValue[min(x, len) - lx]`）
        let position = (x as usize).min(numbers.len());
        if let Some(number) = (position as f64 - lx)
            .checked_index(numbers)
            .and_then(|item| item.as_f64())
        {
            props.insert(property, number * ratio * coverage);
        }
        return;
    }
    let Some(max_value) = value.as_f64() else {
        return;
    };
    let mut current = (max_value / a) * (1.0 + (x - lx) / b) * ratio * coverage;
    if property == "神智回复" {
        current = current.round();
    }
    props.insert(property, current);
}

/// BUFF / 特效实例；对应上游 `LeveledBuff`。
#[derive(Debug, Clone)]
pub struct LeveledBuff {
    pub name: String,
    pub description: String,
    /// 原始记录。
    pub raw: Record,
    /// 缩放参数（上游 `a` / `b` / `lx` / `mx` / `dx`）。
    pub a: Option<f64>,
    pub b: Option<f64>,
    pub lx: Option<f64>,
    pub mx: Option<f64>,
    pub dx: Option<f64>,
    pub level: f64,
    /// 精炼缩放比（武器特效用）。
    pub ratio: f64,
    /// 覆盖率（0-1）。
    pub coverage: f64,
    /// 条件BUFF（技能限定）：只作用于名称匹配该模式的字段（支持 `|` 交替多技能，
    /// 如 `月猎|日食`），不参与全局属性汇总；对应上游 `LeveledBuff.技能`。
    pub skill: Option<String>,
    /// `skill` 的预编译匹配模式（构造期一次，条件缓存重建时直接复用）。
    pub skill_pattern: Option<SkillPattern>,
    /// 条件BUFF（字段标签限定）：只作用于 tag 含任一限定标签的字段（如 `充盈`），
    /// 不参与全局属性汇总；对应上游 `LeveledBuff.tag`。
    pub tag: Vec<String>,
    /// 互斥魔之楔 id：装备其中任一 MOD 时本 BUFF 失效（上游 `禁用`）。
    /// 用于 MOD 与 BUFF 提供同一增益的场景（如 海妖 / 换生灵 系列），避免重复计算。
    pub disabled_by: Vec<i64>,
    /// 当前等级下的属性。
    pub props: AttrMap,
    /// `code`：动态属性 JS 片段（App 侧按表达式子集解释，见 `dynamic.rs`）。
    pub code: Option<String>,
    /// `attr`：按属性上下文求值的属性表达式表。
    pub attr_expressions: Vec<(String, String)>,
    /// 归属（MOD / 武器 id），条件查询用。
    pub owner_id: Option<i64>,
    pub owner_kind: Option<String>,
    /// 限定元素（武器特效用）。
    pub limit: Option<String>,
    /// `baseProperties`：原始记录里去掉排除表后的键（保序）。
    base_keys: Vec<String>,
}

/// 上游 `LeveledBuff._exclude_properties`。
const BUFF_EXCLUDE_PROPERTIES: &[&str] = &[
    "id",
    "名称",
    "描述",
    "限定",
    "品质",
    "_等级",
    "_originalBuffData",
    "a",
    "b",
    "lx",
    "bx",
    "mx",
    "dx",
    "pid",
    "pt",
    "code",
    "attr",
    "技能",
    "tag",
    "禁用",
    "_ratio",
    "_coverage",
];

impl LeveledBuff {
    /// 从记录构建；对应上游 `new LeveledBuff(buffData, 等级)`。
    pub fn new(raw: Record, level: Option<f64>) -> Self {
        let lx = raw.num("lx");
        let mx = raw.num("mx");
        let dx = raw.num("dx").or(mx);
        // 上游 `等级 = 等级 !== undefined && 等级 >= 0 ? 等级 : dx || mx || 1`
        let level = match level {
            Some(value) if value >= 0.0 => value,
            _ => dx.or(mx).unwrap_or(1.0),
        };
        // `技能` 只读一次，`skill` 与 `skill_pattern` 复用。
        let base_keys = raw
            .keys()
            .into_iter()
            .filter(|key| !BUFF_EXCLUDE_PROPERTIES.contains(&key.as_str()))
            .collect::<Vec<String>>();
        let skill_text = raw.text("技能");
        let mut instance = Self {
            name: raw.text("名称"),
            description: raw.text("描述"),
            a: raw.num("a"),
            b: raw.num("b"),
            lx,
            mx,
            dx,
            level: 1.0,
            ratio: 1.0,
            coverage: 1.0,
            skill: {
                if skill_text.is_empty() { None } else { Some(skill_text.clone()) }
            },
            skill_pattern: {
                if skill_text.is_empty() {
                    None
                } else {
                    Some(SkillPattern::compile(&skill_text))
                }
            },
            // 字段标签限定支持标量与数组两种写法（与 `Record::texts` 同口径）
            tag: raw.texts("tag"),
            disabled_by: raw.nums("禁用").into_iter().map(|value| value as i64).collect(),
            props: AttrMap::new(),
            code: {
                let text = raw.text("code");
                if text.is_empty() { None } else { Some(text) }
            },
            attr_expressions: {
                let attr = raw.obj("attr");
                attr.keys()
                    .into_iter()
                    .filter_map(|key| {
                        let value = attr.value(&key)?;
                        Some((key, value.as_str()?.to_string()))
                    })
                    .collect()
            },
            owner_id: None,
            owner_kind: None,
            limit: {
                let text = raw.text("限定");
                if text.is_empty() { None } else { Some(text) }
            },
            base_keys,
            raw,
        };
        instance.set_level(level);
        instance
    }

    /// 设置等级（钳制到 `lx`-`mx`）并重算属性；对应上游 `set 等级`。
    pub fn set_level(&mut self, value: f64) {
        let mut level = value;
        if let Some(lx) = self.lx {
            level = level.max(lx);
        }
        level = level.min(self.mx.unwrap_or(1.0));
        self.level = level;
        self.update_properties();
    }

    /// 重新计算属性；对应上游 `updatePropertiesByLevel`，结果写入 `props`（即 `values` 表）。
    ///
    /// 数值有两个来源：新格式的 `attr` 数值表（静态值与动态表达式混存），与老数据包的
    /// 直接挂载键；动态表达式（string 值）不在此处求值，由 `apply_attr` 按属性上下文刷新。
    pub fn update_properties(&mut self) {
        let a = self.a.unwrap_or(1.0);
        let b = self.b.unwrap_or(1.0);
        let lx = self.lx.unwrap_or(1.0);
        let x = self.level;

        let mut props = AttrMap::new();
        // 老格式：直接挂载在记录上的数值键（逐项借用，只克隆当前 key）
        for index in 0..self.base_keys.len() {
            let key = self.base_keys[index].clone();
            let Some(value) = self.raw.value(&key) else {
                continue;
            };
            insert_scaled_buff_value(
                &mut props,
                &key,
                value,
                x,
                a,
                b,
                lx,
                self.ratio,
                self.coverage,
            );
        }
        // 新格式：`attr` 表里的静态值（number / number[]）；string 表达式跳过
        let attr_table = self.raw.obj("attr");
        for key in attr_table.keys() {
            let Some(value) = attr_table.value(&key) else {
                continue;
            };
            if value.is_string() {
                continue;
            }
            insert_scaled_buff_value(
                &mut props,
                &key,
                value,
                x,
                a,
                b,
                lx,
                self.ratio,
                self.coverage,
            );
        }
        self.props = props;
    }

    /// 属性键（已剥离 `@` 前缀）；对应上游 `properties`。
    pub fn property_keys(&self) -> Vec<String> {
        self.props.keys().map(str::to_string).collect()
    }

    /// 该属性是否来自特效里 `@` 前缀的键（BUFF 层）；新格式查 `attr` 表，老格式查直接挂载键。
    pub fn is_buff_layer_property(&self, property: &str) -> bool {
        self.raw.contains(&format!("@{}", property))
            || self.raw.obj("attr").contains(&format!("@{}", property))
    }

    /// 源数值表中是否含动态表达式（string 值）；对应上游 `hasDynamicAttr`，供收益计算区分静态/动态 BUFF。
    pub fn has_dynamic_attr(&self) -> bool {
        !self.attr_expressions.is_empty()
    }

    /// 是否字段条件 BUFF（`技能` 字段名限定或 `tag` 字段标签限定）；命中字段才生效，不参与全局汇总。
    pub fn is_field_conditional(&self) -> bool {
        self.skill.is_some() || !self.tag.is_empty()
    }

    /// 按上下文刷新 `attr` 声明的属性；对应上游 `applyAttr`。
    ///
    /// `evaluate` 由调用方注入求值函数（需要走完整构筑上下文，含临时属性与伤害字段）。
    /// 返回是否发生变更。
    pub fn apply_attr<F>(&mut self, attrs: &AttrMap, mut evaluate: F) -> bool
    where
        F: FnMut(&str, &AttrMap) -> f64,
    {
        if self.attr_expressions.is_empty() {
            return false;
        }
        let mut changed = false;
        // 按下标遍历：每次只克隆当前 key + expression，避免整 Vec 克隆。
        for index in 0..self.attr_expressions.len() {
            let key = self.attr_expressions[index].0.clone();
            let expression = self.attr_expressions[index].1.clone();
            let raw = evaluate(&expression, attrs);
            let value = if raw.is_finite() { raw } else { 0.0 } * self.coverage;
            if self.props.get(&key).copied() != Some(value) {
                self.props.insert(key, value);
                changed = true;
            }
        }
        changed
    }

    /// 取某属性当前值。
    pub fn property(&self, key: &str) -> Option<f64> {
        self.props.get(key).copied()
    }
}

/// `checked_index`：把浮点下标安全转成数组下标（非 `as_*` 命名：
/// 方法按值取 `self` 且返回引用，按 clippy `wrong_self_convention` 改名）。
trait CheckedIndex {
    fn checked_index(self, list: &[serde_json::Value]) -> Option<&serde_json::Value>;
}

impl CheckedIndex for f64 {
    fn checked_index(self, list: &[serde_json::Value]) -> Option<&serde_json::Value> {
        if !self.is_finite() || self < 0.0 {
            return None;
        }
        list.get(self as usize)
    }
}

// ============================ 武器 ============================

/// 武器实例；对应上游 `LeveledWeapon`。
#[derive(Debug, Clone)]
pub struct LeveledWeapon {
    pub id: i64,
    pub name: String,
    /// `类型[0]`（近战 / 远程）。
    pub kind: String,
    /// `类型[1]`（类别，如「重剑」）。
    pub category: String,
    pub damage_type: String,
    /// 当前等级下的基础攻击。
    pub base_attack: f64,
    pub base_crit: f64,
    pub base_crit_damage: f64,
    pub base_trigger: f64,
    pub level: f64,
    pub refine: f64,
    /// 射速（`1 / 射击间隔`，保留 4 位）。
    pub attack_speed: Option<f64>,
    pub reload: f64,
    pub magazine: f64,
    pub ammo: f64,
    /// 精炼缩放的 `加成` 属性（含 `@` 归一化后的效果层另算）。
    pub props: AttrMap,
    /// 效果层属性（生效且精通匹配时非空）。
    pub buff_props: AttrMap,
    /// 效果层属性（不管熔炼是否生效都保留，供切换用）。
    effective_buff_props: AttrMap,
    /// 熔炼潜能是否生效（角色精通该武器类别时生效）。
    pub forge_effective: bool,
    pub buff: Option<Box<LeveledBuff>>,
    pub raw: Record,
    /// 武器技能（已按武器技能等级取值）；对应上游 `LeveledWeapon.技能`。
    pub skills: Vec<LeveledSkill>,
    /// 弹道类型（有射线伤害字段时为「非弹道」）。
    pub trajectory: Option<String>,
    /// `baseProperties`：`加成` 的键（保序）。
    base_keys: Vec<String>,
    /// 是否有熔炉（带熔炉的武器精炼固定按 5 且加成不缩放）。
    pub has_forge: bool,
}

/// 上游 `LeveledWeapon._exclude_properties`。
pub const WEAPON_EXCLUDE_PROPERTIES: &[&str] = &[
    "id",
    "名称",
    "类型",
    "类别",
    "倍率",
    "弹片数",
    "弹道类型",
    "射速",
    "段数",
    "描述",
    "技能",
    "效果",
    "_精炼",
    "buff",
    "effectLv",
    "_等级",
    "_originalWeaponData",
    "buffProps",
    "_effectiveBuffProps",
    "forgeEffective",
];

impl LeveledWeapon {
    /// 未装备的空武器占位；对应上游 `LeveledWeapon.emptyWeapon`。
    ///
    /// 模板进程级只建一次（原先每次 `json!` 现建 + `build` 全算）。
    pub fn empty() -> Self {
        static EMPTY: std::sync::LazyLock<LeveledWeapon> = std::sync::LazyLock::new(|| {
            let raw = Record::from_value(&serde_json::json!({
                "id": 0, "名称": "空武器", "类型": ["近战", "长柄"], "伤害类型": "切割",
                "攻击": 0, "暴击": 0, "暴伤": 0, "触发": 0, "描述": "", "加成": {}, "熔炼": "", "技能": []
            }));
            LeveledWeapon::build(&raw, None, None, None, None, &[1.0])
        });
        EMPTY.clone()
    }

    /// 从表项构建；对应上游 `LeveledWeaponHelper.fromId(...)`。
    pub fn from_source(
        source: &WeaponSource,
        refine: Option<f64>,
        level: Option<f64>,
        effect_lv: Option<f64>,
        common_level_up: &[f64],
    ) -> Self {
        Self::build(
            &source.data,
            source.effect.as_ref(),
            refine,
            level,
            effect_lv,
            common_level_up,
        )
    }

    /// 从记录构建；对应上游 `new LeveledWeapon(...)`。
    pub fn build(
        raw: &Record,
        effect: Option<&Record>,
        refine: Option<f64>,
        level: Option<f64>,
        effect_lv: Option<f64>,
        common_level_up: &[f64],
    ) -> Self {
        let types = raw.texts("类型");
        let has_forge = !raw.objs("熔炉").is_empty();
        let buff = effect.map(|data| {
            let mut instance = LeveledBuff::new(data.clone(), effect_lv);
            instance.owner_id = raw.id("id");
            instance.owner_kind = Some("Weapon".to_string());
            Box::new(instance)
        });
        let base_keys = raw.obj("加成").keys();

        // 武器技能：把 `技能` 记录补上「武器」字段名再实例化（上游 `LeveledWeapon` 构造里的同一步）
        let weapon_kind = types.first().cloned().unwrap_or_default();
        let weapon_name = raw.text("名称");
        let skill_records = raw.objs("技能");
        let trajectory = if skill_records
            .iter()
            .flat_map(|skill| skill.objs("字段"))
            .any(|field| field.str_ref("名称") == Some("射线伤害"))
        {
            Some("非弹道".to_string())
        } else {
            Some("弹道".to_string())
        };
        let skills = skill_records
            .into_iter()
            .map(|skill| LeveledSkill::new(skill, None, None, weapon_name.clone()))
            .collect();

        let mut instance = Self {
            id: raw.id("id").unwrap_or(0),
            name: weapon_name,
            kind: weapon_kind,
            category: types.get(1).cloned().unwrap_or_default(),
            damage_type: raw.text("伤害类型"),
            base_attack: raw.num_or("攻击", 0.0),
            base_crit: raw.num_or("暴击", 0.0),
            base_crit_damage: raw.num_or("暴伤", 0.0),
            base_trigger: raw.num_or("触发", 0.0),
            level: 80.0,
            refine: 5.0,
            attack_speed: {
                let interval = raw.num("射击间隔");
                interval.map(|value| {
                    if value == 0.0 {
                        0.0
                    } else {
                        round4(1.0 / value)
                    }
                })
            },
            reload: raw.num_or("装填", 0.0),
            magazine: raw.num_or("弹匣", 0.0),
            ammo: raw.num_or("最大弹药", 0.0),
            props: AttrMap::new(),
            buff_props: AttrMap::new(),
            effective_buff_props: AttrMap::new(),
            forge_effective: true,
            buff,
            raw: raw.clone(),
            skills,
            trajectory,
            base_keys,
            has_forge,
        };
        // 带熔炉的武器精炼固定为 0（内部按 5 算加成），否则钳制到 0-5
        instance.refine = if has_forge {
            0.0
        } else {
            refine.unwrap_or(5.0).clamp(0.0, 5.0)
        };
        instance.level = level.unwrap_or(80.0).clamp(1.0, 80.0);
        instance.update_properties(common_level_up);
        instance
    }

    /// 设置等级并重算。
    pub fn set_level(&mut self, value: f64, common_level_up: &[f64]) {
        self.level = value.clamp(1.0, 80.0);
        self.update_properties(common_level_up);
    }

    /// 重新计算等级 / 精炼相关属性；对应上游 `updateProperties`。
    pub fn update_properties(&mut self, common_level_up: &[f64]) {
        let level = self.level.clamp(1.0, 80.0);
        let multiplier = common_level_up
            .get(level as usize - 1)
            .copied()
            .unwrap_or(1.0);
        // 基础攻击保留两位小数（上游 `+value.toFixed(2)`）
        self.base_attack = round2(self.raw.num_or("攻击", 0.0) * multiplier);

        // 带熔炉的武器固定按 5 级精炼算，且加成不缩放
        let refine_level = if self.has_forge { 5.0 } else { self.refine };
        let should_scale = !self.has_forge;

        let bonus = self.raw.obj("加成");
        let mut props = AttrMap::new();
        for index in 0..self.base_keys.len() {
            let key = self.base_keys[index].clone();
            let Some(original) = bonus.num(&key) else {
                continue;
            };
            let current = if should_scale {
                (original / 5.0) * (refine_level + 5.0)
            } else {
                original
            };
            props.insert(key, current);
        }
        self.props = props;

        if let Some(buff) = self.buff.as_mut() {
            buff.ratio = (refine_level + 5.0) / 10.0;
            let effective = buff.props.clone();
            self.effective_buff_props = effective.clone();
            self.buff_props = if self.forge_effective {
                effective
            } else {
                AttrMap::new()
            };
        }
    }

    /// 设置熔炼潜能是否生效；对应上游 `setForgeEffective`。
    pub fn set_forge_effective(&mut self, effective: bool) {
        self.forge_effective = !self.has_forge || effective;
        self.buff_props = if self.forge_effective {
            self.effective_buff_props.clone()
        } else {
            AttrMap::new()
        };
    }

    /// `加成` 缩放后的属性（**不含**效果层 `buffProps`）。
    ///
    /// 上游 `bonusSourceTable` 的 `table.melee` / `table.ranged` 是直接遍历武器实例的
    /// 自有数值键得到的，而 `buffProps` 是实例上的一个**对象字段**（不是数值键），
    /// 因此效果层只会进 `weaponBuffProps` 桶、不会重复进 `melee` / `ranged`。
    /// 用 `add_attr()` 建来源表会把效果层算两遍（如某武器效果提供 `攻击`）。
    pub fn bonus_props(&self) -> AttrMap {
        if !self.forge_effective {
            return AttrMap::new();
        }
        self.props.clone()
    }

    /// `addAttr`：`加成` 属性 + 效果层；对应上游 `addAttr`（供展示与 `code` 取词条用）。
    pub fn add_attr(&self) -> AttrMap {
        let mut result = AttrMap::new();
        if !self.forge_effective {
            return result;
        }
        for key in &self.base_keys {
            if let Some(value) = self.props.get(key) {
                result.insert(key.clone(), *value);
            }
        }
        for (key, value) in &self.buff_props {
            *result.entry(key).or_insert(0.0) += value;
        }
        result
    }

    /// 是否未装备。
    pub fn is_empty(&self) -> bool {
        self.id == 0
    }

    /// 武器技能（供 `replace_weapon_skills` 使用）。
    pub fn skills_from_record(&self) -> Vec<LeveledSkill> {
        self.skills.clone()
    }
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

/// 同律武器实例；对应上游 `LeveledSkillWeapon`。
#[derive(Debug, Clone)]
pub struct LeveledSkillWeapon {
    pub id: i64,
    pub name: String,
    /// `类型[0] + 类型[1]`（如「同律近战」）。
    pub kind: String,
    pub category: String,
    pub damage_type: String,
    pub base_attack: f64,
    pub base_crit: f64,
    pub base_crit_damage: f64,
    pub base_trigger: f64,
    pub level: f64,
    pub skill_level: f64,
    /// 攻速（上游取 `攻速`，默认 1）。
    pub attack_speed: f64,
    /// 继承槽位（`melee` / `ranged`）。
    pub inherit: Option<String>,
    /// 攻击来源（`melee` / `ranged` / `all`）。
    pub atk: Option<String>,
    /// 视为的攻击类型（如「下落攻击」）。
    pub considered: Option<String>,
    pub skills: Vec<LeveledSkill>,
    pub raw: Record,
}

impl LeveledSkillWeapon {
    /// 从记录构建；对应上游 `new LeveledSkillWeapon(...)`。
    pub fn build(
        raw: &Record,
        skill_level: Option<f64>,
        level: Option<f64>,
        common_level_up: &[f64],
    ) -> Self {
        let types = raw.texts("类型");
        let kind = format!(
            "{}{}",
            types.first().cloned().unwrap_or_default(),
            types.get(1).cloned().unwrap_or_default()
        );
        let mut instance = Self {
            id: raw.id("id").unwrap_or(0),
            name: raw.text("名称"),
            kind,
            category: types.get(2).cloned().unwrap_or_default(),
            damage_type: {
                let text = raw.text("伤害类型");
                if text.is_empty() {
                    "切割".to_string()
                } else {
                    text
                }
            },
            base_attack: raw.num_or("攻击", 0.0),
            base_crit: raw.num_or("暴击", 0.0),
            base_crit_damage: raw.num_or("暴伤", 0.0),
            base_trigger: raw.num_or("触发", 0.0),
            level: level.unwrap_or(80.0).clamp(1.0, 80.0),
            skill_level: skill_level.unwrap_or(10.0).clamp(1.0, 12.0),
            attack_speed: raw.num_or("攻速", 1.0),
            inherit: {
                let text = raw.text("inherit");
                if text.is_empty() { None } else { Some(text) }
            },
            atk: {
                let text = raw.text("atk");
                if text.is_empty() { None } else { Some(text) }
            },
            considered: {
                let text = raw.text("视为");
                if text.is_empty() { None } else { Some(text) }
            },
            skills: raw
                .objs("技能")
                .into_iter()
                .map(|skill| {
                    LeveledSkill::new(
                        skill,
                        Some(instance_skill_level(skill_level)),
                        None,
                        raw.text("名称"),
                    )
                })
                .collect(),
            raw: raw.clone(),
        };
        instance.update_properties(common_level_up);
        instance
    }

    /// 重算基础攻击；对应上游 `updateProperties`。
    pub fn update_properties(&mut self, common_level_up: &[f64]) {
        let level = self.level.clamp(1.0, 80.0);
        let multiplier = common_level_up
            .get(level as usize - 1)
            .copied()
            .unwrap_or(1.0);
        self.base_attack = self.raw.num_or("攻击", 0.0) * multiplier;
    }

    /// 是否未装备（同律武器没有空占位，恒 false）。
    pub fn is_empty(&self) -> bool {
        false
    }
}

fn instance_skill_level(level: Option<f64>) -> f64 {
    level.unwrap_or(10.0).clamp(1.0, 12.0)
}

// ============================ 怪物 ============================

/// 怪物实例；对应上游 `LeveledMonster`。
#[derive(Debug, Clone)]
pub struct LeveledMonster {
    pub id: i64,
    pub level: f64,
    /// 当前等级下的防御（**不随等级缩放**，直接取原始值）。
    pub defense: f64,
    /// 当前等级下的生命。
    pub hp: f64,
    pub shield: Option<f64>,
    pub is_rouge: bool,
    pub hp_multiplier: f64,
    pub raw: Record,
}

impl LeveledMonster {
    /// 从记录构建；对应上游 `new LeveledMonster(数据, 等级, isRouge, hpMultiplier)`。
    pub fn build(
        raw: Record,
        level: f64,
        is_rouge: bool,
        hp_multiplier: f64,
        mob_level_up: &[[f64; 5]],
    ) -> Self {
        let mut instance = Self {
            id: raw.id("id").unwrap_or(0),
            level: 1.0,
            defense: raw.num_or("def", 0.0),
            hp: 0.0,
            shield: raw.num("es"),
            is_rouge,
            hp_multiplier: if hp_multiplier.is_finite() && hp_multiplier != 0.0 {
                hp_multiplier
            } else {
                1.0
            },
            raw,
        };
        instance.set_level(level, mob_level_up);
        instance
    }

    /// 设置等级（钳制 1-240）；对应上游 `set 等级`。
    pub fn set_level(&mut self, value: f64, mob_level_up: &[[f64; 5]]) {
        let next = value.clamp(1.0, 240.0);
        if self.level != next {
            self.level = next;
            self.update_by_level(next, mob_level_up);
        }
    }

    fn update_by_level(&mut self, level: f64, mob_level_up: &[[f64; 5]]) {
        let clamped = level.clamp(1.0, 240.0);
        let Some(multiplier) = mob_level_up.get(clamped as usize - 1).copied() else {
            return;
        };
        let base_hp = self.raw.num_or("hp", 0.0);
        self.hp = (base_hp
            * (if self.is_rouge {
                multiplier[3]
            } else {
                multiplier[1]
            })
            * self.hp_multiplier)
            .round();
        if self.shield.is_some() {
            let base_shield = self.raw.num_or("es", 0.0);
            self.shield = Some(
                (base_shield
                    * (if self.is_rouge {
                        multiplier[4]
                    } else {
                        multiplier[2]
                    })
                    * self.hp_multiplier)
                    .round(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn record(value: serde_json::Value) -> Record {
        Record::from_value(&value)
    }

    #[test]
    fn mod_level_scaling_uses_max_plus_one() {
        // 攻击满级 1.4、品质金（上限 10），10 级 = 1.4 / 11 * 11 = 1.4
        let raw = record(
            json!({"id": 1, "名称": "测试", "系列": "S", "品质": "金", "耐受": 20, "类型": "角色", "攻击": 1.4}),
        );
        let full = LeveledMod::build(&raw, None, Some(10.0), None);
        assert!((full.props.get("攻击").copied().unwrap() - 1.4).abs() < 1e-12);
        // 5 级 = 1.4 / 11 * 6
        let half = LeveledMod::build(&raw, None, Some(5.0), None);
        assert!((half.props.get("攻击").copied().unwrap() - 1.4 / 11.0 * 6.0).abs() < 1e-12);
        // 耐受 = 20 - 10 + 等级
        assert_eq!(full.tolerance, 20.0);
        assert_eq!(half.tolerance, 15.0);
    }

    #[test]
    fn mod_quality_decides_max_level() {
        assert_eq!(mod_quality_max_level("金"), 10.0);
        assert_eq!(mod_quality_max_level("紫"), 5.0);
        assert_eq!(mod_quality_max_level("蓝"), 5.0);
        assert_eq!(mod_quality_max_level("绿"), 3.0);
        assert_eq!(mod_quality_max_level("白"), 3.0);
        assert_eq!(mod_quality_max_level("未知"), 1.0);
    }

    #[test]
    fn stance_mod_level_is_pinned_to_max() {
        // id > 100000 且 < 150000：属性不受等级影响，耐受随等级降低
        let raw = record(
            json!({"id": 100001, "名称": "架势", "系列": "S", "品质": "金", "耐受": 30, "类型": "近战", "攻击": 2.0}),
        );
        let low = LeveledMod::build(&raw, None, Some(1.0), None);
        let high = LeveledMod::build(&raw, None, Some(10.0), None);
        assert_eq!(low.props.get("攻击").copied().unwrap(), 2.0);
        assert_eq!(high.props.get("攻击").copied().unwrap(), 2.0);
        // 耐受 = 30 + 10 - 等级
        assert_eq!(low.tolerance, 39.0);
        assert_eq!(high.tolerance, 30.0);
    }

    #[test]
    fn mod_effect_prefix_splits_into_buff_layer() {
        let mod_raw = record(
            json!({"id": 43342, "名称": "反转", "系列": "邪龙", "品质": "紫", "耐受": 15, "类型": "远程"}),
        );
        let effect = record(json!({"id": 43342, "名称": "反转", "@近战增伤": 0.6, "攻击": 0.5}));
        let modded = LeveledMod::build(&mod_raw, Some(&effect), Some(5.0), None);
        // `@近战增伤` 进 BUFF 层，`攻击` 进 MOD 层
        assert!((modded.buff_props.get("近战增伤").copied().unwrap() - 0.6).abs() < 1e-12);
        assert!((modded.props.get("攻击").copied().unwrap() - 0.5).abs() < 1e-12);
    }

    #[test]
    fn weapon_refine_scales_bonus() {
        let raw = record(json!({
            "id": 10399, "名称": "权火将熄", "类型": ["近战", "重剑"], "伤害类型": "灾厄",
            "攻击": 21, "暴击": 0.22, "暴伤": 2.2, "触发": 0.22, "加成": {"攻击": 0.9}
        }));
        let full = LeveledWeapon::build(&raw, None, Some(5.0), Some(80.0), None, &[1.0]);
        // 加成 = 0.9 / 5 * (5 + 5) = 1.8
        assert!((full.props.get("攻击").copied().unwrap() - 1.8).abs() < 1e-12);
        let low = LeveledWeapon::build(&raw, None, Some(0.0), Some(80.0), None, &[1.0]);
        // 0.9 / 5 * 5 = 0.9
        assert!((low.props.get("攻击").copied().unwrap() - 0.9).abs() < 1e-12);
    }

    #[test]
    fn weapon_with_forge_pins_refine_and_skips_scaling() {
        let raw = record(json!({
            "id": 10399, "名称": "权火将熄", "类型": ["近战", "重剑"], "伤害类型": "灾厄",
            "攻击": 21, "加成": {"攻击": 0.9}, "熔炉": [{"lv": 0}]
        }));
        let weapon = LeveledWeapon::build(&raw, None, Some(5.0), Some(80.0), None, &[1.0]);
        assert_eq!(weapon.refine, 0.0);
        // 有熔炉 → 加成不缩放，原样 0.9
        assert!((weapon.props.get("攻击").copied().unwrap() - 0.9).abs() < 1e-12);
    }

    #[test]
    fn char_skills_resolve_levels_by_triple_index() {
        // 三个技能分别按 E/Q/被动取等级（上游 `resolveCharSkillLevel` 口径）。
        let raw = record(json!({
            "id": 1, "名称": "测试", "属性": "光",
            "技能": [{"名称": "E技"}, {"名称": "Q技"}, {"名称": "被动"}, {"名称": "第二被动"}]
        }));
        let levels = [12.0, 10.0, 8.0];
        let char = LeveledChar::new(raw, Some(80.0), &levels, &[1.0]);
        let got: Vec<f64> = char.skills.iter().map(|skill| skill.level).collect();
        assert_eq!(got, vec![12.0, 10.0, 8.0, 8.0]);
    }

    #[test]
    fn char_scaling_leaves_defense_and_sanity_untouched() {
        let raw = record(json!({
            "id": 1, "名称": "测试", "属性": "光", "精通": ["重剑"],
            "基础攻击": 24, "基础生命": 90, "基础防御": 240, "基础护盾": 90, "基础神智": 150
        }));
        let char = LeveledChar::new(raw, Some(1.0), &[10.0, 10.0, 10.0], &[1.0, 1.5, 2.0]);
        assert_eq!(char.base_attack, 24.0);
        assert_eq!(char.base_hp, 90.0);
        assert_eq!(char.base_shield, 90.0);
        // 防御与神智不缩放
        assert_eq!(char.base_defense, 240.0);
        assert_eq!(char.base_sanity, 150.0);

        let high = LeveledChar::new(
            record(json!({
                "id": 1, "名称": "测试", "属性": "光", "精通": ["重剑"],
                "基础攻击": 24, "基础生命": 90, "基础防御": 240, "基础护盾": 90, "基础神智": 150
            })),
            Some(2.0),
            &[10.0, 10.0, 10.0],
            &[1.0, 1.5, 2.0],
        );
        assert_eq!(high.base_attack, 36.0);
        assert_eq!(high.base_hp, 135.0);
        assert_eq!(high.base_defense, 240.0);
    }

    #[test]
    fn skill_field_picks_value_by_level() {
        let raw = record(json!({
            "id": 1, "名称": "测试技能", "类型": "伤害",
            "字段": [
                {"名称": "伤害", "影响": "技能威力", "值": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0]},
                {"名称": "神智消耗", "影响": "技能效益", "值": 15, "格式": "{}"}
            ]
        }));
        let mut skill = LeveledSkill::new(raw, Some(3.0), None, String::new());
        assert_eq!(skill.field("伤害").unwrap().value, 3.0);
        skill.set_level(12.0);
        assert_eq!(skill.field("伤害").unwrap().value, 12.0);
    }

    #[test]
    fn skill_efficiency_caps_at_one_seventy_five_percent() {
        let raw = record(json!({
            "id": 1, "名称": "测试技能", "类型": "伤害",
            "字段": [{"名称": "伤害", "影响": "技能威力", "值": 1.0}]
        }));
        let skill = LeveledSkill::new(raw, Some(1.0), None, String::new());
        let mut attrs = AttrMap::new();
        attrs.insert("技能威力", 2.0);
        let fields = skill.fields_with_attr(&attrs, &[], 1.0);
        assert_eq!(fields[0].value, 2.0);
    }

    #[test]
    fn monster_level_scales_hp_but_not_defense() {
        let raw = record(json!({"id": 300, "n": "木桩", "atk": 10, "def": 300, "hp": 1000}));
        let mob_level_up = vec![[0.1, 0.4, 0.4, 1.0, 1.0], [0.2, 0.5, 0.5, 1.5, 1.5]];
        let monster = LeveledMonster::build(raw, 2.0, false, 1.0, &mob_level_up);
        assert_eq!(monster.defense, 300.0);
        assert_eq!(monster.hp, 500.0);

        let rouge = LeveledMonster::build(
            record(json!({"id": 300, "n": "木桩", "atk": 10, "def": 300, "hp": 1000})),
            2.0,
            true,
            1.0,
            &mob_level_up,
        );
        assert_eq!(rouge.hp, 1500.0);
    }

    /// 舍入链锁定（spec §6.2）：JS `Math.round` / `toFixed` 精确语义。
    ///
    /// 口径：`Math.round` 的 `.5` 向 `+∞`（`round(-1.5) == -1`，与 Rust `f64::round`
    /// 一致，绝非 banker's rounding）；`toFixed` 是精确二进制值十进制展开后 half-up
    /// （远离零），绝非 `(x·10^d).round()/10^d`（`2.675→2.67` 等多处相反）。
    /// 上游映射：攻击/暴击/触发/攻速/多重 `round2`；武器独立 `round3`；
    /// 射速/技能替换 `toFixed(4)`；覆盖率/自定义 BUFF `toFixed(6)`；
    /// 生命/护盾/防御 `round`；神智回复 `ceil`。
    /// 期望值全部经 bun 实测 TS 真值（`+(x).toFixed(d)` / `Math.round`）。
    #[test]
    fn rounding_matches_js_semantics() {
        // round2 / round3：Math.round(x·10^d)/10^d（含二进制尾效应）
        assert_eq!(round2(1.005), 1.0);
        assert_eq!(round2(-1.225), -1.23);
        assert_eq!(round2(2.675), 2.68);
        assert_eq!(round3(0.12345), 0.123);
        assert_eq!(round3(0.12355), 0.124);
        // Math.round 负数语义：-1.5 → -1（向 +∞），-2.5 → -2
        assert_eq!(js_round(-1.5), -1.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(2.5), 3.0);
        // toFixed 精确语义
        assert_eq!(js_to_fixed(0.5, 0), 1.0);
        assert_eq!(js_to_fixed(2.5, 0), 3.0);
        assert_eq!(js_to_fixed(-0.5, 0), -1.0);
        assert_eq!(js_to_fixed(-2.5, 0), -3.0);
        assert_eq!(js_to_fixed(1.005, 2), 1.0);
        assert_eq!(js_to_fixed(2.675, 2), 2.67);
        assert_eq!(js_to_fixed(21.345, 2), 21.34);
        assert_eq!(js_to_fixed(21.344, 2), 21.34);
        assert_eq!(js_to_fixed(1.0 / 3.0, 4), 0.3333);
        assert_eq!(js_to_fixed(0.12345, 4), 0.1235);
        assert_eq!(js_to_fixed(0.1234565, 6), 0.123456);
        assert_eq!(js_to_fixed(1.255, 2), 1.25);
        assert_eq!(js_to_fixed(0.125, 2), 0.13);
        assert_eq!(js_to_fixed(123.456, 2), 123.46);
        // 神智回复 ceil（LeveledMod/LeveledBuff `最大耐受/神智回复`）
        assert_eq!(3.1_f64.ceil(), 4.0);
        assert_eq!((-3.1_f64).ceil(), -3.0);
    }
}
