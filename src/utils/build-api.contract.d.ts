/**
 * 构筑设置
 */
export interface CharSettings {
    /** 角色等级 1-80 */
    charLevel: number
    /** 计算技能（baseName）：技能名，空串表示按目标函数走 */
    baseName: string
    /** 当前血量百分比 0-1（影响背水类收益） */
    hpPercent: number
    /** 和鸣增益 0-3，档位只有 0/0.5/1/1.5/2/2.5/3 */
    resonanceGain: number
    /** 敌人（怪物）id */
    enemyId: number
    /** 敌人等级 */
    enemyLevel: number
    /** 敌人抗性（负数表示属克，例如 -4） */
    enemyResistance: number
    /** 是否开启 Rouge 模式 */
    isRouge: boolean
    /** 目标函数表达式；空串时按默认口径算 */
    targetFunction: string
    /** 自定义变量：`[变量名, 表达式]` */
    customVariables: [string, string][]
    /** 技能等级 1-12 */
    charSkillLevel: number
    /** 额外精通武器类型（如 "长柄"），空串表示未解锁 */
    extraMastery: string
    meleeWeapon: number
    meleeWeaponLevel: number
    meleeWeaponRefine: number
    rangedWeapon: number
    rangedWeaponLevel: number
    rangedWeaponRefine: number
    /** 中枢魔之楔（光环）id，0 表示未设置 */
    auraMod: number
    /** 是否计入失衡 */
    imbalance: boolean
    charMods: ModSlot[]
    meleeMods: ModSlot[]
    rangedMods: ModSlot[]
    skillWeaponMods: ModSlot[]
    /** 当前激活的 MOD 变体索引（0/1/2 ↔ 配置 A/B/C） */
    modVariantIndex: number
    /** 额外 MOD 变体（B/C）：索引 0/1 ↔ 配置 B/C */
    modVariants: ModVariant[]
    /** 启用的 BUFF：`[名称, 等级, 覆盖率?]`，覆盖率缺省为 1 */
    buffs: [string, number, number?][]
    /** 自定义 BUFF：`[属性名, 数值]` */
    customBuff: [string, number][]
    /** 已选魔灵 id，0 表示未选择 */
    petId: number
    /** 魔灵突破等级 0-3 */
    petLevel: number
    /** 魔灵主动技覆盖率 0-1 */
    petCoverage: number
    /** 魔灵覆盖率是否自动计算（按持续时间 / 实际冷却） */
    petAutoCoverage: boolean
    /** 魔灵潜质槽位（4 个，互不相同） */
    traits: TraitSlot[]
    /** 1 号协战角色 id；"-" 表示未设置 */
    team1: number | "-"
    team1Weapon: number | "-"
    /** 1 号协战角色关联的服务器构筑 id */
    team1Build: string
    /** 1 号协战构筑使用的 MOD 变体 */
    team1BuildVariant: VariantLetter
    team2: number | "-"
    team2Weapon: number | "-"
    team2Build: string
    team2BuildVariant: VariantLetter
    /** 是否启用时间轴 DPS */
    timelineDPS: boolean
    /** 是否使用全局背包特效等级（true 时忽略 effectConfig） */
    useGlobal: boolean
    /** 构筑本地特效等级：key 为 `m:<modId>` / `w:<weaponId>` */
    effectConfig: Record<string, number>
    /** DOT 频率设置 */
    dotSettings: DotFrequencySettings
    /** 时间线内联动作 */
    actions: InlineActions
}

/** MOD 槽位：`[魔之楔 id, 等级]`，null 表示空槽 */
export type ModSlot = [number, number] | null

/** 魔灵潜质槽位：`[基础潜质 id, 等级]`，null 表示空槽 */
export type TraitSlot = [number, number] | null

/** 一份 MOD 变体：槽位按类型分组，并带上中枢魔之楔 */
export interface ModVariant extends Record<ModType, ModSlot[]> {
    /** 中枢魔之楔 id；0 表示沿用配置 A 的中枢 */
    中枢: number
}

/** DOT 频率：每种来源每秒造成伤害的次数，0 表示不触发 */
export interface DotFrequencySettings {
    skill: number
    melee: number
    ranged: number
    skillweapon: number
    /** 手动指定存在自属性追加伤害 */
    forceOwnAdditionalDamage?: boolean
}

