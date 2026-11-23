import type { CharAttr, CharBuild } from "./CharBuild"
import type { CharSettings } from "./charSettings"
import { charMap } from "./d"
import { toExprIdentifier } from "./expr-name"
import type { LeveledSkill } from "./leveled/LeveledSkill"

/** 构筑角色位：主控 / 协战一 / 协战二（纯字符串，随快照与请求序列化） */
export type TeamRole = "main" | "assist1" | "assist2"

/** 协战位（resolver 只解析这两个槽位） */
export type AssistSide = "assist1" | "assist2"

/**
 * `角色名::属性` 的只读解析器。
 *
 * 由 `CharBuild` 从完整 `CharSettings` 内部派生，不持有调用方注入的对象；
 * 协战 build 以 restricted 形式取得受限命名空间表（全部角色名 + 槽位别名，属性恒不可解析 → 嵌套引用 0，无环）。
 */
export interface TeamResolver {
    /** restricted（协战）返回全部角色名 + 槽位别名；主控返回已配置协战角色名 + 槽位别名 */
    namespaces(): string[]
    /** 是否为协战命名空间（不含主控自身角色名，自身名由 CharBuild 直接处理） */
    isTeamNamespace(ns: string): boolean
    /** 读取协战最终属性；命名空间或属性不可解析时返回 undefined */
    attrOf(ns: string, attribute: string): number | undefined
    /** 是否为协战技能命名空间（技能名 / safeName / 表达式标识符） */
    hasSkillNamespace?(ns: string): boolean
    /** 协战技能中是否存在该字段 */
    hasSkillField?(ns: string, fieldName: string): boolean
    /** 读取协战技能字段值；命名空间或字段不可解析时返回 undefined */
    skillFieldOf?(ns: string, fieldName: string): number | undefined
}

/** resolver 实际消费的配置字段（避免依赖完整配置形状） */
export type TeamResolverSettings = Pick<CharSettings, "team1" | "team2" | "assist1" | "assist2">

/** 槽位别名：`协战1::技能威力` 与 `assist1::技能威力` 等价（wasm 门控同源引用） */
export const SIDE_ALIASES: Record<AssistSide, readonly string[]> = {
    assist1: ["协战1", "assist1"],
    assist2: ["协战2", "assist2"],
}

const SIDES: readonly AssistSide[] = ["assist1", "assist2"]

/** 全部角色名：每次从 `charMap` 现算（数据包水合会重建 charMap，不得做模块级缓存） */
function getCharacterNamespaces(): readonly string[] {
    return [...new Set([...charMap.values()].map(char => char.名称).filter((name): name is string => Boolean(name)))]
}

interface SideInfo {
    side: AssistSide
    /** 有效角色 id；0 表示未配置 */
    charId: number
    /** 角色名（经 charMap 反查） */
    name?: string
}

/**
 * 读取单侧协战角色信息。
 * @param settings 主控配置
 * @param side 协战位
 * @returns 角色 id 与名称（无效 id 时 name 为空）
 */
function readSide(settings: TeamResolverSettings, side: AssistSide): SideInfo {
    const value = side === "assist1" ? settings.team1 : settings.team2
    const charId = typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
    return { side, charId, name: charId ? charMap.get(charId)?.名称 : undefined }
}

/**
 * 从完整协战配置创建命名空间解析器。
 *
 * - 主控：命名空间取有效 `teamN` 角色名 + 槽位别名，`attrOf` 懒构造协战 build 并缓存其 `calculateAttributes()`；
 * - 协战：`teamN` 已清空，但承认**全部角色名** + 槽位别名（含本人与主控），`attrOf` 恒为 undefined，
 *   保证协战内按姓名 / 别名引用队友都是干净的 0；
 * - 两侧都未配置时返回 undefined（未知命名空间按既有报错处理）。
 *
 * 不变量：协战 build 的 settings 必须保留 `assist1/assist2`，这是 restricted resolver 的存在前提
 * （`createAssistBuildFromSettings` 已明确保留，见 CharBuildHelper）。
 *
 * 查询契约（`角色名::属性`）：
 * - `assistN.enabled` **不参与**解析：它只决定该协战是否计入目标函数合计，停用的协战仍可按角色名 / 槽位别名
 *   查询到自身面板（主控 BUFF、自定义变量都依赖这一点）；
 * - 协战必须有武器才能被查询：`createAssistBuild` 返回 `undefined` 时 `attrOf` 恒为 `undefined`（求值得 0），
 *   命名空间仍然注册，因此不会走「无效命名空间」报错路径。
 * @param settings 完整角色配置
 * @param role 当前 build 的角色位
 * @param createAssistBuild 懒构造协战 build 的回调（仅主控会调用）
 * @returns 解析器；没有任何有效协战配置时为 undefined
 */
