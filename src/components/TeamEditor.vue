<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { buildsQuery } from "@/api/graphql"
import type { CharSettings } from "@/composables/useCharSettings"
import { charMap, LeveledChar, LeveledWeapon, weaponMap } from "@/data"

/**
 * 协战编辑区——专业模式 BUFF 面板顶部的队友/队友武器配置。
 *
 * 交互参考 WeaponTab / GameUpdate：不摆放普通下拉框，而是把当前选择直接渲染成
 * 「简洁模式协战区」那样的预览（头像 + 名字/元素 + 武器图标 + 名字/类型），
 * 点击任意一侧才弹出选择器（卡片网格，与额外精通/武器选择的弹窗同一套交互）。
 * 未选择时预览保持简洁模式的空位样式（虚线框 + 「—」），所以不选也像在看预览。
 *
 * 「协战构筑」是可选的服务器构筑关联：写入 charSettings.teamNBuild（"-" 表示未关联），
 * 简洁模式点击该协战角色或武器即可弹窗查看其魔之楔。
 */

/** 协战下拉选项（角色按元素分组 / 武器按类型分组后由父级传入） */
interface TeamSelectOption {
    value: number | "-"
    label: string
    /** 角色元素（按元素分组时用于分组标题） */
    elm?: string
    /** 武器类型（按类型分组时用于分组标题） */
    type?: string
    icon: string
}

/** 可选的协战构筑（服务器分享构筑的精简信息） */
interface BuildChoice {
    id: string
    title: string
    /** 构筑作者名（列出全部公开构筑时用于区分同名标题） */
    author: string
}

/** 协战槽位序号（1/2，与 charSettings 的 teamN 字段一一对应） */
type TeamSlot = 1 | 2

/** 挑选器类型：队友角色 / 队友武器 / 协战构筑 */
type PickerKind = "char" | "weapon" | "build"

/** 空值占位：与 teamN / teamNWeapon 一致，用 "-" 表示未选择（SelectItem 等控件也不接受空串） */
const EMPTY_VALUE = "-"

const props = defineProps<{
    /** 当前角色的本地配置：本组件直接读写其中的 teamN / teamNWeapon / teamNBuild 字段 */
    charSettings: CharSettings
    /** 1 号槽位的队友候选（已按元素分组，父级已排除主角与另一槽位） */
    team1Options: Record<string, TeamSelectOption[]>
    /** 2 号槽位的队友候选（已按元素分组） */
    team2Options: Record<string, TeamSelectOption[]>
    /** 队友武器候选（已按类型分组） */
    weaponOptions: Record<string, TeamSelectOption[]>
}>()

const emit = defineEmits<{
    /** 队友或队友武器变更（新值, 旧值），父级据此增删助战 BUFF */
    teamChange: [newValue: number | "-", oldValue: number | "-"]
}>()

const { t } = useTranslation()

/** 两个协战槽位（模板按槽位复用同一套结构） */
const SLOTS: readonly TeamSlot[] = [1, 2]

/** 当前打开的挑选器（null 表示未打开） */
const picker = ref<{ kind: PickerKind; slot: TeamSlot } | null>(null)

/** 每个协战角色可选的构筑列表（按角色 id 缓存，仅缓存成功结果） */
const buildOptions = ref<Record<number, BuildChoice[]>>({})
/** 正在拉取构筑列表的角色 id，避免重复请求 */
const loadingChars = ref<Record<number, true>>({})

/**
 * 读取槽位的队友角色 id。
 * @param slot 槽位序号
 * @returns 队友角色 id（"-" 表示未选择）
 */
function teamChar(slot: TeamSlot) {
    return slot === 1 ? props.charSettings.team1 : props.charSettings.team2
}

/**
 * 读取槽位的队友武器 id。
 * @param slot 槽位序号
 * @returns 队友武器 id（"-" 表示未选择）
 */