/** 时间线内联动作 */
export interface InlineActions {
    /** 是否启用内联动作 */
    enable: boolean
    /** 动作序列 */
    i: { s: string; d: number; t?: number; b?: number | "-" }[]
    /** 背景动作序列 */
    b: { s: string; i: number; t?: number; d?: number; b?: number | "-" }[]
    /** 血量序列 */
    hp: [number, number][]
    /** BUFF 组 */
    bgs: [string, number][][]
}

/**
 * 配装助手代码沙箱的接口
 *
 * 设置一律用 `CharSettings`，不再另包一层，
 * 在这里看到什么字段就能改什么字段。
 *
 * 覆盖范围以配装页 UI 能做的事为准：基本设置、武器、魔之楔、中枢与变体、魔灵与潜质、
 * BUFF、协战队友、敌人、目标函数与自定义变量、DOT 频率、特效等级、自动求解。
 * 凡是这里有的方法，都不要改用界面点击去完成。
 *
 * 两档写法：
 * - 语义档：`weapon` / `mods` / `buffs` 这些方法，填名字即可，适合常规改动。
 * - 自由档：`raw()` 拿原始设置对象随意改写 → `import` 落回或 `compute.build` 只算不改，
 *   再配 `current()` / `compute` 查乘区加成、充盈、耐受等内部量，适合 ablation 那类精细分析。
 *
 * 全部方法都是**异步**的（代码跑在独立线程里，读写页面状态要走一趟消息），一律 `await`。
 * 唯一例外是 `compute.build` / `current` / `simulate` 返回的视图：它在沙箱线程内重建出真正的
 * 构筑实例，之后查数值都在本地跑、不再往返，但方法仍写成异步以便统一 await。
 */

/** 一次写操作的返回：成功与否 + 变更描述 + 变更后的目标函数结果，便于在同一段代码里自检 */
export interface ApiResult {
    ok: boolean
    /** 失败原因（ok 为 false 时有值） */
    error?: string
    /** 做了什么的中文描述 */
    message: string
    /** 变更后的目标函数结果（写操作后有值） */
    damage?: number
}

/** MOD 槽位类型（与构筑页面板一致） */
export type ModType = "角色" | "近战" | "远程" | "同律"

/** MOD 变体字母 */
export type VariantLetter = "A" | "B" | "C"

/** 一个 MOD 槽位 */
export interface ModSlotView {
    /** 槽位下标（从 0 开始） */
    index: number
    id: number | null
    name: string | null
    level: number | null
}

/** 一把武器 */
export interface WeaponView {
    id: number
    name: string
    level: number
    refine: number
}

/** 一个协战队友 */
export interface TeamView {
    slot: 1 | 2
    /** 协战角色名；未设置为 null */
    char: string | null
    /** 协战武器名；未设置为 null */
    weapon: string | null
    /** 关联的服务器构筑 id；未关联为 null */
    build: string | null
    /** 关联构筑使用的 MOD 变体 */
    variant: VariantLetter
}

/** 一个魔灵潜质槽位 */
export interface TraitView {
    index: number
    /** 基础潜质 id；空槽为 null */
    bid: number | null
    name: string | null
    /** 潜质等级 1-3；空槽为 null */
    level: number | null
}

/** 一个 BUFF */
export interface BuffView {
    name: string
    level: number
    /** 覆盖率 0-1，缺省为 1 */
    coverage: number
}

/** 特效条目：特效表里挂在某个魔之楔 / 武器 id 上的特效 */
export interface EffectEntry {
    /** 归属：mod = 魔之楔特效，weapon = 武器特效 */
    source: "mod" | "weapon"
    /** 挂载对象（魔之楔 / 武器）的 id */
    id: number
    /** 挂载对象的名称（特效表条目本身可能同名多档，用它回查 `data.mods` / `data.weapons`） */
    owner: string
    名称: string
    描述: string
    /** 特效等级上限；写入 `effect({ level })` 时别超过它 */
    maxLevel: number
    /** 限定元素（多为武器特效）；undefined 表示不限 */
    限定?: string
}

