<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { buildQuery } from "@/api/graphql"
import { typedQuery } from "@/api/query"
import { useGameText } from "@/composables/useGameText"
import {
    type CharSettings,
    type CharSettingsInput,
    charMap,
    getModVariantSlots,
    MOD_SLOT_TYPES,
    normalizeCharSettings,
    weaponMap,
} from "@/data"
import type { AssistSide } from "@/data/teamResolver"
import { pasteText } from "@/util"
import { convertTopSettingsToAssist } from "@/utils/char-assist"
import { getTranscendSideLabelKey } from "@/utils/transcend-build"

/**
 * 内嵌协战构筑导入弹窗：把顶层角色构筑（本地项目 / 分享构筑 / JSON）导入为内嵌 setting。
 * 三个来源都是顶层 CharSettings 口径，结构差异由 `convertTopSettingsToAssist` 统一处理；
 * 弹窗只负责选出源构筑并预览转换结果，写回由父级完成。
 */

/** 分享列表条目（轻量：不取 charSettings，选中后再按需拉详情） */
interface ShareChoiceSource {
    id: string
    title: string
    desc?: string
    user?: { id: string; name?: string }
}

/** 与 TeamEditor 同形的轻量列表查询：单个协战位，无需 combinedQuery 合并 */
const assistImportBuildsQuery = typedQuery(
    /* GraphQL */ `
        query ($charId: Int, $limit: Int, $offset: Int) {
            builds(charId: $charId, limit: $limit, offset: $offset) {
                id
                title
                desc
                user {
                    id
                    name
                }
            }
        }
    ` as const
)<ShareChoiceSource[], { charId?: number; limit?: number; offset?: number }>()

/** 本地候选：当前构筑 + 该角色的已存项目 */
interface LocalChoice {
    key: string
    label: string
    settings: CharSettings
}

/** 分享候选：当前关联的构筑置顶并打标 */
interface ShareChoice {
    id: string
    title: string
    author: string
    desc: string
    linked?: boolean
}

const props = defineProps<{
    open: boolean
    side: AssistSide
    /** 协战角色 id（三个来源都按该角色过滤） */
    charId: number
    /** 当前单武器 id（0 表示未配置，导入时按来源推荐填入） */
    weaponId: number
    /** 当前关联的服务器构筑 id（"-" 表示未关联） */
    linkedBuildId?: string
}>()

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
    (event: "import", payload: { source: CharSettings; label: string }): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const importTabs = [
    { key: "local", labelKey: "char-build.assist_import_tab_local" },
    { key: "share", labelKey: "char-build.assist_import_tab_share" },
    { key: "json", labelKey: "char-build.assist_import_tab_json" },
] as const
const tab = ref<(typeof importTabs)[number]["key"]>("local")

const localChoices = ref<LocalChoice[]>([])
const localSelected = ref("")

const shareChoices = ref<ShareChoice[]>([])
const shareLoading = ref(false)
const shareLoaded = ref(false)
const shareError = ref("")
const shareSelected = ref("")
const shareSettingsCache = ref<Record<string, CharSettings>>({})
const shareDetailLoading = ref("")
const shareDetailError = ref("")

const jsonText = ref("")
const pasteNotice = ref("")

const dialogTitle = computed(() => {
    const char = charMap.get(props.charId)
    const parts = [t(getTranscendSideLabelKey(props.side)), char ? gt(char.名称) : "", t("char-build.assist_import")]
    return parts.filter(Boolean).join(" · ")
})

/** 当前激活变体的已填 MOD 槽数（预览口径：只看实际生效的那份配置） */
function countActiveMods(settings: CharSettings): number {
    return MOD_SLOT_TYPES.reduce((sum, type) => sum + getModVariantSlots(settings, type).filter(slot => slot !== null).length, 0)
}

/** 候选行的计数文案 */
function countsText(settings: CharSettings): string {
    return t("char-build.assist_import_counts", { mods: countActiveMods(settings), buffs: settings.buffs.length })
}

/** 候选行的技能文案 */
function skillText(settings: CharSettings): string {
    return [settings.baseName, settings.targetFunction].filter(Boolean).join(" - ")
}

/** 候选行的互斥状态样式（与 TeamEditor 同口径：状态色互斥，不靠覆盖） */
function pickRowClass(on: boolean): string {
    return on ? "border-primary bg-primary/10" : "border-base-content/16 hover:border-primary/60"
}

/**
 * 读取该角色的本地构筑：当前工作区 + 已存项目，损坏的存档跳过。
 */
