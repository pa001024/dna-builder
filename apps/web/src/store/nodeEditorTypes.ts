/**
 * 节点编辑器节点类型。
 * 单独成文件，避免工具函数（节点图求值）与 Pinia store 形成循环依赖。
 */
export enum NodeType {
    // 输入节点（按类别分组）
    CHAR_INPUT = "char-input", // 角色输入
    MELEE_WEAPON_INPUT = "melee-weapon-input", // 近战武器输入
    RANGED_WEAPON_INPUT = "ranged-weapon-input", // 远程武器输入
    WEAPON_INPUT = "weapon-input", // 旧的武器输入（保留兼容）
    MOD_INPUT = "mod-input", // MOD输入
    BUFF_INPUT = "buff-input", // Buff与队友输入
    EFFECT_INPUT = "effect-input", // 特效设置输入
    PET_INPUT = "pet-input", // 魔灵与潜质输入
    ENEMY_INPUT = "enemy-input", // 敌人设置输入
    CUSTOM_VARS_INPUT = "custom-vars-input", // 自定义变量组输入
    DOT_INPUT = "dot-input", // DOT 频率设置输入

    // 核心计算节点
    CORE_CALC = "core-calc", // 核心CharBuild计算节点

    // 计算节点（显式计算方法）
    ATTR_CALC = "attr-calc", // calculateAttributes()
    WEAPON_ATTR_CALC = "weapon-attr-calc", // calculateWeaponAttributes()

    // 数学计算节点
    ADD_CALC = "add-calc", // 加法计算
    MULTIPLY_CALC = "multiply-calc", // 乘法计算
    EXPRESSION_CALC = "expression-calc", // 通用表达式计算
    VECTOR_CALC = "vector-calc", // 向量统计计算
    HUB_CALC = "hub-calc", // 集线节点

    // BUFF 合并节点
    BUFF_MERGE = "buff-merge", // 合并两路 BUFF（并集 / 交集）

    // 输出节点
    ATTR_OUTPUT = "attr-output", // 显示 CharAttr
    WEAPON_OUTPUT = "weapon-output", // 显示 WeaponAttr
    CHART = "chart", // 向量图表（折线 / 柱状图）

    // AST节点
    AST_EXPRESSION_CALC = "ast-expression-calc", // 自定义目标函数
    CUSTOM_EXPRESSION = "custom-expression", // 自定义变量求值（选择构筑中的变量并输出数值）

    // 基础组件（ComfyUI 风格）
    GROUP = "group", // 分组框
    LABEL = "label", // 标签 / 备注
    TEXT_INPUT = "text-input", // 文本输入
    NUMBER_INPUT = "number-input", // 数值输入
    VECTOR_INPUT = "vector-input", // 向量输入（一组数值）
    VECTOR_DECOMPOSE = "vector-decompose", // 向量分解（按分量输出数值）

    // 思维导图（节点内嵌独立子画布，不参与构筑求值）
    MIND_MAP = "mindmap",

    // 图片（内嵌本地图片或引用 URL，不参与构筑求值）
    IMAGE = "image",

    // 资料库卡片（角色 / 武器 / 魔之楔，不参与构筑求值）
    CARD = "card",

    // 构筑来源
    JSON_BUILD = "json-build", // 从 JSON 文本解析构筑
    ONLINE_BUILD = "online-build", // 从在线构筑列表选择构筑
    JSON_EXPORT = "json-export", // 将构筑导出为 JSON 文本
}
