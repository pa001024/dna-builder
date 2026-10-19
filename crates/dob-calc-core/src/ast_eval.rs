//! 表达式求值：目标函数、自定义变量与伤害字段的动态解析。
//!
//! 对应上游 `CharBuild.evaluateAST` → `evaluateAstWithContext` → `evaluate`（L2952-3668）。
//!
//! **与 [`crate::ast_parser`] 的分工**：那个模块是「静态表求值」——调用方把属性 / 技能 /
//! 武器面板预先算成表，引擎只查表。但构筑里的伤害字段**不能预先算**：
//! `[萨麦尔]S级蓄力攻击伤害` 的值取决于该字段的 tag（是否召唤物 / 是否充盈）、
//! 字段上的临时属性（`{转属克:1}`）、以及该字段属于技能还是武器——
//! 这些都要在**求值现场**才能确定。
//!
//! 因此本模块复用 `expr` 的**词法 / 语法分析**（`parse_expression`），自己实现求值：
//! 字段解析时按上游顺序回查技能字段 → 武器面板 → 角色属性，命中伤害字段就现场调
//! [`super::damage`] 算出伤害与防御乘区。这样两边不会漂移，也不重复写一遍解析器。

use std::collections::HashMap;
use std::rc::Rc;

use crate::ast_parser::{AstNode, parse_expression, strip_brackets};

use super::attributes::WeaponAttributes;
use super::context::{BuildContext, WeaponRef};
use super::damage::{DamageCalcOptions, DamageResult};
use super::models::{AttrMap, BuffFieldConditional, is_multiplicative_attr};

/// 求值时的字段临时属性（`[攻击]{增伤:0.2}`）。
pub type TemporaryAttrs = HashMap<String, f64>;

/// 字段引用：共享字段表 + 下标，克隆只加引用计数（避免每次查找深拷贝 `SkillField`）。
#[derive(Clone)]
struct FieldRef {
    fields: Rc<Vec<super::models::SkillField>>,
    index: usize,
}

impl FieldRef {
    #[inline]
    fn get(&self) -> &super::models::SkillField {
        &self.fields[self.index]
    }
}

/// 单次求值会话；对应上游 `evaluateAstWithContext` 的闭包集合。
///
/// 持有可变借用（`getDamage` 需要按字段算伤害，而伤害依赖完整构筑状态），
/// 因此生命周期与 [`BuildContext`] 绑定，不能脱离构筑单独使用。
pub struct Evaluator<'a, 'b> {
    pub context: &'b mut BuildContext<'a>,
    /// 已算好的角色属性（含武器转化）。
    pub attrs: AttrMap,
    /// 武器面板表（键为 `近战` / `远程` / `同律` / 武器技能名）。
    pub weapon_panels: HashMap<String, AttrMap>,
    /// 各技能按当前属性算好的字段表（键为 `safeName`）；按表达式**实际引用到的技能**
    /// 懒建，避免为未使用的技能计算整表。
    skill_fields: HashMap<String, Rc<Vec<super::models::SkillField>>>,
    /// 远程多重（字段 `影响:多重` 用）；装配期一次算好。
    ranged_multi: f64,
    /// 字段查找缓存：`命名空间::字段名` → 共享字段引用。
    field_cache: HashMap<String, Option<FieldRef>>,
    /// 命名空间 → 技能字段表键（装配期一次建表，求值期零线性扫描）。
    skill_keys: HashMap<String, String>,
    /// 命名空间 → 武器面板键（同上）。
    panel_keys: HashMap<String, String>,
    /// 条件BUFF字段级增量（求值会话内固定）；对应上游 `createAstEvalContext` 的 `conditionalProps`。
    conditional_props: Vec<BuffFieldConditional>,
    /// 条件BUFF属性增量缓存：同一字段名在一次求值内只汇总一次（上游 `conditionalBuffCache`）。
    conditional_buff_cache: HashMap<String, Option<AttrMap>>,
    /// 伤害缓存：`字段键::字段名` → 伤害。
    damage_cache: HashMap<String, DamageResult>,
    /// 防御乘区缓存：`是否技能` → 乘区。
    def_cache: HashMap<bool, f64>,
    /// 自定义变量值与解析中标记。
    variable_cache: HashMap<String, f64>,
    resolving_variables: Vec<String>,
    /// 预编译的自定义变量 / 函数体（解析只做一次，求值零解析）。
    variable_asts: HashMap<String, std::sync::Arc<AstNode>>,
    function_asts: HashMap<String, std::sync::Arc<AstNode>>,
    /// 自定义函数。
    functions: HashMap<String, (Vec<String>, String)>,
    resolving_functions: Vec<String>,
    /// 武器细分乘区（普攻/蓄力/… × 增伤/独立增伤）按字段缓存。
    attack_type_cache: HashMap<String, (f64, f64)>,
    /// 自定义函数的形参作用域栈（上游把 `scope` 逐层透传，这里用栈模拟）。
    scope_stack: Vec<HashMap<String, f64>>,
    /// 最近一次求值算出的伤害明细。
    last_damage: Option<DamageResult>,
}
/// 注：历史对齐桩 `EvalOutcome` 已按 spec §6.4 删除（调用方直接用 `Result<f64, String>`）。
impl<'a, 'b> Evaluator<'a, 'b> {
    /// 构造会话；对应上游 `createAstEvalContext`。
    pub fn new(context: &'b mut BuildContext<'a>) -> Self {
        crate::prof!("ast_eval::new");
        // 面板必须用「带 code 改写」的那一份：`applyDynamicAttr` 会改被选武器的面板
        // （如「权火将熄5熔」给同律武器加暴击/暴伤/触发），
        // 直接取静态面板会让 `萨麦尔::暴击` 这类字段读到未被改写的值。
        let attrs = context.calculate_weapon_attributes(None);
        let selected_panel = attrs.panel.clone();
        let weapon_panels = context.all_weapon_panels_with_selected(selected_panel.clone());
        // 条件BUFF字段级增量：技能倍率乘数等属性在字段值计算处应用，需在构建字段列表时传入
        let conditional_props = context.conditional_buff_props_list();
        let ranged_multi = context.ranged_multi(
            weapon_panels
                .get("远程")
                .and_then(|panel| panel.get("多重").copied()),
        );
        let statics = {
            crate::prof!("ast_eval::new_statics");
            context.eval_statics()
        };
        let panel_keys = {
            crate::prof!("ast_eval::new_panel_keys");
            build_panel_keys(context, &weapon_panels)
        };
        let functions = statics.functions;
        let variable_asts = statics.variable_asts;
        let skill_keys = statics.skill_keys;
        let function_asts = statics.function_asts;
        Self {
            context,
            attrs: attrs.char,
            weapon_panels,
            skill_fields: HashMap::new(),
            ranged_multi,
            field_cache: HashMap::new(),
            skill_keys,
            panel_keys,
            conditional_props,
            conditional_buff_cache: HashMap::new(),
            damage_cache: HashMap::new(),
            def_cache: HashMap::new(),
            variable_cache: HashMap::new(),
            resolving_variables: Vec::new(),
            variable_asts,
            function_asts,
            functions,
            resolving_functions: Vec::new(),
            attack_type_cache: HashMap::new(),
            scope_stack: Vec::new(),
            last_damage: None,
        }
    }