function loadLocalChoices(): void {
    const choices: LocalChoice[] = []
    try {
        const raw = localStorage.getItem(`build.${props.charId}`)
        const parsed: unknown = raw ? JSON.parse(raw) : null
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            choices.push({ key: "current", label: t("char-build.assist_import_current"), settings: normalizeCharSettings(parsed) })
        }
    } catch {
        // 当前构筑损坏时只跳过，不打断项目列表
    }
    try {
        const raw = localStorage.getItem(`project.${props.charId}`)
        const parsed = raw ? (JSON.parse(raw) as { projects?: { name?: unknown; charSettings?: unknown }[] }) : null
        const projects = Array.isArray(parsed?.projects) ? parsed.projects : []
        for (const project of projects) {
            const settings = project?.charSettings
            if (typeof project?.name !== "string" || !settings || typeof settings !== "object" || Array.isArray(settings)) continue
            choices.push({ key: `project:${project.name}`, label: project.name, settings: normalizeCharSettings(settings) })
        }
    } catch {
        // 项目存档整体损坏时只保留当前构筑
    }
    localChoices.value = choices
    localSelected.value = choices[0]?.key ?? ""
}

/**
 * 拉取该角色的分享列表（懒加载，打开期间只拉一次）；当前关联的构筑置顶打标。
 */
async function loadShareChoices(): Promise<void> {
    if (shareLoading.value || shareLoaded.value) return
    shareLoading.value = true
    shareError.value = ""
    try {
        const list = await assistImportBuildsQuery({ charId: props.charId, limit: 100, offset: 0 }, { requestPolicy: "network-only" })
        const choices: ShareChoice[] = (list ?? []).map(build => ({
            id: build.id,
            title: build.title,
            author: build.user?.name ?? "",
            desc: build.desc ?? "",
        }))
        const linkedId = (props.linkedBuildId ?? "").trim()
        if (linkedId && linkedId !== "-") {
            const existing = choices.find(choice => choice.id === linkedId)
            if (existing) {
                existing.linked = true
            } else {
                try {
                    const linked = await buildQuery({ id: linkedId }, { requestPolicy: "network-only" })
                    if (linked && linked.charId === props.charId) {
                        choices.unshift({ id: linked.id, title: linked.title, author: linked.user?.name ?? "", desc: linked.desc ?? "", linked: true })
                    }
                } catch {
                    // 关联构筑已删除或转私有：不置顶，用户仍可从列表里选
                }
            }
        }
        shareChoices.value = choices
        const pinned = choices.find(choice => choice.linked) ?? choices[0]
        if (pinned) void selectShare(pinned.id)
    } catch {
        shareError.value = t("char-build.load_build_failed")
    } finally {
        shareLoading.value = false
        shareLoaded.value = true
    }
}

/**
 * 选中分享构筑并拉取其完整配置（带缓存，供预览与导入共用）。
 * @param id 服务器构筑 id
 */
async function selectShare(id: string): Promise<void> {
    shareSelected.value = id
    if (shareSettingsCache.value[id] || shareDetailLoading.value === id) return
    shareDetailLoading.value = id
    shareDetailError.value = ""
    try {
        const build = await buildQuery({ id }, { requestPolicy: "network-only" })
        const raw: unknown = typeof build?.charSettings === "string" ? JSON.parse(build.charSettings) : build?.charSettings
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("empty")
        shareSettingsCache.value = { ...shareSettingsCache.value, [id]: normalizeCharSettings(raw as CharSettingsInput) }
    } catch {
        shareDetailError.value = t("char-build.load_build_failed")
    } finally {
        shareDetailLoading.value = ""
    }
}

/** JSON 解析结果：null 表示未输入 */
const jsonResult = computed<{ settings: CharSettings } | { error: string } | null>(() => {
    const text = jsonText.value.trim()
    if (!text) return null
    try {
        const parsed: unknown = JSON.parse(text)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: t("char-build.import_format_invalid") }
        return { settings: normalizeCharSettings(parsed as CharSettingsInput) }
    } catch {
        return { error: t("char-build.import_format_invalid") }
    }
})

/** 当前页签已选中的源构筑（分享页签需等详情拉取完成） */
const stagedSource = computed<CharSettings | null>(() => {
    if (tab.value === "local") return localChoices.value.find(choice => choice.key === localSelected.value)?.settings ?? null
    if (tab.value === "share") return shareSelected.value ? (shareSettingsCache.value[shareSelected.value] ?? null) : null
    const result = jsonResult.value
    return result && "settings" in result ? result.settings : null
})