function teamWeapon(slot: TeamSlot) {
    return slot === 1 ? props.charSettings.team1Weapon : props.charSettings.team2Weapon
}

/**
 * 读取槽位关联的协战构筑 id。
 * @param slot 槽位序号
 * @returns 构筑 id（"-" 表示未关联）
 */
function teamBuild(slot: TeamSlot) {
    return (slot === 1 ? props.charSettings.team1Build : props.charSettings.team2Build) ?? EMPTY_VALUE
}

/**
 * 写入协战角色：切换队友时清空原先关联的构筑 id，避免留下不属于该队友的脏引用。
 * @param slot 槽位序号
 * @param value 队友角色 id
 * @returns 是否真的发生了变更
 */
function setTeamChar(slot: TeamSlot, value: number | "-") {
    if (slot === 1) {
        if (props.charSettings.team1 === value) return false
        props.charSettings.team1 = value
        props.charSettings.team1Build = EMPTY_VALUE
    } else {
        if (props.charSettings.team2 === value) return false
        props.charSettings.team2 = value
        props.charSettings.team2Build = EMPTY_VALUE
    }
    return true
}

/**
 * 写入队友武器 id。
 * @param slot 槽位序号
 * @param value 队友武器 id
 * @returns 是否真的发生了变更
 */
function setTeamWeapon(slot: TeamSlot, value: number | "-") {
    if (slot === 1) {
        if (props.charSettings.team1Weapon === value) return false
        props.charSettings.team1Weapon = value
    } else {
        if (props.charSettings.team2Weapon === value) return false
        props.charSettings.team2Weapon = value
    }
    return true
}

/**
 * 写入协战构筑 id。
 * @param slot 槽位序号
 * @param value 服务器构筑 id（"-" 表示取消关联）
 */
function setTeamBuild(slot: TeamSlot, value: string) {
    if (slot === 1) props.charSettings.team1Build = value
    else props.charSettings.team2Build = value
}

/**
 * 读取槽位的队友候选项（按元素分组）。
 * @param slot 槽位序号
 * @returns 分组后的队友候选项
 */
function teamCharOptions(slot: TeamSlot) {
    return slot === 1 ? props.team1Options : props.team2Options
}

/**
 * 读取协战队友的展示信息（头像 / 名称 / 元素）。
 * 未选择（"-"）或静态表中查不到时返回空信息，预览走空位样式。
 * @param value 队友角色 id
 * @returns 展示信息
 */
function charInfo(value: number | "-") {
    const char = typeof value === "number" ? charMap.get(value) : undefined
    return { name: char?.名称 ?? "", element: char?.属性 ?? "", icon: char ? LeveledChar.url(char.icon) : "" }
}

/**
 * 读取协战武器的展示信息（图标 / 名称 / 类型）。
 * @param value 队友武器 id
 * @returns 展示信息
 */
function weaponInfo(value: number | "-") {
    const weapon = typeof value === "number" ? weaponMap.get(value) : undefined
    return { name: weapon?.名称 ?? "", type: weapon?.类型[0] ?? "", icon: weapon ? LeveledWeapon.url(weapon.icon) : "" }
}

/**
 * 拉取某个协战角色的公开构筑列表（懒加载 + 缓存）。
 * 队友未选择（"-"）时直接返回；请求失败不写缓存，下次打开挑选器会自然重试。
 * @param charId 协战角色 id
 */
async function loadBuildOptions(charId: number | "-") {
    if (typeof charId !== "number") return
    if (buildOptions.value[charId] || loadingChars.value[charId]) return
    loadingChars.value = { ...loadingChars.value, [charId]: true }
    try {
        const result = await buildsQuery({ charId, limit: 200, offset: 0 }, { requestPolicy: "network-only" })
        buildOptions.value = {
            ...buildOptions.value,
            [charId]: (result || []).map(build => ({ id: build.id, title: build.title, author: build.user?.name ?? "" })),
        }
    } catch (error) {
        // 服务器不可用时保持空列表：构筑关联是可选增强，不应打断构筑编辑
        console.error("加载协战角色构筑列表失败", error)
    } finally {
        const next = { ...loadingChars.value }
        delete next[charId]
        loadingChars.value = next
    }
}