    /// 轻量会话：调用方已备好面板快照时用，不重算任何面板。
    ///
    /// 对应上游 `evaluateAST(expr, inputattrs)` 传入 `{...attrs}` 的形态：
    /// `createAstEvalContext` 直接用调用方快照，不调 `calculateWeaponAttributes`。
    /// `apply_buff_attr` 等重入路径必须用此构造，否则经 `new` 重算面板会无限递归。
    pub fn with_panels(
        context: &'b mut BuildContext<'a>,
        attrs: AttrMap,
        weapon_panels: HashMap<String, AttrMap>,
    ) -> Self {
        let skill_keys = build_skill_keys(context);
        let panel_keys = build_panel_keys(context, &weapon_panels);
        Self {
            context,
            attrs,
            weapon_panels,
            skill_fields: HashMap::new(),
            ranged_multi: 1.0,
            field_cache: HashMap::new(),
            skill_keys,
            panel_keys,
            conditional_props: Vec::new(),
            conditional_buff_cache: HashMap::new(),
            damage_cache: HashMap::new(),
            def_cache: HashMap::new(),
            variable_cache: HashMap::new(),
            resolving_variables: Vec::new(),
            variable_asts: HashMap::new(),
            function_asts: HashMap::new(),
            functions: HashMap::new(),
            resolving_functions: Vec::new(),
            attack_type_cache: HashMap::new(),
            scope_stack: Vec::new(),
            last_damage: None,
        }
    }

    /// 求值表达式；对应 `CharBuild.evaluateAST`。
    pub fn evaluate(&mut self, expression: &str) -> Result<f64, String> {
        crate::prof!("ast_eval::evaluate");
        if expression.is_empty() {
            return Ok(0.0);
        }
        let ast = parse_cached(expression)?;
        self.eval(&ast, &TemporaryAttrs::new())
    }

    /// 求值某个节点。
    fn eval(&mut self, node: &AstNode, temporary: &TemporaryAttrs) -> Result<f64, String> {
        match node {
            AstNode::Number(value) => Ok(*value),
            AstNode::Binary {
                operator,
                left,
                right,
            } => {
                let lhs = self.eval(left, temporary)?;
                let rhs = self.eval(right, temporary)?;
                match operator.as_str() {
                    "+" => Ok(lhs + rhs),
                    "-" => Ok(lhs - rhs),
                    "*" => Ok(lhs * rhs),
                    "/" => Ok(if rhs != 0.0 { lhs / rhs } else { 0.0 }),
                    "%" => Ok(if rhs != 0.0 { lhs % rhs } else { 0.0 }),
                    "//" => Ok(if rhs != 0.0 { (lhs / rhs).floor() } else { 0.0 }),
                    other => Err(format!("未知的二元运算符: {}", other)),
                }
            }
            AstNode::Unary { operator, argument } => {
                let value = self.eval(argument, temporary)?;
                match operator.as_str() {
                    "+" => Ok(value),
                    "-" => Ok(-value),
                    // 上游一元运算只有 `+` / `-`；其他符号在解析阶段就被拒
                    other => Err(format!("未知的一元运算符: {}", other)),
                }
            }
            AstNode::Property {
                name,
                namespace,
                force_attr,
            } => {
                let value =
                    self.evaluate_identity(name, namespace.as_deref(), *force_attr, temporary)?;
                if !force_attr {
                    // 自定义变量直接返回（不再乘伤害系数）
                    if namespace.is_none() && self.context.custom_variables.contains_key(name) {
                        return Ok(value);
                    }
                    // 伤害字段要乘默认伤害系数
                    if self.is_damage_skill_field(name, namespace.as_deref()) {
                        return Ok(
                            value * self.member_value(None, namespace.as_deref(), name, temporary)
                        );
                    }
                }
                Ok(value)
            }
            AstNode::Function { name, args, .. } => {
                let values = args
                    .iter()
                    .map(|arg| self.eval(arg, temporary))
                    .collect::<Result<Vec<f64>, String>>()?;
                match name.as_str() {
                    "min" => Ok(values.iter().copied().fold(f64::INFINITY, f64::min)),
                    "max" => Ok(values.iter().copied().fold(f64::NEG_INFINITY, f64::max)),
                    "floor" => Ok(values.first().copied().unwrap_or(f64::NAN).floor()),
                    "ceil" => Ok(values.first().copied().unwrap_or(f64::NAN).ceil()),
                    "or" => Ok(values
                        .iter()
                        .find(|value| **value != 0.0)
                        .copied()
                        .unwrap_or_else(|| values.last().copied().unwrap_or(f64::NAN))),
                    "log" => Ok(values.first().copied().unwrap_or(f64::NAN).ln()),
                    "power" => Ok(values
                        .first()
                        .copied()
                        .unwrap_or(f64::NAN)
                        .powf(values.get(1).copied().unwrap_or(f64::NAN))),
                    "hp" => Ok(self.evaluate_hp(values.first().copied().unwrap_or(f64::NAN))),
                    _ => match self.evaluate_custom_function(name, &values)? {
                        Some(value) => Ok(value),
                        None => Err(format!("未知的函数: {}", name)),
                    },
                }
            }
            AstNode::MemberAccess { object, property } => {
                // 对象部分不乘默认伤害系数，因此单独取原始字段
                let Some((name, namespace, force_attr, field_temporary)) =
                    self.property_context(object, temporary)
                else {
                    let value = self.eval(object, temporary)?;
                    return Ok(value);
                };
                let object_value = self.evaluate_identity(
                    &name,
                    namespace.as_deref(),
                    force_attr,
                    &field_temporary,
                )?;
                // 非伤害字段的成员访问按上游返回对象值本身
                if force_attr || !self.is_damage_skill_field(&name, namespace.as_deref()) {
                    return Ok(object_value);
                }
                Ok(object_value
                    * self.member_value(
                        Some(property),
                        namespace.as_deref(),
                        &name,
                        &field_temporary,
                    ))
            }
            AstNode::TemporaryAttributes { target, attributes } => {
                let merged = self.merge_temporary(attributes, temporary)?;
                self.eval(target, &merged)
            }
        }
    }

    /// 解析属性值；对应上游 `evaluateIdentity`。
    ///
    /// 查找顺序（无命名空间）：自定义变量 → 技能字段 → 角色属性 → 武器属性；
    /// 带命名空间时：技能字段 → 武器属性 → 角色属性。
    fn evaluate_identity(
        &mut self,
        name: &str,
        namespace: Option<&str>,
        force_attr: bool,
        temporary: &TemporaryAttrs,
    ) -> Result<f64, String> {
        // DOT伤害 特殊标识符：无命名空间为全部来源，加命名空间只算该来源
        // （如 角色::DOT伤害 技能分量 / 近战::DOT伤害 近战分量）；对应上游 evaluateIdentity。
        if name == "DOT伤害" {
            return Ok(self.context.dot_damage(namespace));
        }
        if !force_attr && namespace.is_none() {
            // 自定义函数的形参（上游 `currentScope`，优先于一切查表）
            if let Some(value) = self.scope_value(name) {
                return Ok(value);
            }
            if let Some(value) = self.evaluate_custom_variable(name) {
                return Ok(value);
            }
        }
        let skill = if force_attr {
            0.0
        } else {
            self.skill_field_value(name, namespace, temporary)?
        };
        if skill != 0.0 {
            return Ok(skill);
        }
        if namespace.is_some() {
            let weapon = self.weapon_field_value(name, namespace, temporary);
            if weapon != 0.0 {
                return Ok(weapon);
            }
            return Ok(self.attribute_value(name, temporary));
        }
        let attribute = self.attribute_value(name, temporary);
        if attribute != 0.0 {
            return Ok(attribute);
        }
        Ok(self.weapon_field_value(name, namespace, temporary))
    }

