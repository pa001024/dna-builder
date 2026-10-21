<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, nextTick, ref, shallowRef, watch } from "vue"
import { requestBuildIncomes } from "@/composables/useBuildIncomeWorker"
import { type CharBuild, type LeveledModWithCount, type LeveledWeapon, type ModTypeKey, ModTypeMap } from "@/data"
import type { CalcAutobuildRequest } from "@/data/Calc.worker"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { type CharSettings, getModVariantSlots, type ModSlotType, normalizeCharSettings } from "@/data/charSettings"
import { useInvStore } from "@/store/inv"
import { useUIStore } from "@/store/ui"
import { copyText, format100r, formatBigNumber } from "@/util"
import { postCalcRequest } from "@/utils/calc-worker"

// 用户库存
const inv = useInvStore()

const MOD_TYPE_KEYS: ModTypeKey[] = ["charMods", "meleeMods", "rangedMods", "skillMods"]
const autoBuildSetting = useLocalStorage("autobuild.setting", {
    useInv: true, // 使用用户库存
    includeTypes: [] as ModTypeKey[], // 包含的MOD类型
    preservedMods: {} as Record<ModTypeKey, number[]>, // 逐件保留的槽位索引（与当前构筑槽位数组对齐，过滤空槽前的下标）
    includeMelee: false, // 包含近战武器
    includeRanged: false, // 包含远程武器
})

const props = defineProps<{
    charBuild: CharBuild
    update?: boolean
    charId?: number
    settings?: Record<string, unknown>
}>()
const emit = defineEmits<{
    change: [CharBuild]
}>()
/** 是否有独立同律武器（存在且非 inherit 继承型）：无则同律槽无意义，相关 UI 不展示 */
const hasStandaloneSkillWeapon = computed(() => !!props.charBuild.skillWeapon && !props.charBuild.skillWeapon.inherit)
/** 保留区展示的槽位：无独立同律时隐藏同律块 */
const preserveKeys = computed(() => MOD_TYPE_KEYS.filter(key => key !== "skillMods" || hasStandaloneSkillWeapon.value))
/** 实际参与搜索的槽位：无独立同律时排除存量 skillMods（方章已隐藏，用户勾不到） */
const effectiveIncludeTypes = computed(() => autoBuildSetting.value.includeTypes.filter(key => key !== "skillMods" || hasStandaloneSkillWeapon.value))
/**
 * 将旧版本保存的同律槽位名迁移为自动构筑核心使用的字段名。
 * @param types 已保存的MOD类型
 * @returns 规范化且去重后的MOD类型
 */
function normalizeStoredModTypes(types: ModTypeKey[]): ModTypeKey[] {
    return Array.from(new Set(types.map(type => ((type as string) === "skillWeaponMods" ? "skillMods" : type))))
}

autoBuildSetting.value.includeTypes = normalizeStoredModTypes(autoBuildSetting.value.includeTypes ?? [])
// useLocalStorage 不合并默认值：老存储缺 preservedMods 键，需先补空对象再迁移
autoBuildSetting.value.preservedMods ??= {} as Record<ModTypeKey, number[]>
if (Object.keys(autoBuildSetting.value.preservedMods).length === 0) {
    const legacy = (autoBuildSetting.value as unknown as { preserveTypes?: ModTypeKey[] }).preserveTypes ?? []
    for (const key of normalizeStoredModTypes(legacy)) {
        autoBuildSetting.value.preservedMods[key] = props.charBuild[key].map((mod, index) => (mod !== null ? index : -1)).filter(index => index >= 0)
    }
    delete (autoBuildSetting.value as unknown as Record<string, unknown>).preserveTypes
} else {
    // 上一轮存的是 MOD id（>=8），本轮改存槽位索引：按当前构筑把 id 映射回槽位下标
    for (const key of Object.keys(autoBuildSetting.value.preservedMods) as ModTypeKey[]) {
        const stored = autoBuildSetting.value.preservedMods[key] ?? []
        if (stored.some(value => value >= 8)) {
            const ids = new Set(stored)
            autoBuildSetting.value.preservedMods[key] = props.charBuild[key]
                .map((mod, index) => (mod !== null && ids.has(mod.id) ? index : -1))
                .filter(index => index >= 0)
        }
    }
}
/**
 * 当前构筑指定槽位已装备的 MOD 数量（过滤空槽）。
 * @param key MOD 槽位类型
 * @returns 已装备数量
 */