/**
 * 计算某个槽位已关联构筑的展示标题。
 * 未关联时返回空串；列表里查不到（被删除/转为私有）时退回显示 id，避免显示成「未关联」。
 * @param slot 槽位序号
 * @returns 构筑标题
 */
function buildTitle(slot: TeamSlot) {
    const buildId = teamBuild(slot)
    if (buildId === EMPTY_VALUE) return ""
    const charId = teamChar(slot)
    const options = typeof charId === "number" ? buildOptions.value[charId] ?? [] : []
    return options.find(option => option.id === buildId)?.title ?? buildId
}

/**
 * 打开挑选器；构筑挑选器需要先有队友角色，并会顺带拉取该角色的构筑列表。
 * @param kind 挑选器类型
 * @param slot 槽位序号
 */
function openPicker(kind: PickerKind, slot: TeamSlot) {
    picker.value = { kind, slot }
    if (kind === "build") void loadBuildOptions(teamChar(slot))
}

/** 关闭挑选器 */
function closePicker() {
    picker.value = null
}

/** 挑选器标题（按当前打开的类型切换） */
const pickerTitle = computed(() => {
    switch (picker.value?.kind) {
        case "char":
            return t("char-build.team_char_pick")
        case "weapon":
            return t("char-build.team_weapon_pick")
        case "build":
            return t("char-build.team_build_pick")
        default:
            return ""
    }
})

/** 挑选器说明文案 */
const pickerHint = computed(() => (picker.value?.kind === "build" ? t("char-build.team_build_hint") : t("char-build.team_pick_hint")))

/** 角色/武器挑选器的分组候选项（构筑挑选器走独立列表，不使用该分组） */
const pickerGroups = computed<{ key: string; label: string; options: TeamSelectOption[] }[]>(() => {
    const current = picker.value
    if (!current || current.kind === "build") return []
    const grouped = current.kind === "char" ? teamCharOptions(current.slot) : props.weaponOptions
    return Object.entries(grouped).map(([key, options]) => ({
        key,
        // 队友/武器的「无」选项分组名为空，此时不展示分组标题（与旧下拉的分组标题规则一致）
        label: key ? t(current.kind === "char" ? `${key}属性` : key) : "",
        options,
    }))
})

/** 构筑挑选器的候选项（含当前已关联但不在公开列表里的兜底项） */
const pickerBuilds = computed<BuildChoice[]>(() => {
    const current = picker.value
    if (!current || current.kind !== "build") return []
    const charId = teamChar(current.slot)
    if (typeof charId !== "number") return []
    const options = buildOptions.value[charId] ?? []
    const buildId = teamBuild(current.slot)
    if (buildId === EMPTY_VALUE || options.some(option => option.id === buildId)) return options
    return [{ id: buildId, title: buildId, author: "" }, ...options]
})

/** 构筑挑选器是否正在加载 */
const pickerBuildsLoading = computed(() => {
    const charId = picker.value && picker.value.kind === "build" ? teamChar(picker.value.slot) : EMPTY_VALUE
    return typeof charId === "number" && !!loadingChars.value[charId]
})

/**
 * 判断角色/武器候选项是否为该槽位当前选中项（用于卡片高亮）。
 * @param option 候选项
 * @returns 是否为当前选中项
 */
function isPicked(option: TeamSelectOption) {
    const current = picker.value
    if (!current) return false
    return current.kind === "char" ? teamChar(current.slot) === option.value : teamWeapon(current.slot) === option.value
}

/**
 * 判断构筑候选项是否为该槽位当前已关联的构筑（用于列表高亮）。
 * @param buildId 服务器构筑 id（"-" 表示不关联）
 * @returns 是否为当前已关联项
 */