    /// 角色属性取值（含字段临时属性的平值加算）。
    fn attribute_value(&self, name: &str, temporary: &TemporaryAttrs) -> f64 {
        let mut value = self.attrs.get(name).copied().unwrap_or(0.0);
        for (attribute, increment) in temporary {
            let target = crate::ast_parser::temporary_flat_attribute(attribute);
            if crate::ast_parser::attribute_matches(target, name) {
                value += increment;
            }
        }
        value
    }

    /// 武器面板属性取值（含字段临时属性按基础值缩放）。
    fn weapon_field_value(
        &self,
        name: &str,
        namespace: Option<&str>,
        temporary: &TemporaryAttrs,
    ) -> f64 {
        crate::prof!("ast_eval::weapon_field_value");
        // 上游把 `武器攻击` 归一成 `攻击`
        let name = if name == "武器攻击" {
            "攻击"
        } else {
            name
        };
        let key = namespace.unwrap_or("");
        let Some(panel_key) = self.panel_keys.get(key) else {
            return 0.0;
        };
        let Some(panel) = self.weapon_panels.get(panel_key.as_str()) else {
            return 0.0;
        };
        let base = panel.get(name).copied().unwrap_or(0.0);
        // 临时属性：`面板值 + 基础值 × 增量`
        let increment = temporary
            .iter()
            .find(|(attribute, _)| crate::ast_parser::attribute_matches(attribute, name))
            .map(|(_, value)| *value);
        let Some(increment) = increment else {
            return base;
        };
        let Some(base_name) = crate::ast_parser::weapon_attribute_base(strip_brackets(name)) else {
            // 无独立基础字段的属性以 1 为基准
            return base + increment;
        };
        let weapon_base = self.weapon_base_value(key, base_name);
        base + weapon_base * increment
    }

    /// 武器的基础属性值（`基础攻击` / `基础暴击` …）。
    fn weapon_base_value(&self, key: &str, base_name: &str) -> f64 {
        let (attack, crit, crit_damage, trigger) = match key {
            "远程" | "ranged" => (
                self.context.ranged_weapon.base_attack,
                self.context.ranged_weapon.base_crit,
                self.context.ranged_weapon.base_crit_damage,
                self.context.ranged_weapon.base_trigger,
            ),
            "同律" | "skill" => match self.context.skill_weapon.as_ref() {
                Some(weapon) => (
                    weapon.base_attack,
                    weapon.base_crit,
                    weapon.base_crit_damage,
                    weapon.base_trigger,
                ),
                None => (0.0, 0.0, 0.0, 0.0),
            },
            _ => (
                self.context.melee_weapon.base_attack,
                self.context.melee_weapon.base_crit,
                self.context.melee_weapon.base_crit_damage,
                self.context.melee_weapon.base_trigger,
            ),
        };
        match base_name {
            "基础攻击" => attack,
            "基础暴击" => crit,
            "基础暴伤" => crit_damage,
            "基础触发" => trigger,
            _ => 1.0,
        }
    }

    /// 技能字段取值；对应上游 `evaluateSkill`。
    fn skill_field_value(
        &mut self,
        name: &str,
        namespace: Option<&str>,
        temporary: &TemporaryAttrs,
    ) -> Result<f64, String> {
        crate::prof!("ast_eval::skill_field_value");
        // 武器伤害关键词（`[近战]` / `[远程]` / `[同律]`）走武器攻击
        let weapon_field_base = weapon_damage_field_base(name);
        if let Some(base) = weapon_field_base {
            if !self.weapon_panels.contains_key(base) {
                return Ok(0.0);
            }
            let current = self.summon_attrs(base, temporary, Some(name), namespace, None);
            let attack = current.get("攻击").copied().unwrap_or(0.0)
                + self.weapon_field_value("攻击", Some(base), temporary);
            return Ok(attack * self.defense_for(Some(base), None));
        }

        match name {
            "[攻击]" => {
                let field_base = namespace.unwrap_or("");
                let current = self.summon_attrs(field_base, temporary, Some(name), namespace, None);
                let attack = current.get("攻击").copied().unwrap_or(0.0)
                    + self.weapon_field_value("攻击", namespace, temporary);
                return Ok(attack * self.defense_for(namespace, None));
            }
            "[防御]" => {
                let field_base = namespace.unwrap_or("");
                let current = self.summon_attrs(field_base, temporary, Some(name), namespace, None);
                return Ok(
                    current.get("防御").copied().unwrap_or(0.0) * self.defense_for(namespace, None)
                );
            }
            "[生命]" => {
                let field_base = namespace.unwrap_or("");
                let current = self.summon_attrs(field_base, temporary, Some(name), namespace, None);
                return Ok(
                    current.get("生命").copied().unwrap_or(0.0) * self.defense_for(namespace, None)
                );
            }
            _ => {}
        }

        // 普通属性名（无对应技能字段）在字段查找后直接返回，避免无谓克隆整张属性表。
        let Some(field_ref) = self.field_of(name, namespace) else {
            return Ok(0.0);
        };
        let field = field_ref.get();
        let field_base = namespace.unwrap_or("");
        // 与 `field_of` 同 key（`skill_keys[ns] or base_name`），复用免二次扫描。
        let current =
            self.summon_attrs(field_base, temporary, Some(name), namespace, Some(field_ref.clone()));
        // 伤害 / 治疗字段：按格式串求值
        if field.name.ends_with("伤害") || field.name.ends_with("治疗") {
            let value1 = field.value;
            let value2 = field.value2;
            let base_value = if field.attr_base.is_none() {
                current.get("攻击").copied().unwrap_or(0.0)
                    + self.weapon_field_value("攻击", namespace, temporary)
            } else if field.attr_base.as_deref() == Some("生命") {
                current.get("生命").copied().unwrap_or(0.0)
            } else if field.attr_base.as_deref() == Some("防御") {
                current.get("防御").copied().unwrap_or(0.0)
            } else {
                0.0
            };
            let base_damage = match field.format.as_deref() {
                Some(format) => self.evaluate_format(format, value1, value2, base_value),
                None => value1 * base_value + value2,
            };
            if field.name.ends_with("治疗") {
                // 治疗不吃防御
                return Ok(base_damage);
            }
            return Ok(base_damage * self.defense_for(namespace, Some(&field.tags)));
        }
        Ok(field.value)
    }

    /// 按字段名找技能字段（含命名空间对应的技能上下文）。
    ///
    /// 查找结果按 `命名空间::字段名` 缓存；字段表共享 `Rc`，命中只克隆引用计数。
    fn field_of(&mut self, name: &str, namespace: Option<&str>) -> Option<FieldRef> {
        crate::prof!("ast_eval::field_of");
        let cache_key = match namespace {
            Some(namespace) => format!("{namespace}::{name}"),
            None => format!("::{}", name),
        };
        if let Some(cached) = self.field_cache.get(&cache_key) {
            return cached.clone();
        }
        let key: String = match namespace {
            Some(namespace) => self
                .skill_keys
                .get(namespace)
                .cloned()
                .unwrap_or_else(|| namespace.to_string()),
            None => self.context.settings.base_name.clone(),
        };
        let found = self.fields_for(&key).and_then(|fields| {
            fields
                .iter()
                .position(|field| field.safe_name.contains(name) || field.name.contains(name))
                .map(|index| FieldRef { fields, index })
        });
        self.field_cache.insert(cache_key, found.clone());
        found
    }