/** 当前页签选中项的展示名（成功提示用） */
const stagedLabel = computed(() => {
    if (tab.value === "local") return localChoices.value.find(choice => choice.key === localSelected.value)?.label ?? ""
    if (tab.value === "share") return shareChoices.value.find(choice => choice.id === shareSelected.value)?.title ?? ""
    return t("char-build.assist_import_tab_json")
})

/** 选中分享构筑的详情（描述展示用） */
const shareSelectedDetail = computed(() => shareChoices.value.find(choice => choice.id === shareSelected.value) ?? null)

/** 转换预览：技能行 + 计数 + 武器填入提示 + 回退警告 */
const preview = computed(() => {
    const source = stagedSource.value
    if (!source) return null
    const result = convertTopSettingsToAssist(source, props.charId, props.weaponId)
    const weapon = result.weaponId > 0 ? weaponMap.get(result.weaponId) : undefined
    return {
        skillLine: skillText(source),
        counts: countsText(source),
        fillWeapon: props.weaponId <= 0 && result.weaponId > 0,
        fillWeaponName: weapon ? gt(weapon.名称) : `#${result.weaponId}`,
        missingWeapon: result.weaponId <= 0,
        baseNameFallback: result.baseNameFallback,
    }
})

const canConfirm = computed(() => !!stagedSource.value && !shareDetailLoading.value)

/** 从剪贴板粘贴 JSON 到文本框 */
async function pasteFromClipboard(): Promise<void> {
    pasteNotice.value = ""
    try {
        const text = (await pasteText()).trim()
        if (!text) {
            pasteNotice.value = t("char-build.clipboard_empty")
            return
        }
        jsonText.value = text
    } catch {
        pasteNotice.value = t("char-build.import_failed")
    }
}

/** 确认导入：把源构筑交给父级转换写回 */
function confirmImport(): void {
    const source = stagedSource.value
    if (!source || shareDetailLoading.value) return
    emit("import", { source, label: stagedLabel.value })
    emit("update:open", false)
}

function close(): void {
    emit("update:open", false)
}

watch(
    () => props.open,
    value => {
        if (!value) return
        tab.value = "local"
        jsonText.value = ""
        pasteNotice.value = ""
        shareChoices.value = []
        shareError.value = ""
        shareSelected.value = ""
        shareSettingsCache.value = {}
        shareDetailError.value = ""
        shareLoaded.value = false
        loadLocalChoices()
    },
    // 父级用 v-if 按需挂载时 open 已为 true：immediate 保证首挂即加载，不依赖后续切换
    { immediate: true }
)