function isBuildPicked(buildId: string) {
    const current = picker.value
    if (!current) return false
    return teamBuild(current.slot) === buildId
}

/**
 * 提交角色/武器选择：先取旧值（用于父级增删助战 BUFF），写入后若确有变更再通知父级。
 * @param value 选中的角色或武器 id
 */
function commitTeamOption(value: number | "-") {
    const current = picker.value
    if (!current) return
    const oldValue = current.kind === "char" ? teamChar(current.slot) : teamWeapon(current.slot)
    const changed = current.kind === "char" ? setTeamChar(current.slot, value) : setTeamWeapon(current.slot, value)
    closePicker()
    if (changed) emit("teamChange", value, oldValue)
}

/**
 * 提交协战构筑关联（"-" 表示取消关联）。
 * @param buildId 服务器构筑 id
 */
function commitBuild(buildId: string) {
    const current = picker.value
    if (!current) return
    setTeamBuild(current.slot, buildId)
    closePicker()
}

// 队友一经选定就预取其构筑列表，让预览里的构筑标题可以立即显示
watch(
    () => [props.charSettings.team1, props.charSettings.team2] as const,
    ([team1, team2]) => {
        void loadBuildOptions(team1)
        void loadBuildOptions(team2)
    },
    { immediate: true }
)
</script>