    /// 取某个技能字段表（按 `safeName` 键）；首次用到的技能现场按当前属性构建。
    fn fields_for(&mut self, key: &str) -> Option<Rc<Vec<super::models::SkillField>>> {
        if let Some(found) = self.skill_fields.get(key) {
            return Some(found.clone());
        }
        let evaluator = &mut *self;
        let skill = evaluator
            .context
            .all_skills()
            .find(|skill| skill.safe_name == key)?;
        let fields = Rc::new(skill.fields_with_attr(
            &evaluator.attrs,
            &evaluator.conditional_props,
            evaluator.ranged_multi,
        ));
        evaluator
            .skill_fields
            .insert(key.to_string(), fields.clone());
        Some(fields)
    }

    /// 召唤物属性继承 + 字段临时属性 + 条件BUFF增量；对应上游 `getSummonAttrs`。
    ///
    /// `hint` 是调用方已查到的同一字段（与 `skill_field_for_tag` 同 key 时复用，
    /// 省一次字段表扫描；`None` 时内部重查）。
    fn summon_attrs(
        &mut self,
        base: &str,
        temporary: &TemporaryAttrs,
        field_name: Option<&str>,
        namespace: Option<&str>,
        hint: Option<FieldRef>,
    ) -> AttrMap {
        crate::prof!("ast_eval::summon_attrs");
        // 用于条件BUFF命中的字段（与上游 `summonField` 同口径：按调用方命名空间解析）；
        // 解析不到时退回无 tag（上游 `fieldTag` 为 undefined 时只按技能名匹配）。
        // `owned_base` 把 `key` 的借用落在局部变量上，避免与后续 `&mut self` 调用冲突。
        let owned_base;
        let key = if base.is_empty() {
            owned_base = self.context.settings.base_name.clone();
            owned_base.as_str()
        } else {
            base
        };
        let summon_field = hint.or_else(|| self.skill_field_for_tag(key, field_name, namespace));
        // 字段 tag 含「召唤物」即继承召唤物属性
        let is_summon_field = summon_field
            .as_ref()
            .map(|field| field.get().tags.iter().any(|tag| tag == "召唤物"))
            .unwrap_or(false);
        let ratio = if is_summon_field {
            self.attrs.get("召唤物属性继承比例").copied().unwrap_or(1.0)
        } else {
            1.0
        };
        let mut result = if ratio == 1.0 {
            self.attrs.clone()
        } else {
            let mut scaled = self.attrs.clone();
            for (attribute, value) in [("攻击", true), ("昂扬", true), ("背水", true)] {
                let _ = value;
                let current = scaled.get(attribute).copied().unwrap_or(0.0);
                scaled.insert(attribute, current * ratio);
            }
            scaled
        };
        // 条件BUFF：字段名/tag命中时把属性增量合并进该字段的独立属性上下文
        if let Some(field_name) = field_name {
            let field_tags = summon_field
                .as_ref()
                .map(|field| field.get().tags.as_slice());
            if let Some(props) = self.conditional_props_for(key, field_name, field_tags) {
                for (attribute, value) in props {
                    // 乘法池属性（独立增伤系列等）在全局以 Π(1+v) 聚合，字段级合并同样按乘法叠加
                    if is_multiplicative_attr(&attribute) {
                        let Some(current) = result.get(&attribute).copied() else {
                            continue;
                        };
                        result.insert(attribute, (1.0 + current) * (1.0 + value) - 1.0);
                        continue;
                    }
                    // 平值属性（固定攻击/固定生命等）与临时属性同口径：映射到基础属性平值加算
                    let target =
                        crate::ast_parser::temporary_flat_attribute(&attribute).to_string();
                    let Some(current) = result.get(&target).copied() else {
                        continue;
                    };
                    result.insert(target, current + value);
                }
            }
        }
        if temporary.is_empty() {
            return result;
        }
        // 字段临时属性：已在武器面板承载的不重复加到角色属性
        let on_weapon_panel = weapon_damage_field_base(field_name.unwrap_or(""))
            .map(|weapon_base| self.weapon_panels.contains_key(weapon_base))
            .unwrap_or(false);
        for (attribute, value) in temporary {
            if on_weapon_panel {
                continue;
            }
            let target = crate::ast_parser::temporary_flat_attribute(attribute);
            let current = result.get(target).copied().unwrap_or(0.0);
            result.insert(target, current + value);
        }
        result
    }

    /// 取命中字段的条件BUFF属性增量（一次求值内按 `基底::字段名` 缓存，与上游 `conditionalBuffCache` 同口径）。
    fn conditional_props_for(
        &mut self,
        base: &str,
        field_name: &str,
        field_tag: Option<&[String]>,
    ) -> Option<AttrMap> {
        crate::prof!("ast_eval::conditional_props_for");
        let cache_key = format!("{base}::{field_name}");
        if let Some(cached) = self.conditional_buff_cache.get(&cache_key) {
            return cached.clone();
        }
        // 会话快照口径：`conditional_props` 在 `Evaluator::new` 时随字段表同一快照固化，
        // 此处只做纯匹配过滤（`BuildContext::conditional_buff_props` 的聚合口径），
        // 不再回头调 `context`（同源数据，同结果；且求值期不再产生新的可变借用）。
        let empty: &[String] = &[];
        let tags = field_tag.unwrap_or(empty);
        let mut result: Option<AttrMap> = None;
        for entry in &self.conditional_props {
            if !entry.matches(field_name, tags) {
                continue;
            }
            let props = result.get_or_insert_with(AttrMap::new);
            for (prop, value) in &entry.props {
                if is_multiplicative_attr(prop) {
                    let current = props.get(prop).copied().unwrap_or(0.0);
                    props.insert(prop, (1.0 + current) * (1.0 + value) - 1.0);
                } else {
                    *props.entry(prop).or_insert(0.0) += value;
                }
            }
        }
        self.conditional_buff_cache
            .insert(cache_key, result.clone());
        result
    }

    /// 取用于 tag 判定的字段（含命名空间对应的技能）。
    fn skill_field_for_tag(
        &mut self,
        key: &str,
        field_name: Option<&str>,
        namespace: Option<&str>,
    ) -> Option<FieldRef> {
        let field_name = field_name?;
        let resolved = namespace
            .and_then(|value| self.skill_keys.get(value).map(String::as_str))
            .unwrap_or(key)
            .to_string();
        let fields = self.fields_for(&resolved)?;
        fields
            .iter()
            .position(|field| {
                field.safe_name.contains(field_name) || field.name.contains(field_name)
            })
            .map(|index| FieldRef { fields, index })
    }

    /// 防御乘区（按是否技能区分）；对应上游 `getDef`。
    ///
    /// 技能伤害字段视为技能伤害：防御按技能口径结算，吃技能无视防御。
    fn defense_for(&mut self, namespace: Option<&str>, field_tag: Option<&[String]>) -> f64 {
        crate::prof!("ast_eval::defense_for");
        let is_skill_field = field_tag
            .map(|tags| tags.iter().any(|tag| tag == "技能"))
            .unwrap_or(false);
        let base_name;
        let key = match namespace {
            Some(value) => value,
            None => {
                base_name = self.context.settings.base_name.clone();
                &base_name
            }
        };
        let has_weapon = !is_skill_field
            && self.context.weapons_by_base().contains_key(key)
            && self
                .panel_keys
                .get(key)
                .is_some_and(|resolved| self.weapon_panels.contains_key(resolved.as_str()));
        let is_skill = !has_weapon;
        if let Some(cached) = self.def_cache.get(&is_skill) {
            return *cached;
        }
        let value = self.context.defense_multiplier(&self.attrs, None, is_skill);
        self.def_cache.insert(is_skill, value);
        value
    }

