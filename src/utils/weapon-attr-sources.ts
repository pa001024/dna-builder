import { CharBuild, type LeveledWeapon } from "@/data"

/** 武器作用域下不参与 BUFF 与武器效果汇总的裸属性字段（与 CharBuild.getTotalBonus 的显式排除一致）。 */
const BARE_SCOPE_EXCLUDED = new Set(["攻击", "增伤"])

/** 武器属性行的加成来源条目。 */
export interface WeaponAttrSource {
    /** 来源名称：角色名 / 武器名 / MOD 名 / BUFF 名 */
    name: string
    /** 来源贡献值，与属性面板同量纲（百分比类属性为小数） */
    value: number
}

/** 武器属性在某作用域下的来源字段候选。 */
export interface WeaponAttrFieldCandidate {
    /** 来源对象上的字段名（如 近战触发 / 触发） */
    field: string
    /** 该字段参与结算的武器作用域（近战 / 远程 / 同律近战 / 同律远程） */
    scope: string
    /** 是否纳入 MOD 加成：同律前缀降级只作用于 BUFF 与武器效果，MOD 不随降级穿透 */
    includeMods: boolean
}

/**
 * 构造武器属性的来源字段候选，顺序与 CharBuild.calculateWeaponAttributes 的属性查询一致：
 * ① 武器作用域前缀字段（近战触发）→ ② 无前缀字段（触发）→ ③ 同律武器的下位作用域字段（近战触发）。
 * 其中 ③ 由同律武器的「前缀降级」而来，只覆盖 BUFF 与武器效果：近战/远程槽位 MOD 不随降级穿透到同律武器。
 * @param key 武器属性键名（如 触发）
 * @param scope 参与结算的武器类型前缀（近战 / 远程 / 同律近战 / 同律远程）
 * @returns 字段候选列表
 */
export function getWeaponAttrFieldCandidates(key: string, scope: string): WeaponAttrFieldCandidate[] {
    const candidates: WeaponAttrFieldCandidate[] = [
        { field: `${scope}${key}`, scope, includeMods: true },
        { field: key, scope, includeMods: true },
    ]
    // 同律前缀降级：同律近战 → 近战、同律远程 → 远程
    if (scope.startsWith("同律")) {
        const lowerScope = scope.slice("同律".length)
        candidates.push({ field: `${lowerScope}${key}`, scope: lowerScope, includeMods: false })
    }
    return candidates
}

/**
 * 取某个武器作用域对应的武器槽位。
 * 同律槽位不读取「武器自身词条」（同律武器自身字段不参与前缀查询），返回 undefined。
 * @param build 构筑
 * @param scope 字段作用域
 * @returns 对应槽位的武器
 */
function scopedWeaponOf(build: CharBuild, scope: string): LeveledWeapon | undefined {
    if (scope === "近战") return build.meleeWeapon
    if (scope === "远程") return build.rangedWeapon
    return undefined
}

/**
 * 汇总武器属性行的加成来源，口径与 CharBuild.calculateWeaponAttributes 保持一致：
 * 覆盖「近战触发」这类带武器作用域前缀的字段，并包含同律武器由下位作用域降级来的来源。
 * 不含 code 型动态 BUFF 的差值来源与「MOD属性」转化来源，这两类由展示层单独处理。
 * @param build 构筑
 * @param scope 参与结算的武器类型前缀（近战 / 远程 / 同律近战 / 同律远程）
 * @param key 武器属性键名
 * @returns 来源列表，顺序为 角色加成 → 武器词条 → 武器效果 → MOD → MOD 效果（@ 属性） → BUFF
 */
export function collectWeaponAttrSources(build: CharBuild, scope: string, key: string): WeaponAttrSource[] {
    const sources: WeaponAttrSource[] = []
    const candidates = getWeaponAttrFieldCandidates(key, scope)

    /** 记录一条非零来源：值为 0 的字段对面板没有贡献，不进明细。 */
    const push = (name: string, value: number) => {
        if (value === 0) return
        sources.push({ name, value })
    }

    // 角色自带加成：武器作用域下只排除裸「攻击」字段，带前缀的「近战攻击」仍参与
    for (const candidate of candidates) {
        if (candidate.field === "攻击") continue
        const value = build.char.加成?.[candidate.field]
        if (typeof value === "number") push(build.char.名称, value)
    }

    // 武器自身词条：只读取与候选字段作用域同槽位的武器（跨作用域武器不参与），裸「攻击」由基础攻击承担
    for (const candidate of candidates) {
        if (candidate.field === "攻击") continue
        const weapon = scopedWeaponOf(build, candidate.scope)
        if (!weapon || !build.isWeaponForgeEffective(weapon)) continue
        const value = (weapon as unknown as Record<string, unknown>)[candidate.field]
        if (typeof value === "number") push(weapon.名称, value)
    }

    // 武器效果（熔炼 BUFF）：两把武器的效果都对任意武器生效，仅裸「攻击」「增伤」字段除外
    for (const candidate of candidates) {
        if (BARE_SCOPE_EXCLUDED.has(candidate.field)) continue
        for (const weapon of [build.meleeWeapon, build.rangedWeapon]) {
            const value = weapon.buffProps?.[candidate.field]
            if (typeof value === "number") push(weapon.名称, value)
        }
    }

    // MOD：只统计与候选字段作用域一致的槽位；跨作用域穿透仅对 attrAllowCharToWeapon 中的属性开放，
    // 同律降级候选（includeMods 为 false）不纳入 MOD
    for (const candidate of candidates) {
        if (!candidate.includeMods) continue
        const allowCrossScope = CharBuild.attrAllowCharToWeapon.has(candidate.field)
        for (const mod of build.mods) {
            if (mod.attrType !== candidate.scope && !(allowCrossScope && mod.attrType === "角色")) continue
            const value = mod.addAttr[candidate.field]
            if (typeof value === "number") push(mod.名称, value)
        }
    }

    // MOD 效果层（特效中以 @ 前缀声明的属性，见 LeveledMod.buffProps）：口径与 BUFF 一致，
    // 不受 MOD 槽位作用域限制（如远程槽 MOD 的近战增伤），也不随同律降级候选被排除
    for (const candidate of candidates) {
        if (BARE_SCOPE_EXCLUDED.has(candidate.field)) continue
        for (const mod of build.mods) {
            const value = mod.buffProps[candidate.field]
            if (typeof value === "number") push(mod.名称, value)
        }
    }

    // BUFF：字段自带作用域前缀时必须与候选字段作用域一致；裸「攻击」「增伤」字段不进入武器面板
    for (const candidate of candidates) {
        if (BARE_SCOPE_EXCLUDED.has(candidate.field)) continue
        for (const buff of build.buffs) {
            const value = buff[candidate.field]
            if (typeof value === "number") push(buff.名称, value)
        }
    }

    return sources
}
