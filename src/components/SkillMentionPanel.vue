<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, nextTick, ref, watch } from "vue"
import { ensureAgentSkillsReady, getAgentSkillRegistry } from "@/api/agent/skills/registry"
import type { AgentSkillMeta } from "@/api/agentSkill"
import { scopedI18nKey } from "@/utils/agent-chat"
import { filterSkillMentions } from "@/utils/skill-mention"

/**
 * 技能显式调用面板（`$` 触发）。
 *
 * 对齐 ZCode 的 `$` 技能面板：单分组、按名称折叠、键盘上下选择 + Enter 采用、Esc 关闭。
 * 选中后由宿主把 canonical markdown `[$名称](/名称/SKILL.md)` 写回输入框，
 * 面板自身不改输入框内容。
 */
const props = withDefaults(
    defineProps<{
        /** 是否展示 */
        open: boolean
        /** `$` 之后的查询串 */
        query: string
        /** 文案键前缀（默认走资料库的一套） */
        i18nPrefix?: string
    }>(),
    {
        i18nPrefix: "dbAgent.ui",
    }
)

const emit = defineEmits<{
    /** 采用某个技能：宿主负责替换输入框里的提及区间 */
    select: [name: string]
    /** 请求关闭面板（Esc / 失焦） */
    close: []
}>()

const { t } = useTranslation()

/**
 * 拼出当前 Agent 的文案键；本命名空间没有该键时回退到通用命名空间（见 scopedI18nKey）。
 * @param key 命名空间内的键名
 * @returns 可交给翻译函数解析的完整文案键
 */
function label(key: string): string {
    return scopedI18nKey(props.i18nPrefix, key, t)
}

/** 面板最多展示的候选条数 */
const MAX_ROWS = 8

/** 技能清单快照（面板打开时从注册表读取） */
const skills = ref<readonly AgentSkillMeta[]>([])

/** 高亮项下标 */
const activeIndex = ref(0)

/** 过滤排序后的候选（截断到展示上限） */
const candidates = computed(() => filterSkillMentions(skills.value, props.query).slice(0, MAX_ROWS))

/** 面板滚动容器 */
const listRef = ref<HTMLElement | null>(null)

watch(
    () => props.open,
    isOpen => {
        if (!isOpen) {
            return
        }

        // 注册表清单平时只在「发送前」刷新；首次按 `$` 就打开面板时还没人拉过，
        // 这里补一次（TTL 内直接返回），否则第一次打开会看到空面板。
        skills.value = getAgentSkillRegistry().getSkills()
        activeIndex.value = 0
        void ensureAgentSkillsReady().then(() => {
            skills.value = getAgentSkillRegistry().getSkills()
        })
    }
)

watch(candidates, () => {
    if (activeIndex.value >= candidates.value.length) {
        activeIndex.value = 0
    }
})

watch(activeIndex, () => {
    void nextTick(() => {
        listRef.value?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" })
    })
})

/** 技能条目的悬浮说明：描述 + 适用时机（缺一不补空行） */
function describe(skill: AgentSkillMeta): string {
    return [skill.description, skill.whenToUse].filter(Boolean).join(" · ")
}

/**
 * 键盘导航：上下移动、Enter 采用、Esc 关闭。
 * @param event 键盘事件
 * @returns 是否消费了该按键（消费时宿主不应再走提交 / 换行逻辑）
 */
function handleKeydown(event: KeyboardEvent): boolean {
    if (!props.open) {
        return false
    }

    if (event.key === "ArrowDown") {
        activeIndex.value = candidates.value.length ? (activeIndex.value + 1) % candidates.value.length : 0
        return true
    }

    if (event.key === "ArrowUp") {
        activeIndex.value = candidates.value.length ? (activeIndex.value - 1 + candidates.value.length) % candidates.value.length : 0
        return true
    }

    if (event.key === "Enter") {
        const active = candidates.value[activeIndex.value]

        if (active) {
            emit("select", active.name)
        }

        return true
    }

    if (event.key === "Escape") {
        emit("close")
        return true
    }

    return false
}

defineExpose({ handleKeydown })
</script>

<template>
    <div
        v-if="props.open"
        class="absolute bottom-full left-0 z-50 mb-2 w-full rounded-xs border border-base-content/15 bg-base-100/85 shadow-lg backdrop-blur-md"
    >
        <!-- 头部：单分组标题 + 触发符提示（等宽只用于纯 ASCII 的 `$`） -->
        <div class="flex items-center justify-between gap-3 border-b border-base-content/10 px-3 py-2">
            <p class="min-w-0 truncate text-[11px] tracking-wide text-base-content/55">{{ $t(label("skillPanel.title")) }}</p>
            <span class="shrink-0 font-mono text-[10px] text-base-content/40">$</span>
        </div>

        <!-- 候选为空：说明当前没有可用技能，或查询词没命中 -->
        <p v-if="!candidates.length" class="px-3 py-2.5 text-xs text-base-content/45">
            {{ $t(label(skills.length ? "skillPanel.empty" : "skillPanel.noSkills")) }}
        </p>

        <ul v-else ref="listRef" class="max-h-64 overflow-y-auto py-1">
            <li v-for="(skill, index) in candidates" :key="skill.name">
                <button
                    type="button"
                    :data-active="index === activeIndex"
                    class="flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors duration-150"
                    :class="index === activeIndex ? 'bg-base-content/8' : 'hover:bg-base-content/5'"
                    @mouseenter="activeIndex = index"
                    @mousedown.prevent
                    @click="emit('select', skill.name)"
                >
                    <Icon icon="ri:bard-line" class="h-3.5 w-3.5 shrink-0" :class="index === activeIndex ? 'text-primary' : 'text-base-content/40'" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate font-mono text-xs" :class="index === activeIndex ? 'text-primary' : 'text-base-content/85'">
                            ${{ skill.name }}
                        </span>
                        <span v-if="describe(skill)" class="mt-0.5 block truncate text-[11px] text-base-content/45">{{ describe(skill) }}</span>
                    </span>
                </button>
            </li>
        </ul>
    </div>
</template>