    /// 是否伤害字段；对应上游 `isDamageSkillField`。
    fn is_damage_skill_field(&mut self, name: &str, namespace: Option<&str>) -> bool {
        crate::prof!("ast_eval::is_damage_skill_field");
        if matches!(name, "[攻击]" | "[防御]" | "[生命]")
            || weapon_damage_field_base(name).is_some()
        {
            return true;
        }
        self.field_of(name, namespace).is_some_and(|field| {
            field.get().name.ends_with("伤害") || field.get().name.ends_with("伤害倍率")
        })
    }

    /// 伤害成员取值；对应上游 `evaluateMember` → `getDamage`。
    fn member_value(
        &mut self,
        member: Option<&str>,
        namespace: Option<&str>,
        name: &str,
        temporary: &TemporaryAttrs,
    ) -> f64 {
        crate::prof!("ast_eval::member_value");
        let damage = self.damage_for(namespace, Some(name), temporary);
        let Some(member) = member else {
            return damage.expected_damage;
        };
        // 上游把「非 / 低」规范化成「未」：可达组合有限，直接展开匹配（零分配）。
        // 「未触发暴击」类单位置 3 种，「未暴击未触发」类双位置 3×3=9 种，不可漏项。
        match member {
            "N" => damage.no_hp_damage,
            "物理" => damage.physical_damage,
            "元素" => damage.element_damage,
            "暴击" => damage.higher_crit_expected_trigger,
            "未暴击" | "非暴击" | "低暴击" => damage.lower_crit_expected_trigger,
            "触发" => damage.expected_crit_trigger,
            "未触发" | "非触发" | "低触发" => damage.expected_crit_no_trigger,
            "暴击触发" | "触发暴击" => damage.higher_crit_trigger,
            "未触发暴击" | "非触发暴击" | "低触发暴击" | "暴击未触发" | "暴击非触发"
            | "暴击低触发" => damage.higher_crit_no_trigger,
            "触发未暴击" | "触发非暴击" | "触发低暴击" | "未暴击触发" | "非暴击触发"
            | "低暴击触发" => damage.lower_crit_trigger,
            "未暴击未触发" | "未暴击非触发" | "未暴击低触发" | "非暴击未触发"
            | "非暴击非触发" | "非暴击低触发" | "低暴击未触发" | "低暴击非触发"
            | "低暴击低触发" | "未触发未暴击" | "未触发非暴击" | "未触发低暴击"
            | "非触发未暴击" | "非触发非暴击" | "非触发低暴击" | "低触发未暴击"
            | "低触发非暴击" | "低触发低暴击" => damage.lower_crit_no_trigger,
            _ => 0.0,
        }
    }

    /// 计算某字段的伤害；对应上游 `getDamage`（含充盈乘区与细分乘区）。
    fn damage_for(
        &mut self,
        base: Option<&str>,
        field_name: Option<&str>,
        temporary: &TemporaryAttrs,
    ) -> DamageResult {
        crate::prof!("ast_eval::damage_for");
        let weapon_field_base = field_name.and_then(weapon_damage_field_base);
        let key = weapon_field_base
            .map(|value| value.to_string())
            .or_else(|| base.map(|value| value.to_string()))
            .unwrap_or_else(|| self.context.settings.base_name.clone());
        let cache_key = match field_name {
            Some(name) => format!("{}::{}", key, name),
            None => key.clone(),
        };
        if temporary.is_empty()
            && let Some(cached) = self.damage_cache.get(&cache_key)
        {
            return *cached;
        }

        // 乘区与分量按字段 tag 结算：tag 含「技能」走技能池（技能伤害 + 技能追伤 +
        // 纯元素分量），含「武器」走武器池；无 tag 按归属回退（有武器面板→武器池，
        // 否则→技能池）。双爆（暴击/触发）按归属结算，见 `calculate_damage`。
        let field = field_name.and_then(|name| self.field_of(name, base));
        // 无 tag 的字段传 None（上游 `field?.tag` 为 undefined 时按归属回退；
        // 空数组在上游同样取不到 tag，这里同样回退，不要传空数组）。
        let field_tag: Option<&[String]> = field.as_ref().and_then(|item| {
            let item = item.get();
            if item.tags.is_empty() {
                None
            } else {
                Some(item.tags.as_slice())
            }
        });
        let field_damage_type: Option<&str> = field
            .as_ref()
            .and_then(|item| item.get().damage_type.as_deref());
        // 字段上下文属性（召唤物继承 + 字段临时属性），细分乘区经选项传入
        let context_attrs = self.summon_attrs(&key, temporary, field_name, base, None);
        // 细分乘区（普攻 / 蓄力 / 下落 / 滑行）
        let (attack_type_bonus, attack_type_independent) =
            self.attack_type_bonuses(&key, field_name);
        let weapon_opt = self.context.weapons_by_base().get(&key).copied();
        let is_skill_pool = match &field_tag {
            Some(tags) => tags.iter().any(|tag| tag == "技能"),
            None => weapon_opt.is_none(),
        };
        // 箭雨的独立降伤只作用于武器自身攻击：灾厄伤害字段豁免，且只剔除箭雨自身词条
        let arrow_rain_penalty = if weapon_opt == Some(WeaponRef::Ranged)
            && field_damage_type == Some("灾厄")
            && self.context.ranged_mods.iter().any(|mod_| mod_.id == 43604)
        {
            -0.6
        } else {
            0.0
        };
        // 技能池 + 有武器面板：触发期望按「武器面板触发 + 技能触发」封顶后的覆盖率结算
        //（未触发 1 倍）。不再重写面板触发区与属性增伤区：原写法把武器增伤/武器独立增伤
        // 乘进技能池、把武器追加伤害清零（丢了技能追伤）、把武器攻分量套在技能分量上，
        // 导致计算错误；现全部改为显式参数传入。
        let panel_trigger = weapon_opt
            .and_then(|_| {
                self.weapon_panels
                    .get(&key)
                    .and_then(|panel| panel.get("触发").copied())
            })
            .unwrap_or(0.0);
        let skill_trigger_coverage = if is_skill_pool && weapon_opt.is_some() {
            (context_attrs.get("技能触发").copied().unwrap_or(0.0) + panel_trigger).clamp(0.0, 1.0)
        } else {
            1.0
        };
        let panel = weapon_opt.and_then(|_| self.weapon_panels.get(&key).cloned());
        let wrapped = WeaponAttributes {
            char: context_attrs.clone(),
            panel: None,
            weapon: None,
        };
        let options = DamageCalcOptions {
            damage_type: field_damage_type,
            field_tag,
            is_skill_pool: Some(is_skill_pool),
            is_summon: None,
            skill_trigger_coverage: Some(skill_trigger_coverage),
            attack_type_damage_bonus: Some(attack_type_bonus),
            attack_type_independent_bonus: Some(attack_type_independent),
            weapon_independent_penalty: Some(arrow_rain_penalty),
        };
        let mut damage = self
            .context
            .calculate_damage(&wrapped, weapon_opt, panel, &options);
        self.last_damage = Some(damage);

        // 充盈乘区：字段 tag 含「充盈」直接整体加成，否则按 转充盈 比例加成（两者互斥）
        let mut fullness_multiplier = 1.0;
        if field
            .as_ref()
            .map(|item| item.get().tags.iter().any(|tag| tag == "充盈"))
            .unwrap_or(false)
        {
            fullness_multiplier = 1.0 + context_attrs.get("充盈威力").copied().unwrap_or(0.0);
        } else {
            let convert = context_attrs.get("转充盈").copied().unwrap_or(0.0).max(0.0);
            if convert > 0.0 {
                fullness_multiplier =
                    1.0 + convert * context_attrs.get("充盈威力").copied().unwrap_or(0.0);
            }
        }
        if fullness_multiplier != 1.0 {
            damage.expected_damage *= fullness_multiplier;
            damage.no_hp_damage *= fullness_multiplier;
            damage.physical_damage *= fullness_multiplier;
            damage.element_damage *= fullness_multiplier;
            damage.lower_crit_no_trigger *= fullness_multiplier;
            damage.higher_crit_no_trigger *= fullness_multiplier;
            damage.lower_crit_trigger *= fullness_multiplier;
            damage.higher_crit_trigger *= fullness_multiplier;
            damage.lower_crit_expected_trigger *= fullness_multiplier;
            damage.higher_crit_expected_trigger *= fullness_multiplier;
            damage.expected_crit_trigger *= fullness_multiplier;
            damage.expected_crit_no_trigger *= fullness_multiplier;
        }
        if temporary.is_empty() {
            self.damage_cache.insert(cache_key, damage);
        }
        damage
    }