watch(tab, value => {
    if (value === "share" && props.open) void loadShareChoices()
})
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }" data-assist-import-dialog>
            <div class="modal-box relative w-11/12 max-w-2xl bg-base-300">
                <SectionHeader kicker="IMPORT" :title="dialogTitle" no-animate compact>
                    <template #trailing>
                        <button type="button" class="btn btn-ghost btn-sm btn-square" data-assist-import-close @click="close">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>
                <p class="mb-3 text-xs leading-relaxed text-base-content/60">{{ $t("char-build.assist_import_hint") }}</p>

                <div class="tabs tabs-box bg-transparent" data-assist-import-tabs>
                    <button
                        v-for="item in importTabs"
                        :key="item.key"
                        type="button"
                        class="tab"
                        :class="{ 'tab-active': tab === item.key }"
                        :data-assist-import-tab="item.key"
                        @click="tab = item.key"
                    >
                        {{ $t(item.labelKey) }}
                    </button>
                </div>

                <template v-if="tab === 'local'">
                    <div v-if="localChoices.length" class="mt-3 flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto pr-1">
                        <button
                            v-for="choice in localChoices"
                            :key="choice.key"
                            type="button"
                            class="flex flex-col gap-0.5 rounded-xs border px-2.5 py-2 text-left transition-[border-color,background-color] duration-150 ease-[ease]"
                            :class="pickRowClass(localSelected === choice.key)"
                            :data-assist-import-choice="choice.key"
                            @click="localSelected = choice.key"
                        >
                            <span class="truncate text-[13px] font-semibold">{{ choice.label }}</span>
                            <span v-if="skillText(choice.settings)" class="truncate text-xs text-base-content/55">{{ skillText(choice.settings) }}</span>
                            <span class="text-[11px] text-base-content/45">{{ countsText(choice.settings) }}</span>
                        </button>
                    </div>
                    <p v-else class="py-4 text-center text-sm text-base-content/45">{{ $t("char-build.assist_import_empty_local") }}</p>
                </template>

                <template v-else-if="tab === 'share'">
                    <p v-if="shareLoading" class="py-4 text-sm text-base-content/60">{{ $t("char-build.team_build_loading") }}</p>
                    <p v-else-if="shareError" class="py-4 text-center text-sm text-error">{{ shareError }}</p>
                    <template v-else-if="shareChoices.length">
                        <div class="mt-3 flex max-h-[32vh] flex-col gap-1.5 overflow-y-auto pr-1">
                            <button
                                v-for="build in shareChoices"
                                :key="build.id"
                                type="button"
                                class="flex items-center gap-2 rounded-xs border px-2.5 py-2 text-left text-[13px] transition-[border-color,background-color] duration-150 ease-[ease]"
                                :class="pickRowClass(shareSelected === build.id)"
                                :data-assist-import-choice="build.id"
                                @click="selectShare(build.id)"
                            >
                                <span class="min-w-0 truncate">{{ build.title }}</span>
                                <span
                                    v-if="build.linked"
                                    class="shrink-0 rounded-xs border border-primary/40 px-1 text-[10px] leading-4 text-primary/85"
                                >
                                    {{ $t("char-build.assist_import_linked") }}
                                </span>
                                <span v-if="build.author" class="ml-auto shrink-0 text-xs text-base-content/50">{{ build.author }}</span>
                            </button>
                        </div>
                        <div
                            v-if="shareSelectedDetail"
                            class="mt-3 flex flex-col gap-1.5 rounded-xs border border-base-content/12 bg-base-content/5 px-2.5 py-2"
                        >
                            <div class="flex items-baseline gap-2">
                                <span class="shrink-0 text-xs font-semibold text-base-content/70">{{ $t("common.description") }}</span>
                                <span class="min-w-0 truncate text-[11px] text-base-content/50">{{ shareSelectedDetail.title }}</span>
                            </div>
                            <p class="max-h-24 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap wrap-break-word text-base-content/75">
                                {{ shareSelectedDetail.desc || $t("char-build.team_build_desc_empty") }}
                            </p>
                        </div>
                        <p v-if="shareDetailLoading" class="mt-2 text-xs text-base-content/60">{{ $t("char-build.team_build_loading") }}</p>
                        <p v-else-if="shareDetailError" class="mt-2 text-xs text-error">{{ shareDetailError }}</p>
                    </template>
                    <p v-else class="py-4 text-center text-sm text-base-content/45">{{ $t("char-build.assist_import_empty_share") }}</p>
                </template>

                <template v-else>
                    <div class="mt-3 flex flex-col gap-2">
                        <textarea
                            v-model="jsonText"
                            class="textarea textarea-bordered h-40 w-full font-mono text-xs leading-relaxed"
                            data-assist-import-json
                            :placeholder="$t('char-build.assist_import_json_placeholder')"
                        />
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" class="btn btn-sm btn-ghost" @click="pasteFromClipboard">
                                <Icon icon="ri:clipboard-line" class="size-4" />
                                {{ $t("char-build.assist_import_paste") }}
                            </button>
                            <span v-if="pasteNotice" class="text-xs text-base-content/55">{{ pasteNotice }}</span>
                        </div>
                        <p v-if="jsonResult && 'error' in jsonResult" class="text-xs text-error">{{ jsonResult.error }}</p>
                    </div>
                </template>

                <div v-if="preview" class="mt-3 flex flex-col gap-1 rounded-xs border border-base-content/12 bg-base-content/5 px-2.5 py-2 text-xs">
                    <p v-if="preview.skillLine" class="truncate text-base-content/75">{{ preview.skillLine }}</p>
                    <p class="text-base-content/55">{{ preview.counts }}</p>
                    <p v-if="preview.fillWeapon" class="text-base-content/55">
                        {{ $t("char-build.assist_import_weapon_filled", { name: preview.fillWeaponName }) }}
                    </p>
                    <p v-if="preview.missingWeapon" class="text-warning/90">{{ $t("char-build.assist_import_no_weapon") }}</p>
                    <p v-if="preview.baseNameFallback" class="text-warning/90">{{ $t("char-build.assist_import_basename_fallback") }}</p>
                </div>

                <div class="mt-3 flex items-center justify-end gap-2 border-t border-base-content/10 pt-3">
                    <button type="button" class="btn btn-sm btn-ghost" @click="close">{{ $t("common.close") }}</button>
                    <button type="button" class="btn btn-sm btn-primary" data-assist-import-confirm :disabled="!canConfirm" @click="confirmImport">
                        {{ $t("common.confirm") }}
                    </button>
                </div>
            </div>
            <div class="modal-backdrop" @click="close" />
        </dialog>
    </Teleport>
</template>
