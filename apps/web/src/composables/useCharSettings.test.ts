import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick, ref } from "vue"
import {
    addModVariant,
    createDefaultCharSettings,
    getModVariantAura,
    getModVariantCount,
    getModVariantSlots,
    isEmptyInlineActions,
    MOD_SLOT_COUNTS,
    MOD_VARIANT_MAX_COUNT,
    normalizeCharSettings,
    normalizeInlineActions,
    removeLastModVariant,
    resolveModVariantLetter,
    serializeCharSettings,
    serializeCharSettingsForShare,
    setModVariantAura,
} from "@/data/charSettings"
import { createMaxedReachableTalentLevels } from "@/data/transcendSettings"

describe("useCharSettings helpers", () => {
    it("默认角色配置应包含自定义BUFF列表", () => {
        const settings = createDefaultCharSettings()

        expect(settings.customBuff).toEqual([])
    })

    it("标准化旧版角色配置时应补齐自定义BUFF字段", () => {
        const settings = normalizeCharSettings({
            baseName: "普通攻击",
            buffs: [["助战50攻", 1]],
        })

        expect(settings.baseName).toBe("普通攻击")
        expect(settings.buffs).toEqual([["助战50攻", 1]])
        expect(settings.customBuff).toEqual([])
        expect(settings.customVariables).toEqual([])
    })

    it("标准化时应保留设置了覆盖率的BUFF（第三元素）并舍入精度", () => {
        const settings = normalizeCharSettings({
            buffs: [
                ["助战50攻", 1, 0.5],
                ["助战100攻", 2, 0.333333333333],
            ],
        })

        expect(settings.buffs).toEqual([
            ["助战50攻", 1, 0.5],
            ["助战100攻", 2, 0.333333],
        ])
    })

    it("标准化时覆盖率100%的BUFF应回退为旧的两元素格式", () => {
        const settings = normalizeCharSettings({
            buffs: [["助战50攻", 1, 1]],
        })

        expect(settings.buffs).toEqual([["助战50攻", 1]])
    })

    it("标准化时应舍入自定义BUFF数值，清理旧存档浮点尾差", () => {
        const settings = normalizeCharSettings({
            customBuff: [
                ["攻击", 0.23499999999999999],
                ["技能威力", 1.1000000000000001],
            ],
        })

        expect(settings.customBuff).toEqual([
            ["攻击", 0.235],
            ["技能威力", 1.1],
        ])
    })

    it("序列化时应舍入自定义BUFF数值并仅追加显式覆盖率", () => {
        const serialized = serializeCharSettings({
            buffs: [
                ["助战50攻", 1],
                ["助战100攻", 2, 0.50000000001],
                ["助战150攻", 3, 1],
            ],
            customBuff: [["攻击", 0.23499999999999999]],
        })

        expect(JSON.parse(serialized).buffs).toEqual([
            ["助战50攻", 1],
            ["助战100攻", 2, 0.5],
            ["助战150攻", 3],
        ])
        expect(JSON.parse(serialized).customBuff).toEqual([["攻击", 0.235]])
    })

    it("传入近战专武时默认装备该武器", () => {
        const settings = createDefaultCharSettings({ id: 10104, type: "近战" })

        expect(settings.meleeWeapon).toBe(10104)
        expect(settings.rangedWeapon).toBe(20102)
    })

    it("传入远程专武时默认装备该武器", () => {
        const settings = createDefaultCharSettings({ id: 20405, type: "远程" })

        expect(settings.rangedWeapon).toBe(20405)
        expect(settings.meleeWeapon).toBe(10206)
    })

    it("未传入专武时保留通用默认武器", () => {
        const noSignature = createDefaultCharSettings()
        const nullSignature = createDefaultCharSettings(null)

        expect(noSignature.meleeWeapon).toBe(10206)
        expect(noSignature.rangedWeapon).toBe(20102)
        expect(nullSignature.meleeWeapon).toBe(10206)
        expect(nullSignature.rangedWeapon).toBe(20102)
    })

    it("默认角色配置的协战构筑id为未关联占位值", () => {
        const settings = createDefaultCharSettings()

        expect(settings.team1Build).toBe("-")
        expect(settings.team2Build).toBe("-")
    })

    it("标准化时应保留协战构筑id并清理非法值", () => {
        const settings = normalizeCharSettings({
            team1Build: " abc123 ",
            // 旧存档或脏数据里的非法值一律视为未关联
            team2Build: 0 as unknown as string,
        })

        expect(settings.team1Build).toBe("abc123")
        expect(settings.team2Build).toBe("-")
    })

    it("标准化旧存档时应补齐魔灵与潜质字段", () => {
        const settings = normalizeCharSettings({ baseName: "普通攻击" })

        expect(settings.petId).toBe(0)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(1)
        expect(settings.traits).toEqual([null, null, null, null])
    })

    it("标准化时应丢弃历史版本写入的非法潜质槽位（早期存的是潜质条目 id 数字）", () => {
        // 早期版本把潜质条目 id 直接存成数字；解构这类值会抛错，必须只丢该槽位而不是让页面崩掉
        const settings = normalizeCharSettings({
            traits: [10103, null, ["1010", 3], [1010, 3], [1010, 9], [1010, 3]] as unknown as never,
        })

        expect(settings.traits).toEqual([[1010, 3], null, null, null])
    })

    it("标准化时应钳制魔灵字段的非法数值", () => {
        const dirty = normalizeCharSettings({
            petId: Number.NaN,
            petLevel: 99,
            petCoverage: -3,
        })
        expect(dirty.petId).toBe(0)
        expect(dirty.petLevel).toBe(3)
        expect(dirty.petCoverage).toBe(0)

        const garbage = normalizeCharSettings({
            petId: "abc" as unknown as number,
            petLevel: "abc" as unknown as number,
            petCoverage: null as unknown as number,
        })
        expect(garbage.petId).toBe(0)
        expect(garbage.petLevel).toBe(3)
        expect(garbage.petCoverage).toBe(1)
    })

    it("旧存档迁移：BUFF 里的潜质搬进潜质槽，魔灵被动/主动搬进魔灵字段", () => {
        const settings = normalizeCharSettings({
            buffs: [
                ["魔灵潜质:凶猛", 3],
                ["魔灵潜质:敏锐", 2],
                ["黑曜艾尔芙", 3],
                ["黑曜艾尔芙(主动)", 3, 0.6],
                ["菲娜Q", 12],
            ] as never,
        })

        // 非魔灵 BUFF 原样保留，魔灵相关 BUFF 全部搬走
        expect(settings.buffs).toEqual([["菲娜Q", 12]])
        expect(settings.traits).toEqual([[1010, 3], [1014, 2], null, null])
        expect(settings.petId).toBe(4211)
        expect(settings.petLevel).toBe(3)
        // 主动技覆盖率沿用勾选值
        expect(settings.petCoverage).toBe(0.6)
    })

    it("旧存档迁移：已有选择不被覆盖，同一潜质只占一槽", () => {
        const settings = normalizeCharSettings({
            petId: 4211,
            petLevel: 3,
            petCoverage: 1,
            traits: [[1010, 3], null, null, null] as never,
            buffs: [
                ["魔灵潜质:凶猛", 2],
                ["魔灵潜质:甲胄", 3],
                ["碧玺艾尔芙(主动)", 4, 0.25],
            ] as never,
        })

        // 凶猛已在槽位中 → 丢弃该 BUFF；甲胄补入下一个空槽
        expect(settings.traits).toEqual([[1010, 3], [1011, 3], null, null])
        expect(settings.petId).toBe(4211)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(1)
        expect(settings.buffs).toEqual([])
    })

    it("序列化魔灵与潜质时只保留 id / 等级 / 覆盖率", () => {
        const settings = normalizeCharSettings({
            petId: 4211,
            petLevel: 3,
            petCoverage: 0.5,
            traits: [[1010, 3], null, null, null],
        })
        const serialized = JSON.parse(serializeCharSettings(settings))

        expect(serialized.petId).toBe(4211)
        expect(serialized.petLevel).toBe(3)
        expect(serialized.petCoverage).toBe(0.5)
        expect(serialized.traits).toEqual([[1010, 3], null, null, null])
    })

    it("默认只有一份MOD配置（变体 A）", () => {
        const settings = createDefaultCharSettings()

        expect(settings.modVariantIndex).toBe(0)
        expect(settings.modVariants).toEqual([])
        expect(getModVariantCount(settings)).toBe(1)
        expect(getModVariantSlots(settings, "角色")).toHaveLength(MOD_SLOT_COUNTS.角色)
        // 中枢（光环）不在 8 个普通槽位里，单独随变体保存
        expect(getModVariantAura(settings)).toBe(settings.auraMod)
    })

    it("追加变体时以当前激活的变体为模板，并自动切换过去", () => {
        const settings = createDefaultCharSettings()
        settings.charMods[0] = [31524, 10]
        settings.skillWeaponMods[3] = [40001, 5]

        expect(addModVariant(settings)).toBe(1)
        expect(settings.modVariantIndex).toBe(1)
        expect(getModVariantCount(settings)).toBe(2)
        // 变体 B 是配置 A 的副本，且与 A 不共享数组
        expect(getModVariantSlots(settings, "角色")[0]).toEqual([31524, 10])
        expect(getModVariantSlots(settings, "同律")[3]).toEqual([40001, 5])
        getModVariantSlots(settings, "角色")[0] = [99999, 1]
        expect(settings.charMods[0]).toEqual([31524, 10])

        // 中枢（光环）同样按变体各自持有：改变体 B 的中枢不影响配置 A
        setModVariantAura(settings, 51746)
        expect(settings.auraMod).toBe(31524)
        expect(getModVariantAura(settings, 1)).toBe(51746)

        // 变体 C：再追加一份，达到上限后不再增加（继承当前激活变体 B 的中枢）
        expect(addModVariant(settings)).toBe(2)
        expect(getModVariantAura(settings)).toBe(51746)
        expect(getModVariantCount(settings)).toBe(MOD_VARIANT_MAX_COUNT)
        expect(addModVariant(settings)).toBe(-1)
        expect(settings.modVariants).toHaveLength(MOD_VARIANT_MAX_COUNT - 1)
    })

    it("只能移除末尾且处于激活状态的变体", () => {
        const settings = createDefaultCharSettings()
        addModVariant(settings)
        addModVariant(settings)

        // 激活的是 B（非末尾）→ 不可移除，避免删除后变体字母错位
        settings.modVariantIndex = 1
        expect(removeLastModVariant(settings)).toBe(false)
        expect(settings.modVariants).toHaveLength(2)

        // 激活的是 C（末尾）→ 可移除，并回到前一份变体
        settings.modVariantIndex = 2
        expect(removeLastModVariant(settings)).toBe(true)
        expect(settings.modVariantIndex).toBe(1)
        expect(settings.modVariants).toHaveLength(1)

        // 继续移除 B
        expect(removeLastModVariant(settings)).toBe(true)
        expect(settings.modVariantIndex).toBe(0)
        expect(settings.modVariants).toEqual([])
        // 配置 A 不可移除
        expect(removeLastModVariant(settings)).toBe(false)
    })

    it("协战构筑的变体在目标构筑缺少该配置时降级为配置 A", () => {
        const settings = createDefaultCharSettings()
        addModVariant(settings)

        expect(resolveModVariantLetter(settings, "A")).toBe("A")
        expect(resolveModVariantLetter(settings, "B")).toBe("B")
        // 目标构筑只有 A/B → C 降级为 A
        expect(resolveModVariantLetter(settings, "C")).toBe("A")
        // 非法值与旧存档缺省值同样降级
        expect(resolveModVariantLetter(settings, undefined)).toBe("A")
        expect(resolveModVariantLetter(settings, "x")).toBe("A")

        const noVariant = createDefaultCharSettings()
        expect(resolveModVariantLetter(noVariant, "B")).toBe("A")
    })

    it("标准化时补齐变体结构并钳制激活索引", () => {
        const settings = normalizeCharSettings({
            modVariantIndex: 9,
            modVariants: [
                { 角色: [[31524, 10]], 同律: [[40001, 5]] },
                // 脏数据：非对象条目补成空变体，保证变体字母与下标一一对应
                null as never,
                { 角色: [] }, // 超出上限的第三份变体（索引 3）应被丢弃
            ] as never,
            team1BuildVariant: " c " as never,
            team2BuildVariant: 3 as never,
        })

        expect(settings.modVariants).toHaveLength(MOD_VARIANT_MAX_COUNT - 1)
        expect(settings.modVariants[0].角色[0]).toEqual([31524, 10])
        expect(settings.modVariants[0].角色).toHaveLength(MOD_SLOT_COUNTS.角色)
        expect(settings.modVariants[0].近战).toEqual(Array(MOD_SLOT_COUNTS.近战).fill(null))
        expect(settings.modVariants[1].角色).toEqual(Array(MOD_SLOT_COUNTS.角色).fill(null))
        // 中枢只接受合法 id，非法值记 0（读取时沿用配置 A 的中枢）
        expect(settings.modVariants[0].中枢).toBe(0)
        expect(getModVariantAura(settings, 1)).toBe(settings.auraMod)
        // 激活索引钳制到已有变体范围内（0-2）
        expect(settings.modVariantIndex).toBe(2)
        expect(settings.team1BuildVariant).toBe("C")
        expect(settings.team2BuildVariant).toBe("A")
    })

    it("序列化时保留MOD变体与协战关联的配置字母", () => {
        const settings = createDefaultCharSettings()
        settings.charMods[0] = [31524, 10]
        addModVariant(settings)
        getModVariantSlots(settings, "角色")[0] = [31525, 8]
        settings.team1Build = "abc123"
        settings.team1BuildVariant = "B"

        const serialized = JSON.parse(serializeCharSettings(settings))

        expect(serialized.modVariantIndex).toBe(1)
        expect(serialized.charMods[0]).toEqual([31524, 10])
        expect(serialized.modVariants[0].角色[0]).toEqual([31525, 8])
        expect(serialized.team1BuildVariant).toBe("B")
    })

    it("actions 支持为空：缺失/null 回退为默认值", () => {
        expect(normalizeCharSettings({}).actions).toEqual({ enable: false, i: [], b: [], hp: [], bgs: [] })
        expect(normalizeCharSettings({ actions: null }).actions).toEqual({ enable: false, i: [], b: [], hp: [], bgs: [] })
        expect(normalizeInlineActions(undefined)).toEqual({ enable: false, i: [], b: [], hp: [], bgs: [] })
        expect(isEmptyInlineActions(undefined)).toBe(true)
        expect(isEmptyInlineActions(null)).toBe(true)
    })

    it("序列化未配置的 actions 时直接省略，已配置时保留", () => {
        expect("actions" in JSON.parse(serializeCharSettings({}))).toBe(false)
        expect("actions" in JSON.parse(serializeCharSettings({ actions: null }))).toBe(false)
        const configured = JSON.parse(
            serializeCharSettings({ actions: { enable: true, i: [{ s: "普攻", d: 1 }], b: [], hp: [], bgs: [] } })
        )
        expect(configured.actions.enable).toBe(true)
        expect(configured.actions.i).toEqual([{ s: "普攻", d: 1 }])
        // 省略后回读仍能补齐，不影响运行时
        expect(normalizeCharSettings(JSON.parse(serializeCharSettings({}))).actions).toEqual({
            enable: false,
            i: [],
            b: [],
            hp: [],
            bgs: [],
        })
    })
})