    /// 武器攻击细分乘区（普攻 / 蓄力 / 下落 / 滑行）；对应上游 `getWeaponAttackTypeBonus`。
    ///
    /// 一次解析同时算出「增伤」与「独立增伤」并缓存：伤害路径原本对同一字段调用两次，
    /// 每次都重复解析技能上下文与拼属性名。
    fn attack_type_bonuses(&mut self, base: &str, field_name: Option<&str>) -> (f64, f64) {
        let Some(name) = field_name else {
            return (0.0, 0.0);
        };
        let cache_key = format!("{base}::{name}");
        if let Some(cached) = self.attack_type_cache.get(&cache_key) {
            return *cached;
        }
        let result = self.compute_attack_type_bonuses(base, Some(name));
        self.attack_type_cache.insert(cache_key, result);
        result
    }

    fn compute_attack_type_bonuses(&mut self, base: &str, field_name: Option<&str>) -> (f64, f64) {
        let Some(prefix) = self.attack_type_prefix(base, field_name) else {
            return (0.0, 0.0);
        };
        let weapon_prefix: &str = self
            .context
            .weapons_by_base()
            .get(base)
            .map(|weapon| self.context.weapon_prefix_ref(*weapon))
            .unwrap_or("");
        if weapon_prefix.is_empty() {
            return (0.0, 0.0);
        }
        let scope = super::context::prefix_scope(weapon_prefix);
        let one =
            |attribute: &str| self.attack_type_bonus_one(weapon_prefix, &prefix, attribute, scope);
        (one("增伤"), one("独立增伤"))
    }

    fn attack_type_bonus_one(
        &self,
        weapon_prefix: &str,
        prefix: &str,
        attribute: &str,
        scope: &str,
    ) -> f64 {
        let multiplicative = attribute.ends_with("独立增伤");
        let get = |attr: &str, prefix: &str, include_mods: bool| -> f64 {
            if multiplicative {
                self.context.total_bonus_mul(attr, prefix, include_mods)
            } else {
                self.context.total_bonus(attr, prefix, include_mods)
            }
        };
        let mut bonus = get(
            &format!("{}{}{}", weapon_prefix, prefix, attribute),
            scope,
            true,
        );
        if weapon_prefix.contains("近战") {
            bonus += get(&format!("{}{}", prefix, attribute), scope, true);
        }
        if weapon_prefix.starts_with("同律") {
            let lower: String = weapon_prefix.chars().skip(2).collect();
            let lower_scope = super::context::prefix_scope(&lower);
            bonus += get(
                &format!("{}{}{}", lower, prefix, attribute),
                lower_scope,
                false,
            );
            if lower.contains("近战") {
                bonus += get(&format!("{}{}", prefix, attribute), lower_scope, false);
            }
            // 同律槽位 MOD 直接作用于同律武器自身：其下位作用域（近战/远程）的细分属性同样生效。
            // 只有同律作用域 MOD 参与，近战/远程槽位 MOD 不随前缀降级穿透。
            if multiplicative {
                bonus += self
                    .context
                    .scoped_mods_mul_bonus(&format!("{}{}{}", lower, prefix, attribute), scope)
                    - 1.0;
            } else {
                bonus += self
                    .context
                    .scoped_mods_bonus(&format!("{}{}{}", lower, prefix, attribute), scope);
            }
        }
        bonus
    }

    /// 字段 tag → 攻击类型前缀；对应上游 `getWeaponAttackTypePrefixFromTags`。
    fn attack_type_prefix(&mut self, base: &str, field_name: Option<&str>) -> Option<String> {
        let field_name = field_name?;
        let resolved = self
            .skill_keys
            .get(base)
            .map(String::as_str)
            .unwrap_or(base)
            .to_string();
        let fields = self.fields_for(&resolved)?;
        let field = fields.iter().find(|field| {
            field.safe_name.contains(field_name) || field.name.contains(field_name)
        })?;
        const MAP: &[(&str, &[&str])] = &[
            ("普攻", &["普攻", "普通攻击"]),
            ("蓄力", &["蓄力攻击"]),
            ("下落", &["下落攻击"]),
            ("滑行", &["滑行攻击"]),
        ];
        for (prefix, names) in MAP {
            if names
                .iter()
                .any(|name| field.tags.iter().any(|tag| tag == name))
            {
                return Some((*prefix).to_string());
            }
        }
        // 同律武器字段未标注攻击类型时回退到「视为」声明
        if base.starts_with("同律")
            && let Some(weapon) = self.context.skill_weapon.as_ref()
            && let Some(considered) = weapon.considered.as_deref()
        {
            for (prefix, names) in MAP {
                if names.iter().any(|name| considered.contains(name)) {
                    return Some((*prefix).to_string());
                }
            }
        }
        None
    }

    /// 技能表达式求值（`{%}` / `{}` 占位符）；对应上游 `evaluateExpression`。
    fn evaluate_format(&mut self, format: &str, value1: f64, value2: f64, base_value: f64) -> f64 {
        crate::prof!("ast_eval::evaluate_format");
        // 也永不出现在多字节字符的后续字节中，故与字符扫描等价。
        let raw = format.as_bytes();
        let mut count = 0usize;
        let mut expression = String::with_capacity(format.len());
        let mut index = 0usize;
        let mut literal = 0usize;
        while index < raw.len() {
            let percent = raw[index] == b'{'
                && raw.get(index + 1) == Some(&b'%')
                && raw.get(index + 2) == Some(&b'}');
            let plain =
                !percent && raw[index] == b'{' && raw.get(index + 1) == Some(&b'}');
            if percent || plain {
                expression.push_str(&format[literal..index]);
                count += 1;
                let value = if count % 2 == 1 { value1 } else { value2 };
                if percent {
                    expression.push_str(&format!("({} * {})", value, base_value));
                } else {
                    expression.push_str(&format!("{}", value));
                }
                index += if percent { 3 } else { 2 };
                literal = index;
                continue;
            }
            // `{`/`}`/`%` 均为 ASCII，不可能出现在 UTF-8 后续字节中，逐字节步进即可；
            // 切片起止恒为字符边界（`literal`/`index` 只停在 ASCII 处）。
            index += 1;
        }
        expression.push_str(&format[literal..]);
        let expression = expression.replace('×', "*");
        // 纯算术表达式走轻量求值（语义与 AST 求值一致，见 `eval_arith`）；
        // 含变量 / 单位 / 中文的回退到完整解析求值。
        if let Some(fast) = eval_arith(&expression) {
            if !fast.is_nan() {
                return fast;
            }
            return value1 * base_value;
        }
        // 模板级分类：不含字段引用、且模板结构决定解析必失败的（如 `{}米`），
        // 直接回退，省掉每次拼串后的解析浪费。分类用零值试解析一次定格：
        // 占位符只换数字字面量，不改变解析成败（误判只损失优化，不改语义——
        // 见 `format_kind`）。
        if !expression.contains('[') && format_kind(format) == FormatKind::Fallback {
            return value1 * base_value;
        }
        // 数字表达式同样走本求值器（静态表求值器已按 spec §2 从 ast_parser 剥离）；
        // 此时表达式里只剩数字与算符，无变量/伤害字段，行为与静态求值一致。
        let saved_scope = std::mem::take(&mut self.scope_stack);
        let result =
            parse_cached(&expression).and_then(|ast| self.eval(&ast, &TemporaryAttrs::new()));
        self.scope_stack = saved_scope;
        if let Ok(value) = result
            && !value.is_nan()
        {
            return value;
        }
        value1 * base_value
    }