/** 一个带特效件的生效等级 */
export interface EffectLevelView {
    source: "mod" | "weapon"
    id: number
    name: string
    /** 当前生效的特效等级；0 表示未配置或限定不符（useGlobal 口径），构筑本地口径缺省按最大档 */
    level: number
    /** 等级上限 */
    maxLevel: number
}

/** 当前构筑全貌 */
export interface BuildState {
    char: string
    charId: number
    /** 角色等级 1-80 */
    charLevel: number
    /** 技能等级 1-12 */
    skillLevel: number
    /** 当前血量百分比 0-1（影响背水类收益） */
    hpPercent: number
    /** 和鸣增益 0-3 */
    resonanceGain: number
    /** 是否开启 Rouge 模式 */
    isRouge: boolean
    /** 额外精通武器类型，空串为未解锁 */
    extraMastery: string
    /** 是否计入失衡 */
    imbalance: boolean
    /** 是否使用全局背包特效等级 */
    useGlobal: boolean
    /** 是否启用时间轴 DPS */
    timelineDPS: boolean
    /** 当前 MOD 变体 */
    variant: VariantLetter
    /** 已有变体数量 1-3 */
    variantCount: number
    /** 中枢魔之楔 */
    aura: { id: number; name: string } | null
    melee: WeaponView
    ranged: WeaponView
    mods: Record<ModType, ModSlotView[]>
    pet: { id: number; name: string; level: number; coverage: number; autoCoverage: boolean } | null
    traits: TraitView[]
    buffs: BuffView[]
    /** 自定义 BUFF：属性名 → 数值 */
    customBuff: { property: string; value: number }[]
    /** 当前构筑里带特效的件与生效等级（口径与计算侧一致：useGlobal 走全局背包，否则走构筑本地配置；中枢不参与） */
    effects: EffectLevelView[]
    team: { 1: TeamView; 2: TeamView }
    enemy: { id: number; name: string; level: number; resistance: number }
    /** 计算技能（baseName） */
    base: string
    /** 目标函数表达式 */
    target: string
    /** 自定义变量：变量名 → 表达式 */
    variables: { name: string; expression: string }[]
    /** DOT 频率：每秒触发次数 */
    dot: { skill: number; melee: number; ranged: number; skillweapon: number; forceOwnAdditionalDamage?: boolean }
    /** 目标函数结果 */
    damage: number
}

/** 魔之楔条目 */
export interface ModEntry {
    id: number
    名称: string
    类型: ModType
    系列: string
    品质: string
    耐受: number
    /** 满级词条文本（前若干条） */
    词条: string[]
}

/** 武器条目 */
export interface WeaponEntry {
    id: number
    名称: string
    /** 例如 ["近战", "单手剑"] */
    类型: string[]
    伤害类型: string
    攻击: number
    暴击: number
    暴伤: number
    触发: number
}

/** 角色条目 */
export interface CharEntry {
    id: number
    名称: string
    属性: string
}

/** BUFF 条目 */
export interface BuffEntry {
    名称: string
    描述: string
    /** 等级上限（数据里的 mx）；写入 `buff(name, level)` 时 level 别超过它 */
    maxLevel: number
    /** 限定：角色 id / 角色名 / 属性名；undefined 表示不限 */
    限定?: string | number
}

/** 魔灵条目 */
export interface PetEntry {
    id: number
    名称: string
    描述: string
}

/** 魔灵潜质档位 */
export interface TraitEntry {
    /** 潜质条目 id */
    id: number
    /** 基础潜质 id（槽位存的是它） */
    bid: number
    名称: string
    /** 稀有度 3/4/5 */
    r: number
    /** 潜质等级 1-3（= r - 2） */
    level: number
    描述: string
}