<template>
    <div class="flex flex-col gap-2.5 rounded-xs border border-base-content/10 bg-base-200/40 p-3">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="text-[13px] font-semibold text-base-content/80">{{ $t("char-build.team") }}</span>
            <span class="text-xs text-base-content/50">{{ $t("char-build.team_pick_hint") }}</span>
        </div>

        <div v-for="slot in SLOTS" :key="slot" class="flex flex-col gap-1.5">
            <!-- 预览行：与简洁模式协战区同构；未选择时保持空位虚线框 + 「—」 -->
            <div class="grid grid-cols-2 gap-1.5">
                <button type="button" class="team-cell" :title="$t('char-build.team_char_pick')" @click="openPicker('char', slot)">
                    <span class="team-frame" :data-empty="charInfo(teamChar(slot)).name ? '' : '1'">
                        <img v-if="charInfo(teamChar(slot)).icon" :src="charInfo(teamChar(slot)).icon" :alt="$t(charInfo(teamChar(slot)).name)" />
                        <Icon v-else icon="ri:user-line" class="team-placeholder" />
                    </span>
                    <span class="team-text">
                        <span class="team-name">{{ charInfo(teamChar(slot)).name ? $t(charInfo(teamChar(slot)).name) : "—" }}</span>
                        <span v-if="charInfo(teamChar(slot)).element" class="team-sub">
                            {{ $t(`${charInfo(teamChar(slot)).element}属性`) }}
                        </span>
                    </span>
                    <Icon icon="ri:exchange-line" class="team-swap" />
                </button>

                <button type="button" class="team-cell" :title="$t('char-build.team_weapon_pick')" @click="openPicker('weapon', slot)">
                    <span class="team-frame team-frame--weapon" :data-empty="weaponInfo(teamWeapon(slot)).name ? '' : '1'">
                        <img
                            v-if="weaponInfo(teamWeapon(slot)).icon"
                            :src="weaponInfo(teamWeapon(slot)).icon"
                            :alt="$t(weaponInfo(teamWeapon(slot)).name)"
                        />
                        <Icon v-else icon="ri:sword-line" class="team-placeholder" />
                    </span>
                    <span class="team-text">
                        <span class="team-name">{{ weaponInfo(teamWeapon(slot)).name ? $t(weaponInfo(teamWeapon(slot)).name) : "—" }}</span>
                        <span v-if="weaponInfo(teamWeapon(slot)).type" class="team-sub">
                            {{ $t(weaponInfo(teamWeapon(slot)).type) }}
                        </span>
                    </span>
                    <Icon icon="ri:exchange-line" class="team-swap" />
                </button>
            </div>

            <!-- 协战构筑：可选的服务器构筑关联，简洁模式据此弹窗展示该队友的魔之楔 -->
            <button
                type="button"
                class="team-build"
                :disabled="typeof teamChar(slot) !== 'number'"
                :title="$t('char-build.team_build_hint')"
                @click="openPicker('build', slot)"
            >
                <Icon icon="ri:external-link-line" class="size-3.5 shrink-0" />
                <span class="truncate">{{ buildTitle(slot) || $t("char-build.team_build_none") }}</span>
                <Icon icon="ri:arrow-right-line" class="ml-auto size-4 shrink-0 opacity-60" />
            </button>
        </div>

        <!-- 选择器：卡片网格，选中即写入并关闭（与额外精通/武器选择弹窗同一套交互） -->
        <!-- teleport 到 body：面板外壳带 backdrop-blur，会给 fixed 弹窗造出一个错误的包含块 -->
        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': !!picker }">
                <div class="modal-box bg-base-300 w-11/12 max-w-3xl">
                    <button type="button" class="btn btn-circle btn-ghost btn-sm absolute top-3 right-3" @click="closePicker">
                        <Icon icon="ri:close-line" class="size-4" />
                    </button>
                    <h3 class="mb-1 text-lg font-bold">{{ pickerTitle }}</h3>
                    <p class="mb-4 text-xs text-base-content/60">{{ pickerHint }}</p>

                    <!-- 协战构筑：列表选择 -->
                    <template v-if="picker?.kind === 'build'">
                        <p v-if="pickerBuildsLoading" class="py-4 text-sm text-base-content/60">{{ $t("char-build.team_build_loading") }}</p>
                        <div v-else class="flex flex-col gap-1.5">
                            <button
                                type="button"
                                class="pick-row"
                                :class="{ 'is-on': isBuildPicked(EMPTY_VALUE) }"
                                @click="commitBuild(EMPTY_VALUE)"
                            >
                                <span class="min-w-0 truncate">{{ $t("char-build.team_build_none") }}</span>
                            </button>
                            <button
                                v-for="build in pickerBuilds"
                                :key="build.id"
                                type="button"
                                class="pick-row"
                                :class="{ 'is-on': isBuildPicked(build.id) }"
                                @click="commitBuild(build.id)"
                            >
                                <span class="min-w-0 truncate">{{ build.title }}</span>
                                <span v-if="build.author" class="ml-auto shrink-0 text-xs text-base-content/50">{{ build.author }}</span>
                            </button>
                            <p v-if="!pickerBuilds.length" class="py-4 text-center text-sm text-base-content/45">
                                {{ $t("char-build.team_build_empty_list") }}
                            </p>
                        </div>
                    </template>

                    <!-- 队友角色 / 队友武器：按元素或类型分组的卡片网格 -->
                    <template v-else>
                        <div v-for="group in pickerGroups" :key="group.key" class="mb-3 last:mb-0">
                            <div v-if="group.label" class="mb-2 text-xs font-semibold text-primary">{{ group.label }}</div>
                            <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
                                <button
                                    v-for="option in group.options"
                                    :key="String(option.value)"
                                    type="button"
                                    class="pick-card"
                                    :class="{ 'is-on': isPicked(option) }"
                                    @click="commitTeamOption(option.value)"
                                >
                                    <span class="pick-frame" :data-empty="option.value === EMPTY_VALUE ? '1' : ''">
                                        <img v-if="option.value !== EMPTY_VALUE && option.icon" :src="option.icon" alt="" />
                                        <Icon
                                            v-else
                                            :icon="picker?.kind === 'char' ? 'ri:user-line' : 'ri:sword-line'"
                                            class="size-5 opacity-45"
                                        />
                                    </span>
                                    <span class="pick-name">{{ $t(option.label) }}</span>
                                </button>
                            </div>
                        </div>
                    </template>
                </div>
                <div class="modal-backdrop" @click="closePicker" />
            </dialog>
        </Teleport>
    </div>