    /// 求值自定义变量；对应上游 `evaluateCustomVariable`。
    fn evaluate_custom_variable(&mut self, name: &str) -> Option<f64> {
        crate::prof!("ast_eval::evaluate_custom_variable");
        if let Some(value) = self.variable_cache.get(name) {
            return Some(*value);
        }
        // 变量必须存在；解析失败按上游 `unwrap_or(0)` 记 0（不阻塞其它变量）。
        let expression = self.context.custom_variables.get(name)?.clone();
        if self.resolving_variables.iter().any(|item| item == name) {
            return Some(0.0);
        }
        // 轻量会话（`with_panels`）不预编译变量，按需解析（全局解析缓存）。
        let ast = match self.variable_asts.get(name) {
            Some(ast) => Some(ast.clone()),
            None => parse_cached(&expression).ok(),
        };
        self.resolving_variables.push(name.to_string());
        let value = match ast {
            Some(ast) => self.eval(&ast, &TemporaryAttrs::new()).unwrap_or(0.0),
            None => 0.0,
        };
        self.resolving_variables.pop();
        let safe = if value.is_finite() { value } else { 0.0 };
        self.variable_cache.insert(name.to_string(), safe);
        Some(safe)
    }

    /// 求值自定义函数；对应上游 `evaluateCustomFunction`。
    fn evaluate_custom_function(
        &mut self,
        name: &str,
        args: &[f64],
    ) -> Result<Option<f64>, String> {
        let Some((params, body)) = self.functions.get(name).cloned() else {
            return Ok(None);
        };
        if params.len() != args.len() {
            return Err(format!(
                "函数 \"{}\" 需要 {} 个参数,实际传入 {}",
                name,
                params.len(),
                args.len()
            ));
        }
        if self.resolving_functions.iter().any(|item| item == name) {
            return Ok(Some(0.0));
        }
        // 函数体以参数作用域求值：这里用「参数替换」的方式复用主求值器
        let ast = match self.function_asts.get(name) {
            Some(ast) => ast.clone(),
            None => parse_cached(&body)?,
        };
        self.resolving_functions.push(name.to_string());
        let mut bound: HashMap<String, f64> = HashMap::new();
        for (index, param) in params.iter().enumerate() {
            bound.insert(param.clone(), args[index]);
        }
        self.scope_stack.push(bound);
        let value = self.eval(&ast, &TemporaryAttrs::new());
        self.scope_stack.pop();
        self.resolving_functions.pop();
        value.map(Some)
    }

    /// 合并字段临时属性；对应上游 `mergeTemporaryAttributes`。
    fn merge_temporary(
        &mut self,
        attributes: &[(String, AstNode)],
        inherited: &TemporaryAttrs,
    ) -> Result<TemporaryAttrs, String> {
        let mut merged = inherited.clone();
        for (name, node) in attributes {
            let increment = self.eval(node, inherited)?;
            *merged.entry(name.clone()).or_insert(0.0) += increment;
        }
        Ok(merged)
    }

    /// 取成员访问对象；对应上游 `getPropertyContext`。
    fn property_context(
        &mut self,
        node: &AstNode,
        temporary: &TemporaryAttrs,
    ) -> Option<(String, Option<String>, bool, TemporaryAttrs)> {
        match node {
            AstNode::Property {
                name,
                namespace,
                force_attr,
            } => Some((
                name.clone(),
                namespace.clone(),
                *force_attr,
                temporary.clone(),
            )),
            AstNode::TemporaryAttributes { target, attributes } => {
                let merged = self.merge_temporary(attributes, temporary).ok()?;
                self.property_context(target, &merged)
            }
            _ => None,
        }
    }

    /// `hp(血量%)`：背水乘区 × 昂扬乘区。
    fn evaluate_hp(&self, hp_percent: f64) -> f64 {
        let attrs = &self.attrs;
        let desperate = self.context.desperate_multiplier(attrs, Some(hp_percent));
        let boost = self.context.boost_multiplier(attrs, Some(hp_percent));
        desperate * boost
    }

    /// 在参数作用域里取值（自定义函数的形参）。
    fn scope_value(&self, name: &str) -> Option<f64> {
        self.scope_stack
            .last()
            .and_then(|scope| scope.get(name).copied())
    }

    /// 最近一次求值算出的伤害明细（界面用它展示分量）。
    pub fn current_damage(&self) -> Option<DamageResult> {
        self.last_damage
    }
}

/// 纯算术快路：占位后的表达式若只含数字与四则算符/括号，直接求值，跳过词法/语法分析。
/// 与 AST 求值一致的要点：除零得 `0.0`；`e`/`E`/`%`/`//` 直接回退（AST 把 `e`
/// 切成标识符，`1e3` 解析失败走回退）；运算符后的正负号、括号内前导正负号一律
/// 回退（回退即完整解析，结果相同）；任何语法失败返回 `None`。
fn eval_arith(expression: &str) -> Option<f64> {
    let bytes = expression.as_bytes();
    let mut has_digit = false;
    for &byte in bytes {
        match byte {
            b'0'..=b'9' => has_digit = true,
            b'+' | b'-' | b'*' | b'/' | b'(' | b')' | b'.' | b' ' => {}
            _ => return None,
        }
    }
    if !has_digit || expression.contains("//") {
        return None;
    }
    let mut parser = ArithParser {
        text: expression,
        bytes,
        pos: 0,
    };
    let value = parser.parse_expr()?;
    parser.skip_spaces();
    if parser.pos != bytes.len() {
        return None;
    }
    Some(value)
}

/// 递归下降算术解析：`expr := term (('+'|'-') term)*`，左结合，与 `ast_parser` 同优先级。
struct ArithParser<'x> {
    text: &'x str,
    bytes: &'x [u8],
    pos: usize,
}

