//! 升华效果载荷的装配应用。
//!
//! 映射（`transcendBuffs` / `transcendSkills` / 词条解析）仍由 TS `collectTranscendEffects`
//! 单一实现；Rust 只把请求携带的可序列化载荷应用到装配结果：
//! 合成 BUFF 追加、技能等级二次装配（U126b 改由 `E/Q/P技能等级` 属性池驱动）、
//! 技能替换（角色技能与武器技能共用）。
//!
//! 字段语义逐条对齐 TS `applyTranscendSkillReplacement` / `applySkillFieldEdits`。

use std::collections::{BTreeMap, HashSet};

use serde_json::Value;

use crate::config::{TranscendBuff, TranscendSkillReplacement};
use crate::models::{LeveledBuff, LeveledSkill};
use crate::record::Record;

/// 基础等级 + 三键加成：先加总再一次 round 并钳制 1-30；对应 TS `resolveEffectiveSkillLevels`。
pub fn add_skill_levels(base: [f64; 3], bonus: [f64; 3]) -> [f64; 3] {
    let mut levels = base;
    for (slot, extra) in levels.iter_mut().zip(bonus) {
        *slot = (*slot + extra).round().clamp(1.0, 30.0);
    }
    levels
}

/// 按载荷顺序追加合成 BUFF：等级取载荷值（TS 恒为 1），覆盖率非空时缩放属性。
///
/// 合成 BUFF 不在数据表里，装配期不能按名查表；`LeveledBuff::new` 直接吃原始记录。
/// `excluded` 是收益移除口径（与潜质 / 魔灵同语义：按名整体剔除）。
pub fn append_buffs(target: &mut Vec<LeveledBuff>, buffs: &[TranscendBuff], excluded: &[String]) {
    for buff in buffs {
        let name = buff.data.text("名称");
        if excluded.iter().any(|item| *item == name) {
            continue;
        }
        let mut leveled = LeveledBuff::new(buff.data.clone(), Some(buff.level));
        if let Some(coverage) = buff.coverage {
            leveled.coverage = coverage;
            leveled.update_properties();
        }
        target.push(leveled);
    }
}

/// 按源技能 id 替换角色技能（原技能等级与序号保留）。
pub fn apply_skill_replacements(
    skills: &mut [LeveledSkill],
    replacements: &BTreeMap<i64, TranscendSkillReplacement>,
) {
    if replacements.is_empty() {
        return;
    }
    for skill in skills.iter_mut() {
        let Some(replacement) = replacements.get(&skill.id) else {
            continue;
        };
        *skill = apply_replacement(skill, replacement);
    }
}

/// 把替换载荷应用到源技能：身份缺省回落，`字段` 整表替换，否则 `移除字段` + `字段改写`。
pub fn apply_replacement(source: &LeveledSkill, replacement: &TranscendSkillReplacement) -> LeveledSkill {
    let mut map = source.raw.as_map().clone();
    if let Some(id) = replacement.id {
        map.insert("id".to_string(), serde_json::json!(id));
    }
    if let Some(name) = &replacement.name {
        map.insert("名称".to_string(), Value::String(name.clone()));
    }
    if let Some(kind) = &replacement.kind {
        map.insert("类型".to_string(), Value::String(kind.clone()));
    }
    if let Some(description) = &replacement.description {
        map.insert("描述".to_string(), Value::String(description.clone()));
    }
    let fields = match &replacement.fields {
        Some(fields) => fields.clone(),
        None => {
            let source_fields = map
                .get("字段")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            apply_field_edits(&source_fields, replacement)
        }
    };
    map.insert("字段".to_string(), Value::Array(fields));
    LeveledSkill::new(
        Record::from_map(map),
        Some(source.level),
        source.player_skill_index,
        String::new(),
    )
}