/** 数据查询：查不到就返回空数组，模型据此换个名字再查 */
export interface BuildData {
    mods(query?: { keyword?: string; type?: ModType; series?: string; limit?: number }): Promise<ModEntry[]>
    weapons(query?: { keyword?: string; type?: string; limit?: number }): Promise<WeaponEntry[]>
    chars(query?: { keyword?: string }): Promise<CharEntry[]>
    /**
     * BUFF 列表
     *
     * scope 缺省为 "all"（全表，查名称 / 描述用）；`scope: "available"` 只返回当前构筑
     * 可用的条目（与配装页 BUFF 面板同口径：剔除魔灵相关、按主控与助战过滤限定），
     * 「现在能挂哪些 BUFF」走这个口径。
     */
    buffs(query?: { keyword?: string; limit?: number; scope?: "all" | "available" }): Promise<BuffEntry[]>
    pets(query?: { keyword?: string }): Promise<PetEntry[]>
    traits(query?: { keyword?: string }): Promise<TraitEntry[]>
    /** 特效表：哪些魔之楔 / 武器带特效、效果说明与等级上限；设置等级用 `effect`，当前生效等级看 `state().effects` */
    effects(query?: { keyword?: string; source?: "mod" | "weapon"; limit?: number }): Promise<EffectEntry[]>
}

/** 界面操作：只有在写入方法覆盖不到时才用（例如某个面板上没暴露成设置项的操作） */
export interface BuildUi {
    readPage(query?: { scope?: "auto" | "page" | "sidebar" | "main" | "dialog"; contains?: string; maxNodes?: number }): Promise<string>
    click(target: { ref?: string; selector?: string; label?: string; nth?: number }): Promise<string>
    type(target: { ref?: string; selector?: string; label?: string; nth?: number }, text: string): Promise<string>
    select(target: { ref?: string; selector?: string; label?: string; nth?: number }, option: string): Promise<string>
    press(key: string): Promise<string>
}

/**
 * 一份构筑的深度视图（改不动它指向的构筑，只能读）。
 *
 * 除了目标函数与属性表，还能查属性加成、充盈威力、耐受占用、已装 MOD、技能清单与自定义变量取值，
 * 「算一个数、比两套方案、查某个乘区」这类需求走这里；实在没有的用 raw 逃生舱直接读 CharBuild。
 */
export interface CharBuildView {
    /** 目标函数结果 */
    damage(): Promise<number>
    /** 角色与武器属性表（键为属性名） */
    attributes(): Promise<Record<string, number>>
    /** 某个属性的总加成；prefix 为作用域（角色 / 近战 / 远程 / 同律），includeMods 为 false 时排除 MOD 只算 BUFF 与武器效果 */
    bonus(attr: string, prefix?: string, includeMods?: boolean): Promise<number>
    /** 各武器对充盈威力的贡献：溢出触发率 × 充盈转化 */
    fullness(): Promise<{ weapon: string; triggerRate: number; conversionRate: number; value: number }[]>
    /** 耐受占用与上限；不给 type 时返回四类各自的占用 */
    cost(): Promise<Record<ModType, { used: number; cap: number }>>
    cost(type: ModType): Promise<{ used: number; cap: number }>
    /** 已装备的 MOD：名称 / 等级 / 耐受 */
    mods(type: ModType): Promise<{ name: string; level: number; tolerance: number }[]>
    /** 近战与远程武器名 */
    weapons(): Promise<{ 近战: string; 远程: string }>
    /** 全部技能名（角色技能 + 武器技能），改计算技能 baseName 时先在这拿准确名字 */
    skills(): Promise<string[]>
    /** 自定义变量求值：变量名必须是当前构筑里已定义的 */
    variable(name: string): Promise<number>
    /** 在构筑上下文里求一个表达式的值（可用属性名、技能字段与自定义变量） */
    eval(expression: string): Promise<number>
    /** 逃生舱：真正的 CharBuild 实例，上面的方法没覆盖到时直接读它（改它不会影响页面上的构筑） */
    raw: unknown
}

/**
 * 计算侧：直接构造等级化对象，或按构筑 JSON 复现一份独立构筑。
 *
 * 需要「不改当前构筑、先算一版看看」（对比几套方案、验证某个 MOD 的收益）时用这里，
 * 改当前构筑请用上面的写入方法。
 *
 * 等级化对象过不了线程边界，因此这里返回的是**纯数据**（字段与对应 Leveled* 实例一致），
 * 不是类实例。
 */
