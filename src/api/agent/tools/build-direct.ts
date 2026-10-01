/**
 * 配装助手的「直接数据 / 直接改配置」工具（兜底路径）。
 *
 * 首选路径是配装页 UI 工具（`build-ui.ts`）——与真人操作等价，界面与数据必然一致。
 * 但有些事用界面做既慢又容易误伤：批量核对 MOD 特效等级、一次性读取角色完整数值、
 * 跑一整套自动求解。这些保留为直接工具，模型在 UI 路径走不通或代价过高时使用。
 *
 * 直接工具改的是 CharSettings 里的状态，界面会在下一次渲染时跟上；
 * 改完仍然建议用 read_page 复核一次界面是否如预期。
 */

import { useLocalStorage } from "@vueuse/core"
import type { Ref } from "vue"
import { z } from "zod"
import type { AgentTool } from "@/api/agent/tool"
import { type CharSettings, getModVariantSlots, MOD_SLOT_COUNTS } from "@/composables/useCharSettings"
import {
    buffData,
    charData,
    charMap,
    LeveledCharHelper,
    type LeveledMod,
    LeveledModHelper,
    type LeveledSkill,
    type LeveledSkillField,
    LeveledSkillWeapon,
    type LeveledWeapon,
    type ModTypeKey,
    modData,
    modEffectMap,
    weaponData,
    weaponEffectMap,
    weaponMap,
} from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import type { useInvStore } from "@/store/inv"
import { formatParamText, getParamTemplate } from "@/utils/param-text"

type EffectSourceType = "mod" | "weapon"

type EffectTarget = {
    sourceType: EffectSourceType
    id: number
    名称: string
    特效名称: string
    特效描述: string
    特效限定?: string
    特效最大等级: number
    额外信息: Record<string, unknown>
}

/**
 * 配装直接工具的执行体。
 *
 * 对外只暴露一个入口 {@link BuildToolHost.invoke}：工具名 + 参数进，结果文本出，
 * 这样工具清单换成什么形态定义（JSON Schema 还是别的）都不影响这里的逻辑。
 */
export class BuildToolHost {
    /**
     * 创建执行体。
     * @param charSettings 当前角色的构筑设置（ref）
     * @param selectedChar 当前选中角色名（ref）
     * @param inv 库存 store
     */
    constructor(
        public charSettings: Ref<CharSettings>,
        public selectedChar: Ref<string>,
        public inv: ReturnType<typeof useInvStore>
    ) {}

    /**
     * 由当前角色名解析角色 id，供构造 CharBuild 使用。
     * @returns 当前角色 id
     */
    private getSelectedCharId(): number {
        return charMap.get(this.selectedChar.value)?.id || 0
    }