export function createTeamResolver(
    settings: TeamResolverSettings,
    role: TeamRole,
    createAssistBuild: (side: AssistSide) => CharBuild | undefined
): TeamResolver | undefined {
    const sides = SIDES.map(side => readSide(settings, side))
    const configured = role === "main" ? sides.some(info => info.charId > 0) : Boolean(settings.assist1) || Boolean(settings.assist2)
    if (!configured) return undefined

    if (role !== "main") {
        // 协战侧不区分是否配置：任意角色名与槽位别名都识别为团队命名空间，属性恒不可用
        const restricted = new Set([...getCharacterNamespaces(), ...SIDE_ALIASES.assist1, ...SIDE_ALIASES.assist2])
        return {
            namespaces: () => [...restricted],
            isTeamNamespace: ns => restricted.has(ns),
            attrOf: () => undefined,
        }
    }

    // 角色名重名时按 assist1 → assist2 取名；槽位别名始终可消歧
    const index = new Map<string, SideInfo>()
    for (const info of sides) {
        if (info.name && !index.has(info.name)) index.set(info.name, info)
    }
    for (const info of sides) {
        for (const alias of SIDE_ALIASES[info.side]) {
            if (!index.has(alias)) index.set(alias, info)
        }
    }
    const namespaces = [...index.keys()]

    const attrCache = new Map<AssistSide, CharAttr | undefined>()
    const buildCache = new Map<AssistSide, CharBuild | undefined>()
    /**
     * 懒构造协战 build（属性与技能字段共用一份缓存）：构造失败按不可解析处理，不打断主控求值。
     * @param side 协战位
     * @returns 协战构筑；未配置或构造失败时为 undefined
     */
    const peerBuild = (side: AssistSide) => {
        if (!buildCache.has(side)) {
            let build: CharBuild | undefined
            try {
                build = createAssistBuild(side)
            } catch (error) {
                console.warn("协战构筑构造失败", error)
            }
            buildCache.set(side, build)
        }
        return buildCache.get(side)
    }
    /**
     * 懒算协战最终属性：只取 `calculateAttributes()` 面板，失败按不可解析处理（不打断主控求值）。
     * @param side 协战位
     * @returns 属性快照；未配置或计算失败时为 undefined
     */
    const peerAttrs = (side: AssistSide) => {
        if (!attrCache.has(side)) {
            let attrs: CharAttr | undefined
            try {
                attrs = peerBuild(side)?.calculateAttributes()
            } catch (error) {
                console.warn("协战属性计算失败", error)
            }
            attrCache.set(side, attrs)
        }
        return attrCache.get(side)
    }

    /** 技能命名空间 → 协战构筑与技能（assist1 优先，与角色名冲突口径一致） */
    interface TeamSkillBinding {
        build?: CharBuild
        skill?: LeveledSkill
        /** 无构筑（如协战缺武器）时按静态数据注册的字段名，仅用于存在性判定 */
        fields?: { exprName: string; safeName: string; 名称: string }[]
    }
    let skillIndex: Map<string, TeamSkillBinding> | undefined
    /**
     * 懒构建协战技能命名空间索引：技能名 / safeName / 表达式标识符三种写法都可命中。
     * 无构筑的协战仍注册命名空间（求值为 0），与 `角色名::属性` 的查询契约一致。
     * @returns 命名空间索引
     */
    const getSkillIndex = () => {
        if (skillIndex) return skillIndex
        const byNamespace = new Map<string, TeamSkillBinding>()
        for (const info of sides) {
            if (info.charId <= 0) continue
            const build = peerBuild(info.side)
            if (build) {
                for (const skill of build.skills) {
                    for (const key of [skill.exprName, skill.safeName, skill.名称]) {
                        if (key && !byNamespace.has(key)) byNamespace.set(key, { build, skill })
                    }
                }
                continue
            }
            for (const skill of charMap.get(info.charId)?.技能 ?? []) {
                const skillName = skill.名称
                if (!skillName) continue
                const fields = (skill.字段 ?? []).map(field => ({
                    exprName: toExprIdentifier(field.名称),
                    safeName: field.名称.replace(/\//g, "_"),
                    名称: field.名称,
                }))
                for (const key of [toExprIdentifier(skillName), skillName.replace(/\//g, "_"), skillName]) {
                    if (key && !byNamespace.has(key)) byNamespace.set(key, { fields })
                }
            }
        }
        skillIndex = byNamespace
        return byNamespace
    }
    const skillValueCache = new Map<string, number | undefined>()

    return {
        namespaces: () => [...namespaces],
        isTeamNamespace: ns => index.has(ns),
        attrOf: (ns, attribute) => {
            const info = index.get(ns)
            if (!info) return undefined
            const value = peerAttrs(info.side)?.[attribute as keyof CharAttr]
            return typeof value === "number" ? value : undefined
        },
        hasSkillNamespace: ns => getSkillIndex().has(ns),
        hasSkillField: (ns, fieldName) => {
            const binding = getSkillIndex().get(ns)
            if (!binding) return false
            const fields = binding.skill?.字段 ?? binding.fields ?? []
            return fields.some(
                field => field.exprName.includes(fieldName) || field.safeName.includes(fieldName) || field.名称.includes(fieldName)
            )
        },
        skillFieldOf: (ns, fieldName) => {
            const binding = getSkillIndex().get(ns)
            if (!binding?.build || !binding.skill) return undefined
            const cacheKey = `${binding.skill.exprName}::${fieldName}`
            if (skillValueCache.has(cacheKey)) return skillValueCache.get(cacheKey)
            let value: number | undefined
            try {
                const expression = `${binding.skill.exprName}::${fieldName}`
                if (!binding.build.validateAST(expression)) {
                    const result = binding.build.evaluateAST(expression)
                    value = Number.isFinite(result) ? result : undefined
                }
            } catch (error) {
                console.warn("协战技能字段求值失败", error)
            }
            skillValueCache.set(cacheKey, value)
            return value
        },
    }
}