function equippedCount(key: ModTypeKey): number {
    return props.charBuild[key].filter(mod => mod !== null).length
}

/**
 * 指定槽位逐件保留的槽位索引（与构筑槽位数组下标对齐，含空槽占位）。
 * @param key MOD 槽位类型
 * @returns 已勾选保留的槽位下标
 */
function preservedSlots(key: ModTypeKey): number[] {
    return autoBuildSetting.value.preservedMods[key] ?? []
}

/**
 * 切换单件 MOD 的保留勾选（按槽位下标，同 id 叠放互不干扰）。
 * @param key MOD 槽位类型
 * @param slotIndex 槽位下标
 */
function togglePreservedMod(key: ModTypeKey, slotIndex: number) {
    const list = [...preservedSlots(key)]
    const position = list.indexOf(slotIndex)
    if (position >= 0) list.splice(position, 1)
    else list.push(slotIndex)
    autoBuildSetting.value.preservedMods[key] = list
}

/**
 * 全选/清空指定槽位的保留勾选（只针对当前已装备件）。
 * @param key MOD 槽位类型
 * @param select 是否全选
 */
function setPreservedMods(key: ModTypeKey, select: boolean) {
    autoBuildSetting.value.preservedMods[key] = select
        ? props.charBuild[key].map((mod, index) => (mod !== null ? index : -1)).filter(index => index >= 0)
        : []
}


// 最近一次自动构筑结果（主线程水合后的构筑实例 + worker 返回的日志/收益）
// 用 shallowRef 保持 CharBuild 类实例的原始类型（ref 的 UnwrapRef 会把它展开成结构类型导致类型丢失）
const autoBuild = shallowRef<{
    newBuild: CharBuild
    buildLog: string
    iter: number
    incomes: Record<string, number>
    engine: string
}>({
    newBuild: props.charBuild,
    buildLog: "",
    iter: 0,
    incomes: {},
    engine: "",
})
const ui = useUIStore()

const beforeValue = computed(() => {
    try {
        return props.charBuild.calculate()
    } catch {
        return Number.NaN
    }
})
const afterValue = computed(() => {
    try {
        return autoBuild.value.newBuild.calculate()
    } catch {
        return Number.NaN
    }
})
const gainPct = computed(() => {
    if (!Number.isFinite(beforeValue.value) || Math.abs(beforeValue.value) < Number.EPSILON || !Number.isFinite(afterValue.value)) {
        return null
    }
    return afterValue.value / beforeValue.value - 1
})

function formatTargetValue(value: number): string {
    if (!Number.isFinite(value)) return "—"
    return formatBigNumber(value)
}

function formatTargetValueExact(value: number): string {
    if (!Number.isFinite(value)) return ""
    return Math.round(value).toLocaleString()
}

// 是否正在后台计算
const computing = ref(false)
// 日志是否展开
const showLog = ref(false)
// 实时构筑日志（worker 逐行回传，边算边显示）
const liveLog = ref("")
// 日志滚动容器
const logContainer = ref<HTMLElement | null>(null)

// 日志更新时自动滚动到底部，保证实时可见最新一行
watch(liveLog, async () => {
    await nextTick()
    const container = logContainer.value
    if (container) container.scrollTop = container.scrollHeight
})

let workerRequestId = 0

/**
 * 将 Vue proxy 与类实例数据转为 worker 可结构化克隆的普通数据。
 * @param value 原始数据
 * @returns 普通数据
 */
function cloneForWorker<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 创建带数量的 MOD 选项快照。
 * @param mod MOD 选项
 * @returns worker 可克隆快照
 */
function createModOptionSnapshot(mod: LeveledModWithCount) {
    return {
        data: mod.originalModData,
        level: mod.等级,
        buffLv: mod.buffLv,
        effect: mod.buff?._originalBuffData,
        count: mod.count,
    }
}