    /**
     * 解析工具参数，兼容对象和JSON字符串
     * @param rawArgs 原始参数
     * @returns 规范化后的参数对象
     */
    private parseToolArgs(rawArgs: unknown): Record<string, unknown> {
        if (typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)) {
            return rawArgs as Record<string, unknown>
        }
        if (typeof rawArgs === "string") {
            try {
                const parsed = JSON.parse(rawArgs)
                if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>
                }
            } catch {
                return {}
            }
        }
        return {}
    }

    /**
     * 分词关键词，支持空格、逗号、顿号、分号、竖线分隔
     * @param keywords 关键词原始文本
     * @returns 去重后的关键词数组（小写）
     */
    private parseKeywords(keywords?: string): string[] {
        if (!keywords) {
            return []
        }
        const tokens = keywords
            .split(/[\s,，、;；|]+/)
            .map(token => token.trim().toLowerCase())
            .filter(Boolean)
        return Array.from(new Set(tokens))
    }

    /**
     * 规范化MOD类型参数，兼容 skillWeaponMods 别名
     * @param rawTypes 原始类型数组
     * @returns 规范化后的类型数组
     */
    private normalizeModTypes(rawTypes?: string[]): ModTypeKey[] {
        if (!Array.isArray(rawTypes)) {
            return []
        }

        const normalized = rawTypes
            .map(type => (type === "skillWeaponMods" ? "skillMods" : type))
            .filter(
                (type): type is ModTypeKey => type === "charMods" || type === "meleeMods" || type === "rangedMods" || type === "skillMods"
            )

        return Array.from(new Set(normalized))
    }

    /**
     * 获取当前角色属性
     * @returns 当前角色属性，缺失时返回 "any"
     */
    private getCurrentCharacterElement(): string {
        return charData.find(char => char.名称 === this.selectedChar.value)?.属性 || "any"
    }

    /**
     * 统一归一化文本数组参数（支持数组与逗号分隔字符串）
     * @param raw 原始参数
     * @returns 归一化后的文本数组（小写去重）
     */
    private normalizeTextArray(raw?: string[] | string): string[] {
        if (!raw) {
            return []
        }
        const values = Array.isArray(raw) ? raw : this.parseKeywords(raw)
        return Array.from(new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean)))
    }

    /**
     * 统一归一化数值数组参数（支持单值与数组）
     * @param raw 原始参数
     * @returns 归一化后的整数数组
     */
    private normalizeNumberArray(raw?: number[] | number): number[] {
        if (raw === undefined) {
            return []
        }
        const values = Array.isArray(raw) ? raw : [raw]
        return Array.from(new Set(values.filter(value => Number.isFinite(value)).map(value => Math.floor(value))))
    }

    /**
     * 判断文本是否匹配任一关键词（包含匹配）
     * @param text 文本
     * @param keywords 关键词集合
     * @returns 是否匹配
     */
    private matchKeywords(text: string, keywords: string[]): boolean {
        if (keywords.length === 0) {
            return true
        }
        const normalizedText = text.toLowerCase()
        return keywords.some(keyword => normalizedText.includes(keyword))
    }

    /**
     * 解析 MOD 对应的特效信息
     * @param mod MOD 数据
     * @returns 特效信息，不存在时返回 null
     */
    private getModEffectMeta(mod: (typeof modData)[number]): {
        name: string
        description: string
        limit?: string
        maxLevel: number
    } | null {
        // MOD 特效按 id 精确匹配（金色/紫色分别配置）
        const effect = modEffectMap.get(mod.id)
        if (!effect) {
            return null
        }

        const effectQuality = typeof effect.品质 === "string" ? effect.品质 : undefined
        if (effectQuality && effectQuality !== mod.品质) {
            return null
        }

        return {
            name: effect.名称,
            description: effect.描述 || "",
            limit: typeof effect.限定 === "string" ? effect.限定 : undefined,
            maxLevel: Math.max(1, typeof effect.mx === "number" ? Math.floor(effect.mx) : 1),
        }
    }

    /**
     * 解析武器对应的特效信息
     * @param weaponId 武器ID
     * @returns 特效信息，不存在时返回 null
     */
    private getWeaponEffectMeta(weaponId: number): {
        name: string
        description: string
        limit?: string
        maxLevel: number
    } | null {
        const weapon = weaponMap.get(weaponId)
        if (!weapon) {
            return null
        }
        // 武器特效按 id 精确匹配
        const effect = weaponEffectMap.get(weapon.id)
        if (!effect) {
            return null
        }
        return {
            name: effect.名称,
            description: effect.描述 || "",
            limit: typeof effect.限定 === "string" ? effect.限定 : undefined,
            maxLevel: Math.max(1, typeof effect.mx === "number" ? Math.floor(effect.mx) : 1),
        }
    }

    /**
     * 判断特效是否适配当前角色属性
     * @param effectLimit 特效限定属性
     * @param currentElement 当前角色属性
     * @returns 是否可用
     */
    private isEffectAvailable(effectLimit: string | undefined, currentElement: string): boolean {
        return !effectLimit || currentElement === "any" || effectLimit === currentElement
    }

    /**
     * 获取武器特效原始配置等级（不做属性限定校验）
     * @param weaponId 武器ID
     * @returns 原始配置等级
     */
    private getWeaponRawEffectLevel(weaponId: number): number {
        const rawLevel = this.inv.wLv[weaponId]
        return typeof rawLevel === "number" && Number.isFinite(rawLevel) ? rawLevel : 0
    }

    /**
     * 将等级限制在合法范围内
     * @param level 目标等级
     * @param maxLevel 最大等级
     * @returns 归一化后的等级
     */
    private clampEffectLevel(level: number, maxLevel: number): number {
        if (!Number.isFinite(level)) {
            return 0
        }
        return Math.max(0, Math.min(maxLevel, Math.floor(level)))
    }

    /**
     * 采集可操作的特效目标（支持按MOD/武器及名称批量筛选）
     * @param params 查询参数
     * @returns 特效目标列表
     */
    private collectEffectTargets(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
    }): EffectTarget[] {
        const sourceType = params.sourceType || "all"
        const modIdSet = new Set(this.normalizeNumberArray(params.modIds))
        const weaponIdSet = new Set(this.normalizeNumberArray(params.weaponIds))
        const modNameKeywords = this.normalizeTextArray(params.modNames)
        const weaponNameKeywords = this.normalizeTextArray(params.weaponNames)
        const effectNameKeywords = this.normalizeTextArray(params.effectNames)

        const hasModSourceFilter = modIdSet.size > 0 || modNameKeywords.length > 0
        const hasWeaponSourceFilter = weaponIdSet.size > 0 || weaponNameKeywords.length > 0
        const includeModsByDefault = !hasWeaponSourceFilter || hasModSourceFilter || effectNameKeywords.length > 0
        const includeWeaponsByDefault = !hasModSourceFilter || hasWeaponSourceFilter || effectNameKeywords.length > 0

        const targets: EffectTarget[] = []

        if (sourceType !== "weapon" && includeModsByDefault) {
            modData.forEach(mod => {
                const effectMeta = this.getModEffectMeta(mod)
                if (!effectMeta) {
                    return
                }
                if (modIdSet.size > 0 && !modIdSet.has(mod.id)) {
                    return
                }
                if (modNameKeywords.length > 0 && !this.matchKeywords(mod.名称, modNameKeywords)) {
                    return
                }
                if (effectNameKeywords.length > 0 && !this.matchKeywords(effectMeta.name, effectNameKeywords)) {
                    return
                }
                targets.push({
                    sourceType: "mod",
                    id: mod.id,
                    名称: mod.名称,
                    特效名称: effectMeta.name,
                    特效描述: effectMeta.description,
                    特效限定: effectMeta.limit,
                    特效最大等级: effectMeta.maxLevel,
                    额外信息: {
                        品质: mod.品质,
                        类型: mod.类型,
                        系列: mod.系列,
                        属性: mod.属性,
                    },
                })
            })
        }

        if (sourceType !== "mod" && includeWeaponsByDefault) {
            weaponData.forEach(weapon => {
                const effectMeta = this.getWeaponEffectMeta(weapon.id)
                if (!effectMeta) {
                    return
                }
                if (weaponIdSet.size > 0 && !weaponIdSet.has(weapon.id)) {
                    return
                }
                if (weaponNameKeywords.length > 0 && !this.matchKeywords(weapon.名称, weaponNameKeywords)) {
                    return
                }
                if (effectNameKeywords.length > 0 && !this.matchKeywords(effectMeta.name, effectNameKeywords)) {
                    return
                }
                targets.push({
                    sourceType: "weapon",
                    id: weapon.id,
                    名称: weapon.名称,
                    特效名称: effectMeta.name,
                    特效描述: effectMeta.description,
                    特效限定: effectMeta.limit,
                    特效最大等级: effectMeta.maxLevel,
                    额外信息: {
                        武器类型: weapon.类型[0],
                        类别: weapon.类型[1],
                        伤害类型: weapon.伤害类型,
                    },
                })
            })
        }

        const dedupedTargets = new Map<string, EffectTarget>()
        targets.forEach(target => {
            dedupedTargets.set(`${target.sourceType}:${target.id}`, target)
        })
        return Array.from(dedupedTargets.values())
    }

    /**
     * 工具实现: 设置BUFF
     */
    private setBuff(action: string, buffName: string, level?: number): string {
        const index = this.charSettings.value.buffs.findIndex((b: any) => b[0] === buffName)

        if (action === "add") {
            if (index > -1) {
                return `BUFF ${buffName} 已存在`
            }
            const buff = buffData.find(b => b.名称 === buffName)
            if (!buff) {
                return `未找到BUFF: ${buffName}`
            }
            this.charSettings.value.buffs.push([buffName, level || 1])
            return `已添加BUFF: ${buffName}${level ? ` (等级${level})` : ""}`
        } else {
            if (index === -1) {
                return `BUFF ${buffName} 不存在`
            }
            this.charSettings.value.buffs.splice(index, 1)
            return `已移除BUFF: ${buffName}`
        }
    }

    /**
     * 工具实现: 设置MOD
     */
    private setMod(modType: "角色" | "近战" | "远程" | "同律", slotIndex: number, modId: number, level?: number): string {
        let mod: LeveledMod
        try {
            mod = LeveledModHelper.fromId(modId, level ?? 10)
        } catch {
            return `MOD ${modId} 无效`
        }

        const maxSlots = MOD_SLOT_COUNTS[modType]
        if (slotIndex < 0 || slotIndex >= maxSlots) {
            return `无效的槽位索引: ${slotIndex}（范围: 0-${maxSlots - 1}）`
        }

        // 写入当前激活的 MOD 变体，保证与用户在构筑页看到的配置一致
        getModVariantSlots(this.charSettings.value, modType)[slotIndex] = [mod.id, level || 1]
        return `已在${modType}槽位${slotIndex}设置MOD: ${mod.名称}${level ? ` (等级${level})` : ""}`
    }

    /**
     * 工具实现: 查询角色数据
     */
    private queryCharData(params?: { charName?: string; level?: number; skillLevel?: number }): string {
        if (params?.charName) {
            const char = charData.find(c => c.名称 === params.charName)
            if (!char) {
                return `未找到角色: ${params.charName}`
            }
            const level = this.normalizeLevel(
                params.level,
                this.selectedChar.value === char.名称 ? this.charSettings.value.charLevel : 80,
                1,
                80
            )
            const skillLevel = this.normalizeLevel(
                params.skillLevel,
                this.selectedChar.value === char.名称 ? this.charSettings.value.charSkillLevel : 10,
                1,
                12
            )
            return JSON.stringify(this.buildCharDetail(char.名称, level, skillLevel), null, 2)
        }

        return JSON.stringify(
            charData.map(c => ({
                id: c.id,
                名称: c.名称,
                属性: c.属性,
                阵营: c.阵营,
                精通: c.精通,
                标签: c.标签,
                技能数量: c.技能.length,
                同律武器数量: c.同律武器?.length || 0,
            })),
            null,
            2
        )
    }

    /**
     * 规范化等级参数并限制范围
     * @param level 原始等级参数
     * @param fallback 默认等级
     * @param min 最小值
     * @param max 最大值
     * @returns 规范化后的等级
     */
    private normalizeLevel(level: number | undefined, fallback: number, min: number, max: number): number {
        const target = typeof level === "number" && Number.isFinite(level) ? level : fallback
        return Math.max(min, Math.min(max, Math.floor(target)))
    }

    /**
     * 规范化数值，避免返回过长小数
     * @param value 原始数值
     * @returns 规范化后的数值
     */
    private normalizeNumber(value: number): number {
        if (Number.isInteger(value)) {
            return value
        }
        return Number.parseFloat(value.toFixed(4))
    }

    /**
     * 构建武器摘要，避免直接序列化为 [object Object]
     * @param weapon 武器对象
     * @returns 可读的武器摘要
     */
    private buildWeaponSummary(weapon: LeveledWeapon) {
        return {
            id: weapon.id,
            名称: weapon.名称,
            类型: weapon.类型,
            类别: weapon.类别,
            伤害类型: weapon.伤害类型,
            等级: weapon.等级,
            精炼: weapon.精炼,
            基础攻击: this.normalizeNumber(weapon.基础攻击),
            效果: formatParamText(weapon.效果, weapon.精炼),
        }
    }

    /**
     * 从技能字段中提取额外数值（削韧/延迟/卡肉/取消/连段/段数）
     * @param field 技能字段
     * @returns 额外数值对象（仅包含存在的字段）
     */
    private extractSkillFieldExtras(field: LeveledSkillField): Record<string, number> {
        const rawField = field as unknown as Record<string, unknown>
        const maybeExtras: Record<string, unknown> = {
            削韧: rawField.削韧,
            延迟: rawField.延迟,
            卡肉: rawField.卡肉,
            取消: rawField.取消,
            连段: rawField.连段,
            段数: rawField.段数,
        }

        const extras: Record<string, number> = {}
        for (const [key, value] of Object.entries(maybeExtras)) {
            if (typeof value === "number" && Number.isFinite(value)) {
                extras[key] = this.normalizeNumber(value)
            }
        }
        return extras
    }

    /**
     * 组装技能字段详情（仅展示层数据，不返回底层结构）
     * @param field 技能字段
     * @returns 技能字段详情
     */
    private buildSkillFieldDetail(field: LeveledSkillField) {
        const extras = this.extractSkillFieldExtras(field)
        return {
            名称: field.名称,
            数值: this.normalizeNumber(field.值),
            数值2: field.值2 !== undefined ? this.normalizeNumber(field.值2) : undefined,
            属性影响: field.影响 ? field.影响.split(",").filter(Boolean) : [],
            格式: field.格式 || "",
            基准属性: field.基础 || "",
            额外数值: extras,
        }
    }

    /**
     * 组装技能详情（排除技能底层数据）
     * @param skill 角色技能
     * @returns 技能详情
     */
    private buildSkillDetail(skill: LeveledSkill) {
        return {
            名称: skill.名称,
            类型: skill.类型,
            描述: skill.描述 || "",
            冷却: skill.skillData.cd || 0,
            术语解释: skill.术语解释 || {},
            字段详情: skill.getFieldsWithAttr().map(field => this.buildSkillFieldDetail(field)),
            子技能: (skill.skillData.子技能 || []).map(subSkill => ({
                名称: subSkill.名称 || "",
                类型: subSkill.类型,
                描述: subSkill.描述 || "",
                冷却: subSkill.cd || 0,
            })),
        }
    }

    /**
     * 组装角色详情数据（对齐详情页展示，不包含技能底层结构）
     * @param charName 角色名称
     * @param level 角色等级
     * @param skillLevel 技能等级
     * @returns 角色详情对象
     */
    private buildCharDetail(charName: string, level: number, skillLevel: number) {
        const baseChar = charData.find(c => c.名称 === charName)
        if (!baseChar) {
            return {
                error: `未找到角色: ${charName}`,
            }
        }

        const leveledChar = LeveledCharHelper.fromId(charName, level)
        const leveledSkillWeapons = (baseChar.同律武器 || []).map(weapon => new LeveledSkillWeapon(weapon, skillLevel, level))

        return {
            角色信息: {
                id: baseChar.id,
                名称: baseChar.名称,
                属性: baseChar.属性,
                阵营: baseChar.阵营 || "",
                精通: baseChar.精通,
                别名: baseChar.别名 || "",
                版本: baseChar.版本 || "",
                标签: baseChar.标签 || [],
            },
            查询参数: {
                角色等级: level,
                技能等级: skillLevel,
                是否当前角色: this.selectedChar.value === baseChar.名称,
            },
            基础属性: {
                攻击: this.normalizeNumber(leveledChar.基础攻击),
                生命: this.normalizeNumber(leveledChar.基础生命),
                防御: this.normalizeNumber(leveledChar.基础防御),
                护盾: this.normalizeNumber(leveledChar.基础护盾),
                最大神智: this.normalizeNumber(leveledChar.基础神智),
            },
            八十级基准属性: {
                攻击: this.normalizeNumber(baseChar.基础攻击),
                生命: this.normalizeNumber(baseChar.基础生命),
                防御: this.normalizeNumber(baseChar.基础防御),
                护盾: this.normalizeNumber(baseChar.基础护盾),
                最大神智: this.normalizeNumber(baseChar.基础神智),
            },
            加成属性: baseChar.加成 || {},
            溯源: baseChar.溯源 || [],
            技能详情: leveledChar.技能.map(skill => this.buildSkillDetail(skill)),
            同律武器详情: leveledSkillWeapons.map(weapon => ({
                名称: weapon.名称,
                类型: weapon._originalWeaponData.类型,
                伤害类型: weapon.伤害类型,
                基础属性: {
                    攻击: this.normalizeNumber(weapon.基础攻击),
                    暴击: this.normalizeNumber(weapon._originalWeaponData.暴击 || 0),
                    暴伤: this.normalizeNumber(weapon._originalWeaponData.暴伤 || 0),
                    触发: this.normalizeNumber(weapon._originalWeaponData.触发 || 0),
                },
            })),
        }
    }

    /**
     * 工具实现: 查询MOD数据
     */
    private queryModData(params: {
        element?: string
        modType?: string
        series?: string
        keywords?: string
        hasEffect?: boolean
        effectName?: string
        effectEnabled?: boolean
        effectAvailable?: boolean
    }): string {
        let mods = modData
        const currentElement = this.getCurrentCharacterElement()

        /**
         * 获取 MOD 的特效状态摘要
         * @param mod MOD 数据
         * @returns 特效摘要，不存在时返回 null
         */
        const getEffectSummary = (mod: (typeof modData)[number]) => {
            const effectMeta = this.getModEffectMeta(mod)
            if (!effectMeta) {
                return null
            }
            const currentConfigLevel = this.inv.getBuffLv(mod.id)
            const availableForCurrentChar = this.isEffectAvailable(effectMeta.limit, currentElement)
            return {
                名称: effectMeta.name,
                描述: effectMeta.description,
                限定: effectMeta.limit || "",
                当前配置等级: currentConfigLevel,
                当前生效等级: availableForCurrentChar ? currentConfigLevel : 0,
                最大等级: effectMeta.maxLevel,
                是否启用: currentConfigLevel > 0,
                当前角色可用: availableForCurrentChar,
            }
        }

        if (params.element) {
            mods = mods.filter(m => m.属性 === params.element)
        }
        if (params.modType) {
            mods = mods.filter(m => m.类型 === params.modType)
        }
        if (params.series) {
            mods = mods.filter(m => m.系列 === params.series)
        }
        if (typeof params.hasEffect === "boolean") {
            mods = mods.filter(mod => Boolean(getEffectSummary(mod)) === params.hasEffect)
        }
        if (params.effectName) {
            const effectNameKeywords = this.parseKeywords(params.effectName)
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                const effectText = `${effectSummary.名称} ${effectSummary.描述}`.toLowerCase()
                return effectNameKeywords.some(keyword => effectText.includes(keyword))
            })
        }
        if (typeof params.effectEnabled === "boolean") {
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                return effectSummary.是否启用 === params.effectEnabled
            })
        }
        if (typeof params.effectAvailable === "boolean") {
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                if (!effectSummary) {
                    return false
                }
                return effectSummary.当前角色可用 === params.effectAvailable
            })
        }
        if (params.keywords) {
            const keywords = this.parseKeywords(params.keywords)
            mods = mods.filter(mod => {
                const effectSummary = getEffectSummary(mod)
                const searchableText = [
                    mod.名称,
                    getParamTemplate(mod.效果),
                    mod.系列 ?? "",
                    mod.属性 ?? "",
                    mod.类型 ?? "",
                    effectSummary?.名称 ?? "",
                    effectSummary?.描述 ?? "",
                ]
                    .join(" ")
                    .toLowerCase()
                return keywords.some(keyword => searchableText.includes(keyword))
            })
        }

        // 限制返回数量
        const results = mods.slice(0, 20).map(mod => {
            const effectSummary = getEffectSummary(mod)
            return {
                ...mod,
                有特效: Boolean(effectSummary),
                特效: effectSummary,
            }
        })

        return JSON.stringify(
            {
                total: mods.length,
                当前角色属性: currentElement,
                results,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 批量查询MOD/武器特效配置
     */
    private queryEffectConfig(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
        enabledOnly?: boolean
        limit?: number
    }): string {
        const currentElement = this.getCurrentCharacterElement()
        const targets = this.collectEffectTargets(params)
        const limit = params.limit ?? 50

        const targetStates = targets
            .map(target => {
                const currentConfigLevel =
                    target.sourceType === "mod" ? this.inv.getBuffLv(target.id) : this.getWeaponRawEffectLevel(target.id)
                const availableForCurrentChar = this.isEffectAvailable(target.特效限定, currentElement)
                const currentEffectiveLevel =
                    target.sourceType === "mod"
                        ? availableForCurrentChar
                            ? currentConfigLevel
                            : 0
                        : this.inv.getWBuffLv(target.id, currentElement)

                return {
                    来源类型: target.sourceType === "mod" ? "MOD" : "武器",
                    id: target.id,
                    名称: target.名称,
                    特效名称: target.特效名称,
                    特效描述: target.特效描述,
                    特效限定: target.特效限定 || "",
                    当前配置等级: currentConfigLevel,
                    当前生效等级: currentEffectiveLevel,
                    最大等级: target.特效最大等级,
                    是否启用: currentConfigLevel > 0,
                    当前角色可用: availableForCurrentChar,
                    ...target.额外信息,
                }
            })
            .filter(state => (params.enabledOnly ? state.是否启用 : true))

        return JSON.stringify(
            {
                当前角色: this.selectedChar.value,
                当前角色属性: currentElement,
                total: targetStates.length,
                results: targetStates.slice(0, limit),
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 批量设置MOD/武器特效配置
     */
    private setEffectConfig(params: {
        modIds?: number[] | number
        modNames?: string[] | string
        weaponIds?: number[] | number
        weaponNames?: string[] | string
        effectNames?: string[] | string
        sourceType?: "all" | "mod" | "weapon"
        mode?: "enable" | "disable" | "toggle" | "set"
        level?: number
    }): string {
        const mode = params.mode || "enable"
        const currentElement = this.getCurrentCharacterElement()
        const targets = this.collectEffectTargets(params)

        if (targets.length === 0) {
            return JSON.stringify(
                {
                    mode,
                    message: "未找到可操作的特效目标，请检查MOD/武器名称、ID或特效名称。",
                },
                null,
                2
            )
        }

        const results = targets.map(target => {
            const previousLevel = target.sourceType === "mod" ? this.inv.getBuffLv(target.id) : this.getWeaponRawEffectLevel(target.id)
            const maxLevel = target.特效最大等级
            const levelFromParams = typeof params.level === "number" ? params.level : maxLevel

            let nextLevel = previousLevel
            if (mode === "enable") {
                nextLevel = this.clampEffectLevel(levelFromParams, maxLevel)
                if (nextLevel <= 0) {
                    nextLevel = maxLevel
                }
            } else if (mode === "disable") {
                nextLevel = 0
            } else if (mode === "toggle") {
                nextLevel = previousLevel > 0 ? 0 : this.clampEffectLevel(levelFromParams, maxLevel)
                if (previousLevel <= 0 && nextLevel <= 0) {
                    nextLevel = maxLevel
                }
            } else if (mode === "set") {
                nextLevel = this.clampEffectLevel(levelFromParams, maxLevel)
            }

            if (target.sourceType === "mod") {
                this.inv.setBuffLv(target.id, nextLevel)
            } else {
                this.inv.setWBuffLv(target.id, nextLevel)
            }

            const effectiveLevel =
                target.sourceType === "mod"
                    ? this.isEffectAvailable(target.特效限定, currentElement)
                        ? nextLevel
                        : 0
                    : this.inv.getWBuffLv(target.id, currentElement)

            return {
                来源类型: target.sourceType === "mod" ? "MOD" : "武器",
                id: target.id,
                名称: target.名称,
                特效名称: target.特效名称,
                操作: mode,
                变更前等级: previousLevel,
                变更后等级: nextLevel,
                当前生效等级: effectiveLevel,
                最大等级: maxLevel,
                当前角色可用: this.isEffectAvailable(target.特效限定, currentElement),
            }
        })

        return JSON.stringify(
            {
                mode,
                currentLevel: typeof params.level === "number" ? params.level : undefined,
                total: results.length,
                results,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 查询BUFF数据
     */
    private queryBuffData(buffName?: string): string {
        if (buffName) {
            const buffs = buffData.filter(b => b.名称.includes(buffName))
            return JSON.stringify(buffs, null, 2)
        }
        return JSON.stringify(
            buffData.map(b => ({
                名称: b.名称,
                描述: b.描述,
                限定: b.限定,
            })),
            null,
            2
        )
    }

    /**
     * 工具实现: 查询武器数据
     */
    private queryWeaponData(params: { weaponType?: string; category?: string }): string {
        let weapons = weaponData

        if (params.weaponType) {
            weapons = weapons.filter(w => w.类型[0] === params.weaponType)
        }
        if (params.category) {
            weapons = weapons.filter(w => w.类型[1] === params.category)
        }

        return JSON.stringify(
            {
                total: weapons.length,
                results: weapons.slice(0, 20),
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 设置计算技能与目标函数
     * @param params 目标参数
     * @returns 设置结果
     */
    private setBaseAndTargetFunction(params: { baseName?: string; targetFunction?: string }): string {
        const currentSettings = this.charSettings.value
        const currentBuild = createCharBuildFromSettings(this.getSelectedCharId(), currentSettings, this.inv)
        const fallbackBaseName = currentSettings.baseName || currentBuild.charSkills[0]?.名称 || ""
        const requestedBaseName = params.baseName?.trim()
        const requestedTargetFunction = params.targetFunction?.trim()
        const nextBaseName = requestedBaseName ?? fallbackBaseName
        const nextTargetFunction =
            requestedTargetFunction === undefined ? currentSettings.targetFunction : requestedTargetFunction || "伤害"

        const probeSettings = {
            ...currentSettings,
            baseName: nextBaseName,
            targetFunction: nextTargetFunction,
        }
        const probeBuild = createCharBuildFromSettings(this.getSelectedCharId(), probeSettings, this.inv)
        const availableSkillNames = probeBuild.allSkills.map(skill => skill.名称)

        if (requestedBaseName && !availableSkillNames.includes(requestedBaseName)) {
            return JSON.stringify(
                {
                    error: `无效的 baseName: ${requestedBaseName}`,
                    message: "请使用 getCurrentConfig 返回的可用技能名称。",
                    可用技能: availableSkillNames,
                },
                null,
                2
            )
        }

        const targetFunctionError = probeBuild.validateAST(nextTargetFunction)
        if (targetFunctionError) {
            return JSON.stringify(
                {
                    error: "目标函数表达式校验失败",
                    targetFunction: nextTargetFunction,
                    reason: targetFunctionError,
                },
                null,
                2
            )
        }

        this.charSettings.value = {
            ...currentSettings,
            baseName: nextBaseName,
            targetFunction: nextTargetFunction,
        }

        const finalBuild = createCharBuildFromSettings(this.getSelectedCharId(), this.charSettings.value, this.inv)
        const targetPreview = finalBuild.calculateTargetFunction(finalBuild.calculateWeaponAttributes())

        return JSON.stringify(
            {
                message: "已更新计算技能与目标函数",
                当前配置: {
                    baseName: this.charSettings.value.baseName,
                    targetFunction: this.charSettings.value.targetFunction,
                    baseWithTarget: finalBuild.baseWithTarget,
                },
                目标函数预估值: Number.isFinite(targetPreview) ? Number(targetPreview.toFixed(4)) : targetPreview,
                可用技能: availableSkillNames,
            },
            null,
            2
        )
    }

    /**
     * 工具实现: 获取当前配置
     */
    private getCurrentConfig(): string {
        const build = createCharBuildFromSettings(this.getSelectedCharId(), this.charSettings.value, this.inv)
        const baseName = this.charSettings.value.baseName || build.charSkills[0]?.名称 || ""
        const targetFunction = this.charSettings.value.targetFunction || "伤害"
        const targetFunctionError = build.validateAST(targetFunction)
        const targetPreview = build.calculateTargetFunction(build.calculateWeaponAttributes())
        // MOD 一律按当前激活的变体（A/B/C）汇报，与构筑页展示、计算保持一致
        const describeMods = (type: "角色" | "近战" | "远程" | "同律") =>
            getModVariantSlots(this.charSettings.value, type)
                .filter(m => m !== null)
                .map(m => LeveledModHelper.fromId(m[0], m[1]).toString())
        const rst = {
            角色: this.selectedChar.value,
            等级: this.charSettings.value.charLevel,
            计算技能: baseName,
            目标函数: targetFunction,
            目标函数校验: targetFunctionError || "通过",
            目标函数标识符: build.getIdentifierNames(targetFunction),
            目标函数预估值: Number.isFinite(targetPreview) ? Number(targetPreview.toFixed(4)) : targetPreview,
            可用技能: build.allSkills.map(skill => skill.名称),
            角色MOD: describeMods("角色"),
            近战MOD: describeMods("近战"),
            远程MOD: describeMods("远程"),
            同律MOD: describeMods("同律"),
            BUFF列表: this.charSettings.value.buffs.map(b => b[0]),
        }
        return JSON.stringify(rst, null, 2)
    }

    /**
     * 工具实现: 自动构建
     */
    private autoBuild(params: {
        useInv?: boolean
        includeTypes?: Array<ModTypeKey | "skillWeaponMods">
        preserveTypes?: Array<ModTypeKey | "skillWeaponMods">
        includeMelee?: boolean
        includeRanged?: boolean
        fixedMelee?: boolean
        fixedRanged?: boolean
        enableLog?: boolean
        apply?: boolean
    }): string {
        const autoBuildSetting = useLocalStorage("autobuild.setting", {
            useInv: true, // 使用用户库存
            includeTypes: [] as Array<ModTypeKey | "skillWeaponMods">, // 包含的MOD类型
            preserveTypes: [] as Array<ModTypeKey | "skillWeaponMods">, // 保留的MOD类型
            includeMelee: false, // 包含近战武器
            includeRanged: false, // 包含远程武器
        })

        const includeTypes = this.normalizeModTypes(params.includeTypes ?? autoBuildSetting.value.includeTypes)
        const preserveTypes = this.normalizeModTypes(params.preserveTypes ?? autoBuildSetting.value.preserveTypes)
        const useInv = params.useInv ?? autoBuildSetting.value.useInv
        const includeMelee =
            params.includeMelee ?? (typeof params.fixedMelee === "boolean" ? !params.fixedMelee : autoBuildSetting.value.includeMelee)
        const includeRanged =
            params.includeRanged ?? (typeof params.fixedRanged === "boolean" ? !params.fixedRanged : autoBuildSetting.value.includeRanged)
        const fixedMelee = typeof params.fixedMelee === "boolean" ? params.fixedMelee : !includeMelee
        const fixedRanged = typeof params.fixedRanged === "boolean" ? params.fixedRanged : !includeRanged
        const enableLog = params.enableLog ?? true
        const apply = params.apply ?? false

        const build = createCharBuildFromSettings(this.getSelectedCharId(), this.charSettings.value, this.inv)
        const final = {
            includeTypes,
            preserveTypes,
            fixedMelee,
            fixedRanged,
            enableLog,
            modOptions: this.inv.getModsWithCount(useInv, includeTypes),
            meleeOptions: this.inv.getMeleeWeapons(useInv, build.char.属性),
            rangedOptions: this.inv.getRangedWeapons(useInv, build.char.属性),
        }
        const { newBuild, log, iter } = build.autoBuild(final)
        if (apply) {
            console.log("apply", newBuild)
            // 自动构建结果写进当前激活的 MOD 变体，避免覆盖用户正在查看的另一份配置
            const modsByType = [
                ["角色", newBuild.charMods],
                ["近战", newBuild.meleeMods],
                ["远程", newBuild.rangedMods],
                ["同律", newBuild.skillMods],
            ] as const
            modsByType.forEach(([type, mods]) => {
                const slots = getModVariantSlots(this.charSettings.value, type)
                slots.splice(
                    0,
                    slots.length,
                    ...Array.from({ length: MOD_SLOT_COUNTS[type] }, (_, index) => {
                        const mod = mods[index]
                        return mod ? ([mod.modId, mod.level] as [number, number]) : null
                    })
                )
            })
            this.charSettings.value = {
                ...this.charSettings.value,
                meleeWeapon: newBuild.meleeWeapon.id,
                meleeWeaponLevel: newBuild.meleeWeapon.等级,
                meleeWeaponRefine: newBuild.meleeWeapon.精炼,
                rangedWeapon: newBuild.rangedWeapon.id,
                rangedWeaponLevel: newBuild.rangedWeapon.等级,
                rangedWeaponRefine: newBuild.rangedWeapon.精炼,
            }
        }
        return JSON.stringify(
            {
                自动构建参数: {
                    useInv,
                    includeTypes,
                    preserveTypes,
                    includeMelee,
                    includeRanged,
                    fixedMelee,
                    fixedRanged,
                    enableLog,
                    apply,
                },
                迭代次数: iter,
                目标函数结果: newBuild.calculate(),
                推荐武器: {
                    近战: this.buildWeaponSummary(newBuild.meleeWeapon),
                    远程: this.buildWeaponSummary(newBuild.rangedWeapon),
                },
                推荐MOD: newBuild.mods.map(mod => mod.toString()),
                日志: log,
            },
            null,
            2
        )
    }

    /**
     * 执行一个直接工具。
     *
     * 参数已经是解析好的对象；早先为了兼容「模型把参数写成 JSON 字符串」
     * 保留了兜底解析，这里同样先 {@link BuildToolHost.parseToolArgs} 一次。
     * @param functionName 工具名
     * @param rawArgs 模型给出的参数
     * @returns 工具结果文本
     */
    public async invoke(functionName: string, rawArgs: unknown): Promise<string> {
        console.log("工具调用:", functionName, rawArgs)
        const parsedArgs = this.parseToolArgs(rawArgs)

        const setBuffSchema = z.object({
            action: z.enum(["add", "remove"]),
            buffName: z.string().min(1),
            level: z.number().optional(),
        })
        const setModSchema = z.object({
            modType: z.enum(["角色", "近战", "远程", "同律"]),
            slotIndex: z.number(),
            modId: z.number(),
            level: z.number().optional(),
        })
        const queryCharDataSchema = z
            .object({
                charName: z.string().optional(),
                level: z.number().optional(),
                skillLevel: z.number().optional(),
            })
            .optional()
        const queryModDataSchema = z.object({
            element: z.string().optional(),
            modType: z.string().optional(),
            series: z.string().optional(),
            keywords: z.string().optional(),
            hasEffect: z.boolean().optional(),
            effectName: z.string().optional(),
            effectEnabled: z.boolean().optional(),
            effectAvailable: z.boolean().optional(),
        })
        const queryBuffDataSchema = z.object({
            buffName: z.string().optional(),
        })
        const queryWeaponDataSchema = z.object({
            weaponType: z.string().optional(),
            category: z.string().optional(),
        })
        const setBaseAndTargetFunctionSchema = z
            .object({
                baseName: z.string().optional(),
                targetFunction: z.string().optional(),
            })
            .refine(data => Boolean(data.baseName || data.targetFunction), {
                message: "至少需要提供 baseName 或 targetFunction",
            })
        const queryEffectConfigSchema = z.object({
            modIds: z.union([z.number(), z.array(z.number())]).optional(),
            modNames: z.union([z.string(), z.array(z.string())]).optional(),
            weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
            weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
            effectNames: z.union([z.string(), z.array(z.string())]).optional(),
            sourceType: z.enum(["all", "mod", "weapon"]).optional(),
            enabledOnly: z.boolean().optional(),
            limit: z.number().int().min(1).max(200).optional(),
        })
        const setEffectConfigSchema = z.object({
            modIds: z.union([z.number(), z.array(z.number())]).optional(),
            modNames: z.union([z.string(), z.array(z.string())]).optional(),
            weaponIds: z.union([z.number(), z.array(z.number())]).optional(),
            weaponNames: z.union([z.string(), z.array(z.string())]).optional(),
            effectNames: z.union([z.string(), z.array(z.string())]).optional(),
            sourceType: z.enum(["all", "mod", "weapon"]).optional(),
            mode: z.enum(["enable", "disable", "toggle", "set"]).optional(),
            level: z.number().int().min(0).optional(),
        })
        const autoBuildSchema = z.object({
            useInv: z.boolean().optional(),
            includeTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
            preserveTypes: z.array(z.enum(["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"])).optional(),
            includeMelee: z.boolean().optional(),
            includeRanged: z.boolean().optional(),
            fixedMelee: z.boolean().optional(),
            fixedRanged: z.boolean().optional(),
            enableLog: z.boolean().optional(),
            apply: z.boolean().optional(),
        })

        switch (functionName) {
            case "setBuff": {
                const args = setBuffSchema.parse(parsedArgs)
                return this.setBuff(args.action, args.buffName, args.level)
            }
            case "setMod": {
                const args = setModSchema.parse(parsedArgs)
                return this.setMod(args.modType, args.slotIndex, args.modId, args.level)
            }
            case "queryCharData": {
                const args = queryCharDataSchema.parse(parsedArgs)
                return this.queryCharData(args)
            }
            case "queryModData": {
                const args = queryModDataSchema.parse(parsedArgs)
                return this.queryModData(args)
            }
            case "queryBuffData": {
                const args = queryBuffDataSchema.parse(parsedArgs)
                return this.queryBuffData(args.buffName)
            }
            case "queryWeaponData": {
                const args = queryWeaponDataSchema.parse(parsedArgs)
                return this.queryWeaponData(args)
            }
            case "setBaseAndTargetFunction": {
                const args = setBaseAndTargetFunctionSchema.parse(parsedArgs)
                return this.setBaseAndTargetFunction(args)
            }
            case "queryEffectConfig": {
                const args = queryEffectConfigSchema.parse(parsedArgs)
                return this.queryEffectConfig(args)
            }
            case "setEffectConfig": {
                const args = setEffectConfigSchema.parse(parsedArgs)
                return this.setEffectConfig(args)
            }
            case "getCurrentConfig":
                return this.getCurrentConfig()
            case "autoBuild": {
                const args = autoBuildSchema.parse(parsedArgs)
                return this.autoBuild(args)
            }
            default:
                return `未知工具: ${functionName}`
        }
    }
}

/**
 * 直接工具的参数声明（面向模型的 JSON Schema）。
 *
 * ⚠️ 与 {@link BuildToolHost.invoke} 里的 zod 校验是同一套约束的两份表达：
 * 面向模型的 schema 决定「模型能写成什么样」，zod 决定「执行时接受什么样」，
 * 改一边必须同时改另一边，否则模型给的参数会被校验挡掉。
 */
const BUILD_DIRECT_DEFINITIONS: ReadonlyArray<{ name: string; description: string; parameters: Record<string, unknown> }> = [
    {
        name: "setBuff",
        description: "直接改配置：添加或移除 BUFF。UI 路径不稳定时用它做兜底",
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["add", "remove"] },
                buffName: { type: "string", description: "BUFF名称" },
                level: { type: "number", description: "可选，BUFF等级" },
            },
            required: ["action", "buffName"],
        },
    },
    {
        name: "setMod",
        description: "直接改配置：给指定类型的第 N 个槽位装上 MOD（可带等级）",
        parameters: {
            type: "object",
            properties: {
                modType: { type: "string", enum: ["角色", "近战", "远程", "同律"] },
                slotIndex: { type: "number", description: "槽位序号，从 0 开始" },
                modId: { type: "number", description: "MOD 数字 id" },
                level: { type: "number", description: "可选，MOD 等级" },
            },
            required: ["modType", "slotIndex", "modId"],
        },
    },
    {
        name: "queryCharData",
        description: "查询角色完整数据（属性、技能面板、当前装的武器摘要）",
        parameters: {
            type: "object",
            properties: {
                charName: { type: "string", description: "可选，角色名；不传用当前角色" },
                level: { type: "number", description: "可选，角色等级" },
                skillLevel: { type: "number", description: "可选，技能等级" },
            },
        },
    },
    {
        name: "queryModData",
        description: "查询 MOD 数据，支持按属性、类型、系列、关键词与特效状态筛选",
        parameters: {
            type: "object",
            properties: {
                element: { type: "string" },
                modType: { type: "string" },
                series: { type: "string" },
                keywords: { type: "string", description: "空格/逗号分隔的关键词" },
                hasEffect: { type: "boolean" },
                effectName: { type: "string" },
                effectEnabled: { type: "boolean" },
                effectAvailable: { type: "boolean" },
            },
        },
    },
    {
        name: "queryBuffData",
        description: "查询 BUFF 数据（按名称模糊匹配）",
        parameters: {
            type: "object",
            properties: { buffName: { type: "string", description: "可选，BUFF 名称关键词" } },
        },
    },
    {
        name: "queryWeaponData",
        description: "查询武器数据，支持按武器类型与类别筛选",
        parameters: {
            type: "object",
            properties: {
                weaponType: { type: "string" },
                category: { type: "string" },
            },
        },
    },
    {
        name: "queryEffectConfig",
        description: "批量查询 MOD / 武器特效当前配置（支持按名称、id、特效名筛选）",
        parameters: {
            type: "object",
            properties: {
                modIds: { oneOf: [{ type: "number" }, { type: "array", items: { type: "number" } }] },
                modNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                weaponIds: { oneOf: [{ type: "number" }, { type: "array", items: { type: "number" } }] },
                weaponNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                effectNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                sourceType: { type: "string", enum: ["all", "mod", "weapon"] },
                enabledOnly: { type: "boolean" },
                limit: { type: "integer", minimum: 1, maximum: 200 },
            },
        },
    },
    {
        name: "setEffectConfig",
        description: "批量设置 MOD / 武器特效等级（启用 / 关闭 / 切换 / 指定等级）",
        parameters: {
            type: "object",
            properties: {
                modIds: { oneOf: [{ type: "number" }, { type: "array", items: { type: "number" } }] },
                modNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                weaponIds: { oneOf: [{ type: "number" }, { type: "array", items: { type: "number" } }] },
                weaponNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                effectNames: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
                sourceType: { type: "string", enum: ["all", "mod", "weapon"] },
                mode: { type: "string", enum: ["enable", "disable", "toggle", "set"] },
                level: { type: "integer", minimum: 0 },
            },
        },
    },
    {
        name: "setBaseAndTargetFunction",
        description: "设置当前计算技能（baseName）与目标函数表达式（targetFunction），至少要给一个",
        parameters: {
            type: "object",
            properties: {
                baseName: { type: "string", description: "技能名，例如 解天机·震" },
                targetFunction: { type: "string", description: "目标函数表达式，例如 [解天机·震]伤害*min(1,技能范围/2)" },
            },
        },
    },
    {
        name: "getCurrentConfig",
        description: "读取当前角色配置全貌（角色、武器、MOD、特效、BUFF、计算技能与目标函数）",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "autoBuild",
        description:
            "直接跑一次自动求解（无需操作界面）。apply=true 时把结果写回当前配置。\n" +
            "求解开销远高于翻界面，UI 路径能解决时优先用界面工具；只有需要全局最优时才用它。",
        parameters: {
            type: "object",
            properties: {
                useInv: { type: "boolean", description: "是否按库存数量限制" },
                includeTypes: {
                    type: "array",
                    items: { type: "string", enum: ["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"] },
                },
                preserveTypes: {
                    type: "array",
                    items: { type: "string", enum: ["charMods", "meleeMods", "rangedMods", "skillMods", "skillWeaponMods"] },
                },
                includeMelee: { type: "boolean" },
                includeRanged: { type: "boolean" },
                fixedMelee: { type: "boolean" },
                fixedRanged: { type: "boolean" },
                enableLog: { type: "boolean" },
                apply: { type: "boolean", description: "是否把结果写回当前配置" },
            },
        },
    },
]

/**
 * @description 构造配装助手的直接工具清单（兜底路径）。
 * @param host 外部状态宿主
 * @returns 工具列表
 */
export function createBuildDirectTools(host: BuildToolHost): AgentTool<never>[] {
    return BUILD_DIRECT_DEFINITIONS.map(item => ({
        definition: { name: item.name, description: item.description, parameters: item.parameters },
        execute: async args => (await host.invoke(item.name, args)) as string,
    }))
}