/// 按字段名移除 / 改写源字段；`字段改写` 中源技能不存在的名字按新增字段处理（需带 `值`）。
fn apply_field_edits(fields: &[Value], replacement: &TranscendSkillReplacement) -> Vec<Value> {
    let removed: HashSet<&str> = replacement
        .removed_fields
        .iter()
        .map(String::as_str)
        .collect();
    let mut result: Vec<Value> = Vec::with_capacity(fields.len());
    for field in fields {
        let Some(object) = field.as_object() else {
            result.push(field.clone());
            continue;
        };
        let name = object.get("名称").and_then(Value::as_str).unwrap_or("");
        if removed.contains(name) {
            continue;
        }
        match replacement.field_edits.iter().find(|(key, _)| key == name) {
            Some((_, patch)) => {
                let mut merged = object.clone();
                for (key, value) in patch {
                    merged.insert(key.clone(), value.clone());
                }
                merged.insert("名称".to_string(), Value::String(name.to_string()));
                result.push(Value::Object(merged));
            }
            None => result.push(field.clone()),
        }
    }
    let existing: HashSet<String> = result
        .iter()
        .filter_map(|field| Some(field.get("名称")?.as_str()?.to_string()))
        .collect();
    for (name, patch) in &replacement.field_edits {
        if existing.contains(name) || !patch.contains_key("值") {
            continue;
        }
        let mut object = patch.clone();
        object.insert("名称".to_string(), Value::String(name.clone()));
        result.push(Value::Object(object));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill_record() -> Record {
        Record::from_map(
            serde_json::json!({
                "id": 100,
                "名称": "源技能",
                "类型": "伤害",
                "描述": "源描述",
                "召唤物": {"名称": "召唤", "攻击延迟": 0.2, "攻击间隔": 1.0},
                "字段": [
                    {"名称": "伤害", "值": [1, 2, 3], "影响": "技能威力"},
                    {"名称": "范围", "值": 1.5}
                ]
            })
            .as_object()
            .expect("对象")
            .clone(),
        )
    }

    fn source_skill() -> LeveledSkill {
        LeveledSkill::new(skill_record(), Some(3.0), Some(1), String::new())
    }

    #[test]
    fn add_skill_levels_clamps_and_rounds() {
        assert_eq!(add_skill_levels([10.0, 10.0, 10.0], [1.0, 0.0, -2.0]), [11.0, 10.0, 8.0]);
        // 上限 30 / 下限 1
        assert_eq!(add_skill_levels([30.0, 1.0, 29.0], [5.0, -5.0, 0.0]), [30.0, 1.0, 29.0]);
        // 非整数增量按四舍五入
        assert_eq!(add_skill_levels([10.0, 10.0, 10.0], [0.4, 0.5, 0.6]), [10.0, 11.0, 11.0]);
    }

    #[test]
    fn append_buffs_supports_numeric_attr_and_coverage() {
        let buff = TranscendBuff::from_json(&serde_json::json!({
            "data": {"名称": "升华测试", "attr": {"攻击": 0.3, "技能威力": "1+1"}},
            "level": 1
        }))
        .expect("BUFF 载荷");
        let mut buffs = Vec::new();
        append_buffs(&mut buffs, &[buff.clone()], &[]);
        assert_eq!(buffs.len(), 1);
        // 数字 attr 按等级 1 原样生效；字符串 attr 进表达式表
        assert_eq!(buffs[0].property("攻击"), Some(0.3));
        assert_eq!(buffs[0].attr_expressions.len(), 1);

        let mut covered = buff.clone();
        covered.coverage = Some(0.5);
        let mut buffs = Vec::new();
        append_buffs(&mut buffs, &[covered], &[]);
        assert_eq!(buffs[0].property("攻击"), Some(0.15));

        // 收益移除口径：同名合成 BUFF 按名剔除
        let mut removed = Vec::new();
        append_buffs(&mut removed, &[buff], &["升华测试".to_string()]);
        assert!(removed.is_empty());
    }

    #[test]
    fn replacement_identity_falls_back_to_source() {
        let source = source_skill();
        let replacement = TranscendSkillReplacement::from_json(&serde_json::json!({"id": 200}))
            .expect("替换载荷");
        let replaced = apply_replacement(&source, &replacement);
        assert_eq!(replaced.id, 200);
        assert_eq!(replaced.name, "源技能");
        assert_eq!(replaced.kind, "伤害");
        assert_eq!(replaced.level, 3.0);
        assert_eq!(replaced.player_skill_index, Some(1));
        // 未给字段改写时源字段原样保留（等级 3 → 取第 3 档）
        assert_eq!(replaced.field("伤害").map(|field| field.value), Some(3.0));
        assert!(replaced.summon.is_some());
    }

    #[test]
    fn replacement_field_edits_remove_rewrite_and_append() {
        let source = source_skill();
        let replacement = TranscendSkillReplacement::from_json(&serde_json::json!({
            "字段改写": {"伤害": {"值": 9.5}},
            "移除字段": ["范围"]
        }))
        .expect("替换载荷");
        let replaced = apply_replacement(&source, &replacement);
        assert_eq!(replaced.field("伤害").map(|field| field.value), Some(9.5));
        assert!(replaced.field("范围").is_none());
        assert_eq!(replaced.name, "源技能");
    }

    #[test]
    fn replacement_field_edits_append_unknown_name_with_value() {
        let source = source_skill();
        let replacement = TranscendSkillReplacement::from_json(&serde_json::json!({
            "字段改写": {"额外伤害": {"值": 2.5}}
        }))
        .expect("替换载荷");
        let replaced = apply_replacement(&source, &replacement);
        assert_eq!(replaced.field("额外伤害").map(|field| field.value), Some(2.5));
    }

    #[test]
    fn replacement_full_fields_replace_source() {
        let source = source_skill();
        let replacement = TranscendSkillReplacement::from_json(&serde_json::json!({
            "名称": "替换技能",
            "字段": [{"名称": "伤害", "值": 7}]
        }))
        .expect("替换载荷");
        let replaced = apply_replacement(&source, &replacement);
        assert_eq!(replaced.name, "替换技能");
        assert_eq!(replaced.fields.len(), 1);
        assert_eq!(replaced.field("伤害").map(|field| field.value), Some(7.0));
        // 召唤物等未列出的键保留
        assert!(replaced.summon.is_some());
    }

    #[test]
    fn apply_skill_replacements_matches_source_id() {
        let mut skills = vec![source_skill()];
        let replacements: BTreeMap<i64, TranscendSkillReplacement> = [(
            100,
            TranscendSkillReplacement::from_json(&serde_json::json!({"字段改写": {"伤害": {"值": 4}}})).expect("载荷"),
        )]
        .into_iter()
        .collect();
        apply_skill_replacements(&mut skills, &replacements);
        assert_eq!(skills[0].field("伤害").map(|field| field.value), Some(4.0));
        // 未命中的技能不受影响
        let mut untouched = vec![source_skill()];
        apply_skill_replacements(&mut untouched, &BTreeMap::new());
        assert_eq!(untouched[0].field("伤害").map(|field| field.value), Some(3.0));
    }
}