/**
 * 创建武器选项快照。
 * @param weapon 武器选项
 * @returns worker 可克隆快照
 */
function createWeaponOptionSnapshot(weapon: LeveledWeapon) {
    return {
        data: weapon._originalWeaponData,
        refine: weapon.精炼,
        level: weapon.等级,
        effectLv: weapon.effectLv,
        effect: weapon.buff?._originalBuffData,
        forgeEffective: weapon.forgeEffective,
    }
}
/**
 * 逐件保留 → 底层整组保留的适配：勾选非空的槽位传 preserve，未勾选槽位从快照与设置中裁掉。
 * 底层只认整组开关，不动；种子=裁剪后的当前槽位，等价于逐件保留。
 * @returns 裁剪后的快照、设置与派生的 preserveTypes
 */
function buildPreservedRequest() {
    const snapshot = createWorkerSnapshot(props.charBuild)
    const settings = props.settings ? JSON.parse(JSON.stringify(props.settings)) : undefined
    const preserveTypes: ModTypeKey[] = []
    for (const key of MOD_TYPE_KEYS) {
        const selected = new Set(preservedSlots(key))
        if (selected.size === 0) continue
        preserveTypes.push(key)
        snapshot[key] = snapshot[key].map((mod, index) => (mod && selected.has(index) ? mod : null))
        trimSettingsSlots(settings, key, selected)
    }
    return { snapshot, settings, preserveTypes }
}

/**
 * 从 settings 激活变体的对应槽位中移除未勾选槽位（就地改写深拷贝，供 wasm 路径用）。
 * @param settings 深拷贝后的角色设置
 * @param key MOD 槽位类型
 * @param selected 已勾选保留的槽位下标
 */
function trimSettingsSlots(settings: Record<string, unknown> | undefined, key: ModTypeKey, selected: Set<number>) {
    if (!settings) return
    const slots = getModVariantSlots(settings as unknown as CharSettings, ModTypeMap[key] as ModSlotType)
    for (let index = 0; index < slots.length; index++) {
        if (slots[index] && !selected.has(index)) slots[index] = null
    }
}

/**
 * 在后台 Worker 中执行自动构筑并同步计算已装备 MOD 收益。
 */
function buildMods() {
    const id = ++workerRequestId
    computing.value = true
    // 开始新一轮计算：清空实时日志并自动展开日志面板
    liveLog.value = ""
    showLog.value = true
    const preserved = buildPreservedRequest()
    postCalcRequest(
        cloneForWorker({
            kind: "autobuild",
            build: preserved.snapshot,
            includeTypes: [...effectiveIncludeTypes.value],
            preserveTypes: preserved.preserveTypes,
            fixedMelee: !autoBuildSetting.value.includeMelee,
            fixedRanged: !autoBuildSetting.value.includeRanged,
            modOptions: inv
                .getModsWithCount(autoBuildSetting.value.useInv, effectiveIncludeTypes.value)
                .map(createModOptionSnapshot),
            meleeOptions: inv
                .getMeleeWeapons(autoBuildSetting.value.useInv, props.charBuild.char.属性)
                .map(createWeaponOptionSnapshot),
            rangedOptions: inv
                .getRangedWeapons(autoBuildSetting.value.useInv, props.charBuild.char.属性)
                .map(createWeaponOptionSnapshot),
            enableLog: true,
            charId: props.charId,
            settings: preserved.settings as CalcAutobuildRequest["settings"],
        }),
        message => {
            if (id === workerRequestId) liveLog.value += `${message}\n`
        }
    )
        .then(data => {
            if (id !== workerRequestId) return
            if (data.wasmError) console.warn("wasm 自动配装回退 TS：", data.wasmError)
            const newBuild =
                data.engine === "wasm" && data.settings
                    ? createCharBuildFromSettings(props.charId!, normalizeCharSettings(data.settings), {
                          buffLv: inv.buffLv,
                          wLv: inv.wLv,
                      })
                    : createBuildFromSnapshot(data.newBuild!)
            autoBuild.value = {
                newBuild,
                buildLog: data.log || "",
                iter: data.iter || 0,
                incomes: data.incomes || {},
                engine: data.engine || "",
            }
            // wasm 路径不返回 incomes：用结果 settings 补发一次 income 请求回填各槽位收益
            if (data.engine === "wasm" && data.settings) {
                const incomeId = id
                const includeTypes = [...effectiveIncludeTypes.value]
                requestBuildIncomes(
                    cloneForWorker({
                        build: createWorkerSnapshot(newBuild),
                        equippedMods: includeTypes.flatMap(key =>
                            newBuild[key].flatMap((mod, index) => (mod ? [{ key: `${key}:${index}`, type: ModTypeMap[key], index }] : []))
                        ),
                        charId: props.charId,
                        settings: data.settings,
                        skillInherit: newBuild.skillWeapon?.inherit,
                    })
                )
                    .then(incomes => {
                        if (incomeId !== workerRequestId) return
                        autoBuild.value = { ...autoBuild.value, incomes }
                    })
                    .catch(error => console.error("自动构筑收益回填失败", error))
            }
            liveLog.value = data.log || ""
            computing.value = false
            emit("change", autoBuild.value.newBuild)
        })
        .catch(error => {
            if (id !== workerRequestId) return
            computing.value = false
            console.error("自动构筑失败", error)
        })
}
watch(
    [
        () => props.update,
        () => props.charBuild,
        () => autoBuildSetting.value,
        () => inv.mods,
        () => inv.enableMods,
        () => inv.enableWeapons,
        () => inv.meleeWeapons,
        () => inv.rangedWeapons,
        () => inv.buffLv,
        () => inv.wLv,
    ],
    () => {
        // 仅在面板打开(update)时触发自动构筑，与旧同步实现保持一致
        if (props.update) void buildMods()
    },
    { immediate: true, deep: true }
)