</template>

<style scoped>
/* 预览卡片：与简洁模式协战区的「图标 + 名/元素」排版一致，仅换成本地主题色 */
.team-cell {
    display: grid;
    align-items: center;
    gap: 6px;
    grid-template-columns: 28px minmax(0, 1fr) 14px;
    padding: 3px 5px;
    border: 1px solid transparent;
    border-radius: 2px;
    text-align: left;
    transition:
        border-color 0.15s ease,
        background-color 0.15s ease;
}

.team-cell:hover,
.team-cell:focus-visible {
    border-color: color-mix(in oklab, var(--color-primary) 55%, transparent);
    background: color-mix(in oklab, var(--color-primary) 8%, transparent);
}

/* 交换图标：平时很淡，hover 时才明显，避免抢预览的视觉 */
.team-swap {
    width: 14px;
    height: 14px;
    opacity: 0.25;
    transition: opacity 0.15s ease;
}

.team-cell:hover .team-swap,
.team-cell:focus-visible .team-swap {
    opacity: 0.85;
    color: var(--color-primary);
}

.team-frame {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    overflow: hidden;
    border: 1px solid var(--color-base-content);
    border-color: color-mix(in oklab, var(--color-base-content) 28%, transparent);
    background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
}

/* 队友武器框沿用简洁模式的虚线样式，与角色框区分 */
.team-frame--weapon {
    border-style: dashed;
}

.team-frame[data-empty="1"] {
    border-style: dashed;
    opacity: 0.6;
}

.team-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.team-placeholder {
    width: 14px;
    height: 14px;
    opacity: 0.45;
}

.team-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
}

.team-name {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.team-sub {
    overflow: hidden;
    font-size: 10px;
    color: color-mix(in oklab, var(--color-base-content) 55%, transparent);
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* 协战构筑：一条细长条，未关联时显示为虚线态 */
.team-build {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 1px dashed color-mix(in oklab, var(--color-base-content) 20%, transparent);
    border-radius: 2px;
    font-size: 11px;
    color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
    text-align: left;
    transition:
        border-color 0.15s ease,
        color 0.15s ease;
}

.team-build:not(:disabled):hover,
.team-build:not(:disabled):focus-visible {
    border-color: color-mix(in oklab, var(--color-primary) 55%, transparent);
    color: var(--color-primary);
}

.team-build:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

/* 构筑挑选：整行列表，比卡片网格更适合长标题 */
.pick-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 16%, transparent);
    border-radius: 2px;
    font-size: 13px;
    text-align: left;
    transition:
        border-color 0.15s ease,
        background-color 0.15s ease;
}

.pick-row:hover {
    border-color: color-mix(in oklab, var(--color-primary) 60%, transparent);
}

.pick-row.is-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
}

/* 角色/武器挑选：与额外精通弹窗一致的卡片网格 */
.pick-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 6px;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 20%, transparent);
    border-radius: 2px;
    color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
    transition:
        border-color 0.15s ease,
        color 0.15s ease,
        transform 0.1s ease;
}

.pick-card:hover {
    border-color: color-mix(in oklab, var(--color-primary) 60%, transparent);
    color: var(--color-primary);
}

.pick-card:active {
    transform: scale(0.97);
}

.pick-card.is-on {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
}

.pick-frame {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    overflow: hidden;
    border: 1px solid color-mix(in oklab, var(--color-base-content) 22%, transparent);
    background: color-mix(in oklab, var(--color-base-content) 6%, transparent);
}

.pick-frame[data-empty="1"] {
    border-style: dashed;
    opacity: 0.6;
}

.pick-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.pick-name {
    max-width: 100%;
    overflow: hidden;
    font-size: 11px;
    white-space: nowrap;
    text-overflow: ellipsis;
}
</style>
