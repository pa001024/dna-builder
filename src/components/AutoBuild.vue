<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue"
import { type CharBuild, type LeveledModWithCount, type LeveledWeapon, type ModTypeKey } from "@/data"
import type { AutoBuildRequest, AutoBuildWorkerMessage } from "@/data/AutoBuild.worker"
import { createBuildFromSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { useInvStore } from "@/store/inv"

// 用户库存
const inv = useInvStore()

const autoBuildSetting = useLocalStorage("autobuild.setting", {
    useInv: true, // 使用用户库存
    includeTypes: [] as ModTypeKey[], // 包含的MOD类型
    preserveTypes: [] as ModTypeKey[], // 保留的MOD类型
    includeMelee: false, // 包含近战武器
    includeRanged: false, // 包含远程武器
})

/**
 * 将旧版本保存的同律槽位名迁移为自动构筑核心使用的字段名。
 * @param types 已保存的MOD类型
 * @returns 规范化且去重后的MOD类型
 */
function normalizeStoredModTypes(types: ModTypeKey[]): ModTypeKey[] {
    return Array.from(new Set(types.map(type => ((type as string) === "skillWeaponMods" ? "skillMods" : type))))
}

autoBuildSetting.value.includeTypes = normalizeStoredModTypes(autoBuildSetting.value.includeTypes)
autoBuildSetting.value.preserveTypes = normalizeStoredModTypes(autoBuildSetting.value.preserveTypes)

const props = defineProps<{
    charBuild: CharBuild
    update?: boolean
}>()
const emit = defineEmits<{
    change: [CharBuild]
}>()

// 最近一次自动构筑结果（主线程水合后的构筑实例 + worker 返回的日志/收益）
// 用 shallowRef 保持 CharBuild 类实例的原始类型（ref 的 UnwrapRef 会把它展开成结构类型导致类型丢失）
const autoBuild = shallowRef<{
    newBuild: CharBuild
    buildLog: string
    iter: number
    incomes: Record<string, number>
}>({
    newBuild: props.charBuild,
    buildLog: "",
    iter: 0,
    incomes: {},
})

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

let worker: Worker | null = null
let workerRequestId = 0

/**
 * 初始化自动构筑 Worker。
 * @returns Worker 实例
 */
function initWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL("@/data/AutoBuild.worker.ts", import.meta.url), {
            type: "module",
        })
    }
    return worker
}

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
 * 在后台 Worker 中执行自动构筑并同步计算已装备 MOD 收益。
 */
function buildMods() {
    const id = ++workerRequestId
    computing.value = true
    // 开始新一轮计算：清空实时日志并自动展开日志面板
    liveLog.value = ""
    showLog.value = true
    const request: AutoBuildRequest = {
        id,
        build: createWorkerSnapshot(props.charBuild),
        includeTypes: [...autoBuildSetting.value.includeTypes],
        preserveTypes: [...autoBuildSetting.value.preserveTypes],
        fixedMelee: !autoBuildSetting.value.includeMelee,
        fixedRanged: !autoBuildSetting.value.includeRanged,
        modOptions: inv.getModsWithCount(autoBuildSetting.value.useInv, autoBuildSetting.value.includeTypes).map(createModOptionSnapshot),
        meleeOptions: inv.getMeleeWeapons(autoBuildSetting.value.useInv, props.charBuild.char.属性).map(createWeaponOptionSnapshot),
        rangedOptions: inv.getRangedWeapons(autoBuildSetting.value.useInv, props.charBuild.char.属性).map(createWeaponOptionSnapshot),
        enableLog: true,
    }
    const currentWorker = initWorker()

    /**
     * 处理 Worker 返回消息：实时日志逐行追加，最终结果负责水合构筑。
     * @param event 消息事件
     */
    const handleMessage = (event: MessageEvent<AutoBuildWorkerMessage>) => {
        if (event.data.id !== workerRequestId) return
        // 实时日志消息：直接追加展示
        if (event.data.type === "log") {
            liveLog.value += `${event.data.message}\n`
            return
        }
        // 最终结果消息
        cleanup()
        if (event.data.error) {
            computing.value = false
            console.error("自动构筑失败", event.data.error)
            return
        }
        autoBuild.value = {
            newBuild: createBuildFromSnapshot(event.data.newBuild!),
            buildLog: event.data.log || "",
            iter: event.data.iter || 0,
            incomes: event.data.incomes || {},
        }
        // 以 worker 返回的完整日志为准
        liveLog.value = event.data.log || ""
        computing.value = false
        emit("change", autoBuild.value.newBuild)
    }

    /**
     * 处理 Worker 全局错误。
     * @param error 错误事件
     */
    const handleError = (error: ErrorEvent) => {
        cleanup()
        if (id !== workerRequestId) return
        computing.value = false
        console.error("自动构筑 Worker 出错", error)
    }

    /**
     * 清理本次请求的监听器。
     */
    const cleanup = () => {
        currentWorker.removeEventListener("message", handleMessage)
        currentWorker.removeEventListener("error", handleError)
    }

    currentWorker.addEventListener("message", handleMessage)
    currentWorker.addEventListener("error", handleError)
    currentWorker.postMessage(cloneForWorker(request))
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

onBeforeUnmount(() => {
    worker?.terminate()
    worker = null
})

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

        <!-- 设置 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SETTINGS" />
            <!-- 开关方章 -->
            <div class="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                    :class="
                        autoBuildSetting.useInv
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                    "
                    @click="autoBuildSetting.useInv = !autoBuildSetting.useInv"
                >
                    {{ $t("autobuild.useInv") }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                    :class="
                        autoBuildSetting.includeMelee
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                    "
                    @click="autoBuildSetting.includeMelee = !autoBuildSetting.includeMelee"
                >
                    {{ $t("autobuild.includeMelee") }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                    :class="
                        autoBuildSetting.includeRanged
                            ? 'border-primary bg-primary/10 font-semibold text-primary'
                            : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                    "
                    @click="autoBuildSetting.includeRanged = !autoBuildSetting.includeRanged"
                >
                    {{ $t("autobuild.includeRanged") }}
                </button>
            </div>
            <!-- 包含 MOD 类型方章 -->
            <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("autobuild.includeTypes") }}</span>
                <button
                    v-for="option in [{ label: $t('角色'), value: 'charMods' }, { label: $t('近战'), value: 'meleeMods' }, { label: $t('远程'), value: 'rangedMods' }, { label: $t('同律'), value: 'skillMods' }]"
                    :key="option.value"
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        autoBuildSetting.includeTypes.includes(option.value as ModTypeKey)
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="toggleArrayValue(autoBuildSetting.includeTypes, option.value as ModTypeKey)"
                >
                    {{ option.label }}
                </button>
            </div>
            <!-- 保留 MOD 类型方章 -->
            <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("autobuild.preserveTypes") }}</span>
                <button
                    v-for="option in [{ label: $t('角色'), value: 'charMods' }, { label: $t('近战'), value: 'meleeMods' }, { label: $t('远程'), value: 'rangedMods' }, { label: $t('同律'), value: 'skillMods' }]"
                    :key="option.value"
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        autoBuildSetting.preserveTypes.includes(option.value as ModTypeKey)
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="toggleArrayValue(autoBuildSetting.preserveTypes, option.value as ModTypeKey)"
                >
                    {{ option.label }}
                </button>
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
            v-for="key in autoBuildSetting.includeTypes"
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
                        title="展开/收起日志"
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