/**
 * 切换数组中的值（已包含则移除，否则追加）。
 * @param list 目标数组
 * @param value 要切换的值
 */
function toggleArrayValue<T>(list: T[], value: T) {
    const index = list.indexOf(value)
    if (index >= 0) list.splice(index, 1)
    else list.push(value)
}

/**
 * 统计指定槽位已装备的 MOD 数量。
 * @param key MOD 槽位类型
 * @returns 已装备数量
 */
function modCount(key: ModTypeKey): number {
    return autoBuild.value.newBuild[key].filter(mod => mod !== null).length
}

/**
 * 组装诊断信息：复现输入（charId/charSettings/库存）+ 搜索参数 + 结果摘要 + 构筑日志。
 * 拿到文本即可本地复现：建构筑→autoBuild→比对。
 */
async function copyDiagnostics() {
    const setting = autoBuildSetting.value
    const preservedKeys = MOD_TYPE_KEYS.filter(key => preservedSlots(key).length > 0)
    // 库存快照：只收录本次搜索实际用到的 id（结果件 + 初始槽位件），避免全量库存刷屏
    const relevantIds = new Set<number>()
    for (const key of MOD_TYPE_KEYS) {
        for (const mod of [...props.charBuild[key], ...autoBuild.value.newBuild[key]]) {
            if (mod) relevantIds.add(mod.id)
        }
    }
    const invSnapshot: Record<number, [number, number] | number> = {}
    for (const id of [...relevantIds].sort((a, b) => a - b)) {
        if (id in inv.mods) invSnapshot[id] = inv.mods[id]
    }
    const lines = [
        `引擎: ${autoBuild.value.engine || "未知"} / 迭代: ${autoBuild.value.iter}`,
        `目标: ${props.charBuild.targetFunction} ${formatTargetValueExact(beforeValue.value)} → ${formatTargetValueExact(afterValue.value)}`,
        `包含槽位: ${effectiveIncludeTypes.value.join(",") || "无"}`,
        `保留槽位: ${preservedKeys.join(",") || "无"}`,
        ...MOD_TYPE_KEYS.map(key => `保留${key}: [${preservedSlots(key).join(",")}]`),
        `使用库存: ${setting.useInv} / 自动更换近战: ${setting.includeMelee} / 自动更换远程: ${setting.includeRanged}`,
        `近战武器: ${autoBuild.value.newBuild.meleeWeapon.名称} / 远程武器: ${autoBuild.value.newBuild.rangedWeapon.名称}`,
        ...MOD_TYPE_KEYS.map(
            key => `结果${key}: [${autoBuild.value.newBuild[key].filter(mod => mod !== null).map(mod => `${mod!.名称}(${mod!.id},Lv${mod!.等级})`).join(", ")}]`
        ),
        "--- 构筑日志 ---",
        liveLog.value || "(空)",
        "--- 复现输入 ---",
        `charId: ${props.charId}`,
        `charSettings: ${JSON.stringify(props.settings)}`,
        `inv.mods(相关): ${JSON.stringify(invSnapshot)}`,
        `inv.enableMods: ${JSON.stringify(inv.enableMods)}`,
    ]
    try {
        await copyText(lines.join("\n"))
        ui.showSuccessMessage("已复制诊断信息")
    } catch (error) {
        ui.showErrorMessage("复制诊断信息失败", error instanceof Error ? error.message : String(error))
    }
}
</script>
<template>
    <div class="stagger-rise space-y-3">
        <!-- 说明行 + 计算中状态 -->
        <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] tracking-wide text-base-content/50">{{ $t("autobuild.desc") }}</p>
            <span
                v-if="computing"
                class="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-primary"
            >
                <Icon icon="ri:refresh-line" class="h-3.5 w-3.5 animate-spin" />
                {{ $t("autobuild.calculating") }}
            </span>
        </div>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="RESULT" :title="$t('autobuild.result')" />
            <div class="flex items-center justify-around gap-2 text-center">
                <div class="flex min-w-0 flex-1 flex-col items-center gap-0.5 leading-none">
                    <span class="text-[11px] text-base-content/55">{{ props.charBuild.targetFunction || "—" }}</span>
                    <span
                        class="w-full truncate font-orbitron text-lg font-bold tabular-nums text-base-content/70"
                        :title="formatTargetValueExact(beforeValue)"
                    >
                        {{ formatTargetValue(beforeValue) }}
                    </span>
                </div>
                <div class="flex shrink-0 flex-col items-center gap-0.5">
                    <Icon icon="ri:arrow-right-line" class="size-5 text-base-content/40" />
                    <span
                        v-if="gainPct !== null"
                        class="font-orbitron text-[11px] font-bold tabular-nums"
                        :class="gainPct >= 0 ? 'text-success' : 'text-error'"
                    >
                        {{ format100r(gainPct, 1) }}
                    </span>
                </div>
                <div class="flex min-w-0 flex-1 flex-col items-center gap-0.5 leading-none">
                    <span class="text-[11px] text-base-content/55">{{ autoBuild.newBuild.targetFunction || "—" }}</span>
                    <span
                        class="w-full truncate font-orbitron text-lg font-bold tabular-nums text-primary"
                        :title="formatTargetValueExact(afterValue)"
                    >
                        {{ formatTargetValue(afterValue) }}
                    </span>
                </div>
            </div>
        </section>
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SETTINGS" />
            <!-- 开关方章 -->
            <div class="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="
                        autoBuildSetting.useInv
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : ''
                    "
                    @click="autoBuildSetting.useInv = !autoBuildSetting.useInv"
                >
                    {{ $t("autobuild.useInv") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="
                        autoBuildSetting.includeMelee
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : ''
                    "
                    @click="autoBuildSetting.includeMelee = !autoBuildSetting.includeMelee"
                >
                    {{ $t("autobuild.includeMelee") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="
                        autoBuildSetting.includeRanged
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : ''
                    "
                    @click="autoBuildSetting.includeRanged = !autoBuildSetting.includeRanged"
                >
                    {{ $t("autobuild.includeRanged") }}
                </button>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("autobuild.includeTypes") }}</span>
                <button
                    v-for="option in [{ label: $t('角色'), value: 'charMods' }, { label: $t('近战'), value: 'meleeMods' }, { label: $t('远程'), value: 'rangedMods' }, ...(hasStandaloneSkillWeapon ? [{ label: $t('同律'), value: 'skillMods' }] : [])]"
                    :key="option.value"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="
                        autoBuildSetting.includeTypes.includes(option.value as ModTypeKey)
                            ? 'btn-primary'
                            : ''
                    "
                    @click="toggleArrayValue(autoBuildSetting.includeTypes, option.value as ModTypeKey)"
                >
                    {{ option.label }}
                </button>
            </div>
            <!-- 保留 MOD：逐件勾选当前构筑已装备件 -->
            <div class="mt-3 space-y-2">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("autobuild.preserveTypes") }}</span>
                    <span class="text-[11px] text-base-content/40">{{ $t("autobuild.preserveHint") }}</span>
                </div>
                <div v-for="key in preserveKeys" :key="key" class="rounded-xs border border-base-content/10 bg-base-100/40 p-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="shrink-0 text-[11px] font-semibold text-base-content/70">{{ $t(`autobuild.${key === "skillMods" ? "skillWeaponMods" : key}`) }}</span>
                        <span class="text-[11px] text-base-content/40 tabular-nums">{{ preservedSlots(key).length }}/{{ equippedCount(key) }}</span>
                        <span class="flex-1" />
                        <button
                            type="button"
                            class="cursor-pointer text-[11px] text-primary/80 hover:text-primary"
                            @click="setPreservedMods(key, true)"
                        >
                            {{ $t("autobuild.selectAll") }}
                        </button>
                        <button
                            type="button"
                            class="cursor-pointer text-[11px] text-base-content/50 hover:text-primary"
                            @click="setPreservedMods(key, false)"
                        >
                            {{ $t("autobuild.clearSelection") }}
                        </button>
                    </div>
                    <div v-if="equippedCount(key)" class="mt-2 grid grid-cols-4 gap-2 lg:grid-cols-8">
                        <template v-for="(mod, index) in props.charBuild[key]" :key="index">
                            <div
                                v-if="mod"
                                class="cursor-pointer rounded-xs transition-all duration-150"
                                :class="preservedSlots(key).includes(index) ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-100' : 'opacity-60 hover:opacity-100'"
                                :title="mod.名称"
                                @click="togglePreservedMod(key, index)"
                            >
                                <ModItem :mod="mod" noremove />
                            </div>
                        </template>
                    </div>
                    <p v-else class="mt-1 text-[11px] text-base-content/40">{{ $t("autobuild.noEquippedMods") }}</p>
                </div>
            </div>
        </section>

        <!-- 武器 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="WEAPONS" :title="$t('char-build.weapon')" />
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <BuildWeaponCard :weapon="autoBuild.newBuild.meleeWeapon" />
                <BuildWeaponCard :weapon="autoBuild.newBuild.rangedWeapon" />
            </div>
        </section>

        <!-- 各 MOD 类型区块 -->
        <section
            v-for="key in effectiveIncludeTypes"
            :key="key"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="MODS" :title="$t(`autobuild.${key}`)" :count="modCount(key)" />
            <div class="grid grid-cols-4 gap-2 lg:grid-cols-8">
                <ModItem
                    v-for="(mod, index) in autoBuild.newBuild[key]"
                    :key="index"
                    :mod="mod"
                    :income="autoBuild.incomes[`${key}:${index}`] ?? 0"
                    noremove
                />
            </div>
        </section>

        <!-- 日志 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LOG" :title="$t('autobuild.log')">
                <template #trailing>
                    <button
                        type="button"
                        class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/55 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        :title="$t('autobuild.copy_diagnostics')"
                        @click="copyDiagnostics"
                    >
                        <Icon icon="ri:file-copy-line" class="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/55 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        :title="$t('autobuild.toggle_log')"
                        @click="showLog = !showLog"
                    >
                        <Icon
                            icon="ri:arrow-down-s-line"
                            class="h-4 w-4 transition-transform duration-200"
                            :class="{ 'rotate-180': showLog }"
                        />
                    </button>
                </template>
            </SectionHeader>
            <div
                ref="logContainer"
                v-show="showLog"
                class="mt-2 max-h-32 overflow-auto rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
            >
                <pre class="font-mona text-xs whitespace-pre-wrap text-base-content/60">{{ liveLog }}</pre>
            </div>
        </section>
    </div>
</template>