describe("useCharSettings 本地持久化（U96-fix）", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    // localStorage 后端：node_modules 外部化后不受 resetModules 影响，
    // composable 模块只动态导入一次，靠替换后端 Map 隔离用例、模拟刷新。
    const holder: { map: Map<string, string>; writes: { key: string; value: string }[] } = { map: new Map(), writes: [] }
    let settingsModule: typeof import("./useCharSettings") | null = null

    function stubBrowser() {
        const localStorage = {
            getItem: (key: string) => holder.map.get(key) ?? null,
            setItem: (key: string, value: string) => {
                holder.map.set(key, value)
                holder.writes.push({ key, value })
            },
            removeItem: (key: string) => {
                holder.map.delete(key)
            },
        }
        // useStorage 在模块加载时锁定 window，必须先 stub 再动态导入；Storage / document 桩同侧边栏测试
        const documentStub = { createElement: () => ({}) }
        vi.stubGlobal("Storage", class {})
        vi.stubGlobal("document", documentStub)
        vi.stubGlobal("window", {
            document: documentStub,
            localStorage,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        })
        vi.stubGlobal("localStorage", localStorage)
    }

    async function open(charId = 1101, prefill: Record<string, string> = {}) {
        holder.map = new Map(Object.entries(prefill))
        stubBrowser()
        if (!settingsModule) settingsModule = await import("./useCharSettings")
        return settingsModule.useCharSettings(ref(charId))
    }

    it("本地主存档写入 serializeCharSettings 压缩格式", async () => {
        const settings = await open()
        settings.value.baseName = "普通攻击"
        settings.value.transcend.enabled = true
        settings.value.transcend.talentLevels = createMaxedReachableTalentLevels()
        await nextTick()

        const raw = holder.map.get("build.1101")
        expect(raw).toBeDefined()
        expect(raw).toBe(serializeCharSettings(settings.value))
        const payload = JSON.parse(raw as string).transcend
        expect(payload.enabled).toBe(1)
        expect("talentLevels" in payload).toBe(false)
        expect("mainGear" in payload).toBe(false)
        expect(Array.isArray(payload.gearVariants[0])).toBe(true)
    })

    it("刷新读取压缩存档与归一化结果一致", async () => {
        const source = createDefaultCharSettings()
        source.baseName = "普通攻击"
        source.transcend = { ...source.transcend, enabled: true, talentLevels: createMaxedReachableTalentLevels() }
        const serialized = serializeCharSettings(source)
        const settings = await open(1101, { "build.1101": serialized })

        expect(settings.value).toEqual(normalizeCharSettings(JSON.parse(serialized)))
        expect(settings.value.transcend.talentLevels).toEqual(createMaxedReachableTalentLevels())
    })

    it("损坏 JSON 回退该角色默认配置", async () => {
        const settings = await open(1101, { "build.1101": "{not-json" })

        expect(settings.value).toEqual(createDefaultCharSettings())
    })

    it("切换角色时读取各自键的存档", async () => {
        const other = createDefaultCharSettings()
        other.baseName = "另一个技能"
        const charId = ref(1101)
        holder.map = new Map([["build.2201", serializeCharSettings(other)]])
        stubBrowser()
        if (!settingsModule) settingsModule = await import("./useCharSettings")
        const settings = settingsModule.useCharSettings(charId)

        expect(settings.value.baseName).not.toBe("另一个技能")
        charId.value = 2201
        await nextTick()
        expect(settings.value.baseName).toBe("另一个技能")
    })

    it("换键读入部分 assist 字段的旧存档后补齐默认，且不产生多余写", async () => {
        // 模拟旧存档：assist1 只有 charLevel，缺 charSkillLevel / customVariables / dotSettings
        const partial = { ...normalizeCharSettings({ baseName: "普通攻击" }), assist1: { charLevel: 55 } }
        const charId = ref(1101)
        holder.map = new Map([["build.2201", JSON.stringify(partial)]])
        holder.writes = []
        stubBrowser()
        if (!settingsModule) settingsModule = await import("./useCharSettings")
        const settings = settingsModule.useCharSettings(charId)

        holder.writes = []
        charId.value = 2201
        await nextTick()

        expect(settings.value.assist1.charLevel).toBe(55)
        expect(settings.value.assist1.charSkillLevel).toEqual([10, 10, 10])
        expect(settings.value.assist1.customVariables).toEqual([])
        expect(settings.value.assist1.dotSettings).toEqual({
            skill: 0,
            melee: 0,
            ranged: 0,
            skillweapon: 0,
            forceOwnAdditionalDamage: false,
        })
        // 读取端已归一化；换键最多产生一次「旧格式 → 压缩格式」的规范化回写，不会重复写
        const targetWrites = holder.writes.filter(entry => entry.key === "build.2201")
        expect(targetWrites.length).toBeLessThanOrEqual(1)
        for (const entry of targetWrites) expect(entry.value).toBe(serializeCharSettings(settings.value))
    })

    it("换键后对旧值的归一化不会回写旧键", async () => {
        const charId = ref(1101)
        holder.map = new Map()
        holder.writes = []
        stubBrowser()
        if (!settingsModule) settingsModule = await import("./useCharSettings")
        const settings = settingsModule.useCharSettings(charId)
        // 直接把内存值改成旧存档形状（模拟无 Storage 环境下的直接赋值）
        settings.value = { ...settings.value, assist1: { charLevel: 66 } } as typeof settings.value
        await nextTick()
        holder.writes = []
        charId.value = 2201
        await nextTick()

        expect(settings.value.assist1.charSkillLevel).toEqual([10, 10, 10])
        expect(holder.writes.filter(entry => entry.key === "build.1101")).toEqual([])
    })

    it("载入未使用升华的分享不会清空本地升华", async () => {
        const { mergeSharedCharSettings } = await import("@/utils/transcend-gear/gain-context")
        const local = createDefaultCharSettings().transcend
        local.enabled = true
        local.talentLevels = [[100001, 1]]
        const share = JSON.parse(serializeCharSettingsForShare(createDefaultCharSettings()))

        expect("transcend" in share).toBe(false)
        const merged = mergeSharedCharSettings(share, local)
        expect(merged.transcend.enabled).toBe(true)
        expect(merged.transcend.talentLevels).toEqual([[100001, 1]])
    })
})