export interface BuildCompute {
    /** 等级化角色（按 id 或角色名） */
    char(idOrName: string | number, level?: number): Promise<Record<string, unknown>>
    /** 等级化魔之楔；buffLv 为特效等级 */
    mod(id: number, level?: number, buffLv?: number): Promise<Record<string, unknown>>
    /** 等级化武器（按 id 或武器名） */
    weapon(idOrName: string | number, refine?: number, level?: number, effectLv?: number): Promise<Record<string, unknown>>
    /** 等级化 BUFF */
    buff(name: string, level?: number): Promise<Record<string, unknown>>
    /** 等级化魔灵 */
    pet(id: number, level?: number): Promise<Record<string, unknown>>
    /** 等级化怪物 */
    monster(id: number, level?: number, isRouge?: boolean): Promise<Record<string, unknown>>
    /** 按角色 + 构筑设置构造一份独立 CharBuild；settings 可以给残缺对象，缺的字段按默认补全 */
    build(charIdOrName: string | number, settings: Partial<CharSettings>): Promise<CharBuildView>
}

/** 设置对象的处理工具：自由改写设置时的配套（falu 脚本那类写法用得上） */
export interface BuildUtil {
    /** 补全缺省字段，得到一份完整的构筑设置（任意残缺对象都能喂进来） */
    normalize(settings: Partial<CharSettings>): Promise<CharSettings>
    /** 把设置对象序列化成构筑 JSON 字符串 */
    serialize(settings: Partial<CharSettings>): Promise<string>
    /** 一份全新的默认设置（从它改起比从 raw 改更干净） */
    defaults(): Promise<CharSettings>
    /** 深拷贝，避免改到页面上的那份设置 */
    clone(settings: CharSettings): Promise<CharSettings>
}

/** 自动求解结果 */
export interface AutoSolveResult {
    applied: boolean
    damage: number
    weapons: { 近战: string; 远程: string }
    mods: string[]
    iterations: number
}

/**
 * 沙箱里唯一可访问的对象。
 *
 * 所有写操作改的都是当前角色的构筑设置，改完立刻生效——`damage()` 会同步重算，
 * 因此可以在一段代码里连续「换装备 → 比数值 → 再换」，不必为了每次改动多跑一轮对话。
 */
export interface BuildApi {
    /** 读取当前构筑全貌（含目标函数结果） */
    state(): Promise<BuildState>
    /** 目标函数结果；没有目标函数时为 0 */
    damage(): Promise<number>
    /** 角色与武器属性表（键为属性名） */
    attributes(): Promise<Record<string, number>>
    /** 本次运行累计的改动日志 */
    log(): Promise<string[]>

    /** 切换角色（按名称，需与资料库一致） */
    char(name: string): Promise<ApiResult>
    /** 改角色等级与技能等级 */
    level(input: { char?: number; skill?: number }): Promise<ApiResult>
    /** 改基本设置：血量百分比、和鸣增益、Rouge、额外精通、失衡、全局背包、时间轴 DPS */
    settings(input: {
        hpPercent?: number
        resonanceGain?: number
        isRouge?: boolean
        extraMastery?: string
        imbalance?: boolean
        useGlobal?: boolean
        timelineDPS?: boolean
    }): Promise<ApiResult>

    /** 换武器：slot 为 melee / ranged，name 与 id 给一个即可 */
    weapon(input: { slot: "melee" | "ranged"; name?: string; id?: number; level?: number; refine?: number }): Promise<ApiResult>
    /** 设置 MOD / 武器特效等级（level 为 0 表示移除） */
    effect(input: { source: "mod" | "weapon"; name?: string; id?: number; level: number }): Promise<ApiResult>

    /** 换单个魔之楔：id 为 0 或 name 为空串表示卸下 */
    mod(input: { type: ModType; slot: number; name?: string; id?: number; level?: number }): Promise<ApiResult>
    /** 一次性铺满某一类 MOD 的全部槽位（批量改动优先用它，省去多次调用） */
    mods(input: {
        type: ModType
        list: ({ name?: string; id?: number; level?: number } | null)[]
        variant?: VariantLetter
    }): Promise<ApiResult>
    /** 换中枢魔之楔（光环） */
    aura(nameOrId: string | number): Promise<ApiResult>
    /** 切换 MOD 变体 A / B / C */
    variant(letter: VariantLetter): Promise<ApiResult>
    /** 以当前变体为模板新增一份变体（最多 A/B/C 三份） */
    addVariant(): Promise<ApiResult>
    /** 删除最后一份变体 */
    removeVariant(): Promise<ApiResult>