impl ArithParser<'_> {
    fn skip_spaces(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos] == b' ' {
            self.pos += 1;
        }
    }

    fn parse_expr(&mut self) -> Option<f64> {
        let mut left = self.parse_term()?;
        loop {
            self.skip_spaces();
            let op = match self.bytes.get(self.pos) {
                Some(b'+') => b'+',
                Some(b'-') => b'-',
                _ => return Some(left),
            };
            self.pos += 1;
            self.skip_spaces();
            // AST 把二元运算符后的正负号判为缺操作数，这里同样回退。
            if matches!(self.bytes.get(self.pos), Some(b'+') | Some(b'-')) {
                return None;
            }
            let right = self.parse_term()?;
            left = if op == b'+' { left + right } else { left - right };
        }
    }

    fn parse_term(&mut self) -> Option<f64> {
        let mut left = self.parse_factor()?;
        loop {
            self.skip_spaces();
            let op = match self.bytes.get(self.pos) {
                Some(b'*') => b'*',
                Some(b'/') => b'/',
                _ => return Some(left),
            };
            self.pos += 1;
            self.skip_spaces();
            if matches!(self.bytes.get(self.pos), Some(b'+') | Some(b'-')) {
                return None;
            }
            let right = self.parse_factor()?;
            // 除零得 `0.0`，与 `eval` 的 `/` 分支一致。
            left = if op == b'*' || right != 0.0 {
                if op == b'*' { left * right } else { left / right }
            } else {
                0.0
            };
        }
    }

    fn parse_factor(&mut self) -> Option<f64> {
        self.skip_spaces();
        let byte = *self.bytes.get(self.pos)?;
        if byte == b'(' {
            self.pos += 1;
            self.skip_spaces();
            // 括号内前导正负号回退（与完整解析结果相同）。
            if matches!(self.bytes.get(self.pos), Some(b'+') | Some(b'-')) {
                return None;
            }
            let value = self.parse_expr()?;
            self.skip_spaces();
            if self.bytes.get(self.pos) != Some(&b')') {
                return None;
            }
            self.pos += 1;
            return Some(value);
        }
        // 仅表达式开头允许前导负号（运算符后/括号内已在上层拒绝）。
        let negative = if byte == b'-' {
            self.pos += 1;
            self.skip_spaces();
            if matches!(self.bytes.get(self.pos), Some(b'+') | Some(b'-')) {
                return None;
            }
            true
        } else {
            false
        };
        // 数字扫描与 AST 词法同口径（须以数字开头；`.` 是独立 Dot 词法单元，
        // `.5` 在完整解析中失败，故回退）；`1.2.3` 解析失败即回退
        // （AST 对应 `Number(NaN)`，调用方同样回退）。
        if self.pos >= self.bytes.len() || !self.bytes[self.pos].is_ascii_digit() {
            return None;
        }
        let start = self.pos;
        while self.pos < self.bytes.len()
            && (self.bytes[self.pos].is_ascii_digit() || self.bytes[self.pos] == b'.')
        {
            self.pos += 1;
        }
        let value: f64 = self.text[start..self.pos].parse().ok()?;
        Some(if negative { -value } else { value })
    }
}
/// 命名空间 → 技能字段表键：别名（E/Q/P）优先，其次技能名 / `safeName`。
pub(crate) fn build_skill_keys(context: &BuildContext<'_>) -> HashMap<String, String> {
    let mut keys = HashMap::new();
    for (index, aliases) in [["E", "e"], ["Q", "q"], ["P", "p"]].iter().enumerate() {
        if let Some(skill) = context.char.skills.get(index) {
            for alias in aliases {
                keys.insert((*alias).to_string(), skill.safe_name.clone());
            }
        }
    }
    for skill in context.all_skills() {
        keys.entry(skill.name.clone())
            .or_insert_with(|| skill.safe_name.clone());
        keys.entry(skill.safe_name.clone())
            .or_insert_with(|| skill.safe_name.clone());
    }
    keys
}

/// 命名空间 → 武器面板键（与 `resolvedPanelKey` 同口径：面板自有的键优先，其次按武器技能名归一）。
fn build_panel_keys(
    context: &BuildContext<'_>,
    weapon_panels: &HashMap<String, AttrMap>,
) -> HashMap<String, String> {
    let mut keys: HashMap<String, String> = weapon_panels
        .keys()
        .map(|key| (key.clone(), key.clone()))
        .collect();
    for (name, weapon) in context.weapons_by_base() {
        let slot = match weapon {
            WeaponRef::Melee => "近战",
            WeaponRef::Ranged => "远程",
            WeaponRef::Skill => "同律",
            WeaponRef::Selected => continue,
        };
        keys.entry(name.clone()).or_insert_with(|| slot.to_string());
    }
    keys
}

/// 预编译自定义变量表达式（解析失败按上游 `unwrap_or(0)` 处理，不放进表）。
pub(crate) fn compiled_variables(context: &BuildContext<'_>) -> HashMap<String, std::sync::Arc<AstNode>> {
    context
        .custom_variables
        .iter()
        .filter_map(|(name, expression)| {
            parse_cached(expression).ok().map(|ast| (name.clone(), ast))
        })
        .collect()
}

/// 武器伤害关键词 → 装备槽位；对应上游 `weaponDamageFieldBaseMap`。
/// 格式模板分类：`Fallback` = 拼串后解析必失败（可直接回退）；
/// `Evaluate` = 需完整解析求值（含变量引用或合法表达式结构）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FormatKind {
    Fallback,
    Evaluate,
}

/// 模板分类（零值试解析一次定格，结果进程级缓存）。
///
/// 安全方向：零值试解析失败 → 实际值同样失败（占位符只换数字字面量，
/// 不改变模板的词法结构）→ 回退等价；零值成功 → 一律真求值。
/// 数字打印的极端形态（`inf`/`NaN`/科学计数）只会让「本可回退的进了求值」
/// （`inf` 是合法标识符，parse 成功走求值，与原来一致），不会反向误判。
fn format_kind(template: &str) -> FormatKind {
    thread_local! {
        static KINDS: std::cell::RefCell<HashMap<String, FormatKind>> =
            std::cell::RefCell::new(HashMap::new());
    }
    if let Some(kind) = KINDS.with(|cache| cache.borrow().get(template).copied()) {
        return kind;
    }
    // 零值试解析：占位符按出现序填 0，`{%}` 填 `(0 * 0)`。
    let mut probe = String::with_capacity(template.len());
    let raw = template.as_bytes();
    let mut index = 0usize;
    let mut literal = 0usize;
    while index < raw.len() {
        let percent = raw[index] == b'{'
            && raw.get(index + 1) == Some(&b'%')
            && raw.get(index + 2) == Some(&b'}');
        let plain =
            !percent && raw[index] == b'{' && raw.get(index + 1) == Some(&b'}');
        if percent || plain {
            probe.push_str(&template[literal..index]);
            probe.push_str(if percent { "(0 * 0)" } else { "(0)" });
            index += if percent { 3 } else { 2 };
            literal = index;
            continue;
        }
        index += 1;
    }
    probe.push_str(&template[literal..]);
    let probe = probe.replace('×', "*");
    let kind = match parse_cached(&probe) {
        Ok(_) => FormatKind::Evaluate,
        Err(_) => FormatKind::Fallback,
    };
    KINDS.with(|cache| {
        cache.borrow_mut().insert(template.to_string(), kind);
    });
    kind
}

pub(crate) fn parse_cached(expression: &str) -> Result<std::sync::Arc<AstNode>, String> {
    thread_local! {
        static PARSED: std::cell::RefCell<HashMap<String, Result<std::sync::Arc<AstNode>, String>>> =
            std::cell::RefCell::new(HashMap::new());
    }
    PARSED.with(|cache| {
        if let Some(found) = cache.borrow().get(expression) {
            return found.clone();
        }
        let parsed = parse_expression(expression, crate::evaluate::macros()).map(std::sync::Arc::new);
        let mut cache = cache.borrow_mut();
        if cache.len() >= 4096 {
            cache.clear();
        }
        cache.insert(expression.to_string(), parsed.clone());
        parsed
    })
}

pub fn weapon_damage_field_base(field_name: &str) -> Option<&'static str> {
    match field_name {
        "[近战]" => Some("近战"),
        "[远程]" => Some("远程"),
        "[同律]" => Some("同律"),
        _ => None,
    }
}