    /** 换魔灵；level 为突破等级 0-3，coverage 为主动技覆盖率 0-1 */
    pet(input: { name?: string; id?: number; level?: number; coverage?: number; autoCoverage?: boolean }): Promise<ApiResult>
    /** 装 / 改魔灵潜质：slot 0-3，name 给潜质名（如「凶猛」），level 1-3；空串或 0 表示卸下 */
    trait(input: { slot: number; name?: string; bid?: number; level?: number }): Promise<ApiResult>
    /** 一次性设置四个潜质槽位 */
    traits(list: ({ name?: string; bid?: number; level?: number } | null)[]): Promise<ApiResult>

    /** 加 / 改 BUFF，level 为 0 等同于移除 */
    buff(name: string, level?: number, coverage?: number): Promise<ApiResult>
    /** 移除 BUFF */
    removeBuff(name: string): Promise<ApiResult>
    /** 一次性设置多个 BUFF */
    buffs(list: { name: string; level?: number; coverage?: number }[]): Promise<ApiResult>
    /** 设置自定义 BUFF（属性名 → 数值）；value 为 0 时移除 */
    customBuff(property: string, value: number): Promise<ApiResult>

    /** 设置协战队友：clear 为 true 时清空该位 */
    team(input: {
        slot: 1 | 2
        char?: string
        weapon?: string
        build?: string
        variant?: VariantLetter
        clear?: boolean
    }): Promise<ApiResult>

    /** 改敌人（目标） */
    enemy(input: { name?: string; id?: number; level?: number; resistance?: number }): Promise<ApiResult>

    /** 改计算技能（baseName） */
    base(name: string): Promise<ApiResult>
    /** 改目标函数表达式 */
    target(expr: string): Promise<ApiResult>
    /** 设置自定义变量；expression 为空串时删除该变量 */
    variable(name: string, expression: string): Promise<ApiResult>

    /** 改 DOT 频率（每秒触发次数，0 表示不触发） */
    dot(input: {
        skill?: number
        melee?: number
        ranged?: number
        skillweapon?: number
        forceOwnAdditionalDamage?: boolean
    }): Promise<ApiResult>

    /** 跑一次全局自动求解；apply 为 true 时写回当前构筑 */
    autoSolve(input?: {
        useInv?: boolean
        includeTypes?: ModType[]
        preserveTypes?: ModType[]
        includeMelee?: boolean
        includeRanged?: boolean
        apply?: boolean
    }): Promise<AutoSolveResult>

    /** 恢复当前角色的默认配置（武器保留，其余清空） */
    reset(): Promise<ApiResult>
    /** 逃生舱：直接改原始设置的字段（上面的方法覆盖不到时才用） */
    patch(partial: Partial<CharSettings>): Promise<ApiResult>

    /** 导出当前构筑的 JSON（可交给用户存档或复制到别处） */
    export(): Promise<string>
    /** 载入设置对象 / 构筑 JSON 覆盖当前配置（用它复现用户给的真实数据） */
    import(json: string | Partial<CharSettings>): Promise<ApiResult>
    /** 用设置对象 / 构筑 JSON 算一次，不动当前构筑（对比几套方案时用） */
    simulate(json: string | Partial<CharSettings>, charName?: string): Promise<CharBuildView>

    /**
     * 当前构筑设置
     *
     * 想自由改写设置时用它：拿到手可以任意增删改字段（改 customVariables 里的表达式字符串、
     * 过滤 buffs、直接改 enemyResistance……），再交给 `import` 落回页面，或交给 `compute.build` 只算不改。
     */
    raw(): Promise<CharSettings>
    /** 当前页面上这份构筑的深度视图：查乘区加成、充盈、耐受、技能清单时用 */
    current(): Promise<CharBuildView>

    /** 计算侧：构造等级化对象与独立构筑 */
    compute: BuildCompute
    /** 设置对象的处理工具 */
    util: BuildUtil
    /** 数据查询 */
    data: BuildData
    /** 界面操作（兜底） */
    ui: BuildUi
}

/** 沙箱里的全局：`build` 是唯一的门，其余浏览器 API 一律不可访问 */
export interface BuildSandboxGlobal {
    build: BuildApi
}
