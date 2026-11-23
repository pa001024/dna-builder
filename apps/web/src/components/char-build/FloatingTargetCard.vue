<script lang="ts">
import type { WindowRect } from "@/utils/floating-window"

/** 目标函数卡的停靠状态：左栏底部 / 浮动窗口 / 吸附为右侧第三栏 */
export type TargetDock = "left" | "floating" | "right"

/**
 * 触发浮动前的卡片矩形：停靠态实例在点击浮动按钮时写入，浮动态实例挂载时读取。
 * 两态是同一组件的不同挂载点，用模块级变量传递一次初始位置即可。
 */
let pendingFloatRect: WindowRect | null = null
</script>

<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import FloatingWindow from "@/components/FloatingWindow.vue"
import TranscendTargetPanel, { type TargetSideState } from "@/components/transcend-build/TranscendTargetPanel.vue"
import type { CharBuild, TranscendSlotGroup } from "@/data"
import type { CharTeamSnapshot } from "@/utils/char-team"
import { getSingleParticipatingSkillName } from "@/utils/transcend-build"

/**
 * 目标函数卡：左栏底部 / 浮动窗口 / 吸附右侧三态共用同一份内容。
 * 拖动、视口约束与层级全部由 `FloatingWindow` 提供；本组件只负责停靠状态与吸附判定。
 */
const props = defineProps<{
    /** 三个构筑位各自的目标面板状态 */
    sides: Record<TranscendSlotGroup, TargetSideState>
    /** 三个构筑位各自的构筑实例（未参与 / 构建失败时为空） */
    sideBuilds: Record<TranscendSlotGroup, CharBuild | null>
    /** 主控 + 两条协战的伤害快照 */
    snapshot: CharTeamSnapshot
    /** 当前停靠状态 */
    dock: TargetDock
    /** 面板初始化时的构筑位（之后由面板自己的页签决定，不双向联动） */
    initialSide?: TranscendSlotGroup
    /** 当前位目标表达式草稿非法：结果行基于旧提交值，不能继续显示以免被误读 */
    draftInvalid?: boolean
}>()

const emit = defineEmits<{
    (event: "update-loadout", side: TranscendSlotGroup, patch: Partial<TargetSideState>): void
    (event: "update:dock", dock: TargetDock): void
    (event: "recall"): void
}>()

const { t } = useTranslation()

/** 吸附为三栏需要 lg（1024px）以上宽度 */
const canDockRight = useMediaQuery("(min-width: 1024px)")

/** 停靠态卡片根节点：浮动前测量位置 */
const inlineRoot = ref<HTMLElement | null>(null)

/** 浮动态初始矩形：挂载时一次性读取停靠态记录的位置（`dock` 与它必须同一次点击内写好），读完即清空 */
const initialRect = props.dock === "floating" ? pendingFloatRect : null
if (props.dock === "floating") pendingFloatRect = null

/** 浮动窗实例：用控件实际生效矩形（宽度 / 位置可能被钳制）作为吸附基线，而不是未钳制的初始矩形 */
const floatingRef = ref<InstanceType<typeof FloatingWindow> | null>(null)

/** 目标面板实例：帮助入口放在卡片头部，借用面板自己的 ASTHelp 打开逻辑 */
const panelRef = ref<InstanceType<typeof TranscendTargetPanel> | null>(null)

/** 右缘距视口右侧小于该值时视为拖到右边缘（控件会把 left 钳到 vw - width，无法用中心点判断） */
const SNAP_RIGHT_MARGIN = 24

/** 是否已允许「进入右缘即吸附」：从 right 栏浮出时窗口初始就在吸附区内，必须先离开右缘再回拉 */
let snapArmed = true

/**
 * 右缘是否位于吸附区内。
 * @param rect 窗口矩形
 * @returns 是否处于右缘吸附区
 */
function isInSnapZone(rect: WindowRect): boolean {
    return typeof window !== "undefined" && rect.left + rect.width >= window.innerWidth - SNAP_RIGHT_MARGIN
}

// 控件完成首次布局后以实际生效矩形校准吸附基线，避免「从 right 栏浮出后小幅拖动被立即吸回」
onMounted(() => {
    if (props.dock !== "floating") return
    const applied = floatingRef.value?.getRect() ?? initialRect
    if (applied) snapArmed = !isInSnapZone(applied)
})

const title = computed(() => t("char-build.target_function"))

/** 结果行左标签：恰好一段参与时显示原始技能名，多段 / 0 段显示「合计」 */
const resultLabel = computed(() => getSingleParticipatingSkillName(props.snapshot) ?? t("transcend-build.mode_total"))

/** 合计不可用且存在表达式错误：错误行替代结果行（沿用原版目标卡结构） */
const resultError = computed(() => (props.snapshot.total === null ? props.snapshot.totalError : null))

/** 主控草稿非法且仍参与合计时抑制结果行（旧合计对应上一次提交值）；主控禁用后合计不含主控，可正常显示 */
const hideStaleResult = computed(() => Boolean(props.draftInvalid && props.sides.main.enabled))

/** damaging 段无法合计时的原因：有启用段说明是计算失败，否则是未参与 */
const unavailableKey = computed(() => {
    const hasEnabledSide = (["main", "assist1", "assist2"] as const).some(side => {
        const status = props.snapshot.sideStates[side]
        return status.charId > 0 && status.state !== "disabled"
    })
    return hasEnabledSide ? "transcend-build.state_failed" : "transcend-build.side_unavailable"
})

/**
 * 记录停靠态卡片当前矩形并切换停靠；进入浮动态时以该矩形作为窗口初始位置。
 * 卡片常位于左栏滚动区底部，直接沿用会让窗口挂出视口下沿，这里先按视口夹一次。
 * @param dock 目标停靠状态
 */
function requestDock(dock: TargetDock): void {
    if (dock === "floating" && inlineRoot.value) {
        const rect = inlineRoot.value.getBoundingClientRect()
        const maxTop = typeof window === "undefined" ? rect.top : Math.max(0, window.innerHeight - rect.height - 16)
        const maxLeft = typeof window === "undefined" ? rect.left : Math.max(0, window.innerWidth - rect.width - 16)
        pendingFloatRect = {
            left: Math.max(0, Math.min(rect.left, maxLeft)),
            top: Math.max(0, Math.min(rect.top, maxTop)),
            width: rect.width,
            height: rect.height,
        }
    }
    emit("update:dock", dock)
}

/**
 * 拖拽结束：右缘进入吸附区时吸附为右侧第三栏。
 * 控件只在位移超过 3px 时派发 `move-end`，单击 / 双击 header 不会走到这里。
 * 吸附为三栏需要 lg 宽度；从 right 栏浮出的窗口初始就在吸附区内（`snapArmed=false`），需先拖离右缘再回拉。
 * @param rect 拖拽结束时的窗口矩形
 */
function onMoveEnd(rect: WindowRect): void {
    if (typeof window === "undefined" || !canDockRight.value) return
    if (!isInSnapZone(rect)) {
        snapArmed = true
        return
    }
    if (!snapArmed) return
    emit("update:dock", "right")
}

/**
 * 目标面板写回：原样转发给宿主，主控表达式校验与持久化由页面负责。
 * @param side 构筑位
 * @param patch 面板补丁
 */
function onLoadout(side: TranscendSlotGroup, patch: Partial<TargetSideState>): void {
    emit("update-loadout", side, patch)
}
</script>

<template>
    <!-- 浮动态：拖动 / 视口约束 / 层级由通用浮动窗口提供，内容与停靠态一致 -->
    <FloatingWindow
        v-if="dock === 'floating'"
        ref="floatingRef"
        :open="true"
        :title="title"
        :initial-rect="initialRect"
        class="target-card"
        data-target-card
        :data-target-dock="dock"
        data-tour="target-function"
        data-agent="target-function"
        @move-end="onMoveEnd"
        @restore="emit('recall')"
    >
        <template #header>
            <span class="truncate font-semibold">{{ title }}</span>
        </template>
        <template #header-actions>
            <button
                type="button"
                class="btn btn-xs btn-ghost btn-circle"
                data-target-help
                @click="panelRef?.openHelp()"
            >
                <Icon icon="ri:question-line" class="size-4" />
            </button>
            <button
                type="button"
                class="btn btn-xs btn-ghost btn-circle"
                :title="canDockRight ? $t('char-build.target_dock_right') : $t('char-build.target_dock_disabled')"
                :disabled="!canDockRight"
                data-target-dock-action="dock-right"
                @click="requestDock('right')"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="size-4" />
            </button>
            <button
                type="button"
                class="btn btn-xs btn-ghost btn-circle"
                :title="$t('char-build.target_recall')"
                data-target-dock-action="recall"
                @click="emit('recall')"
            >
                <Icon icon="ri:arrow-left-line" class="size-4" />
            </button>
        </template>
        <!-- 内容区自带上限（扣除 header 高度）：控件的内容 max-height 未扣 header，超长内容会把结果行顶出视口 -->
        <div class="target-card-body max-h-[calc(100vh-64px)] overflow-y-auto p-3">
            <TranscendTargetPanel
                ref="panelRef"
                :sides="sides"
                :side-builds="sideBuilds"
                :loadout-side="initialSide"
                :show-header="false"
                @update-loadout="onLoadout"
            >
                <template #result>
                    <template v-if="!hideStaleResult">
                        <div v-if="resultError" class="flex items-center text-xs text-red-500" data-result-error>{{ resultError }}</div>
                        <div v-else class="flex items-center justify-between p-1" data-tour="damage-result" data-agent="damage-result">
                            <div class="text-sm text-base-content/80" data-result-label>{{ resultLabel }}</div>
                            <DamageShow v-if="snapshot.total !== null" :value="snapshot.total" />
                            <span v-else class="text-sm text-base-content/50">{{
                                $t(unavailableKey)
                            }}</span>
                        </div>
                    </template>
                </template>
            </TranscendTargetPanel>
        </div>
    </FloatingWindow>

    <!-- 左栏底部 / 右侧第三栏：内联卡片（不经过浮动窗口） -->
    <div
        v-else
        ref="inlineRoot"
        data-target-card
        :data-target-dock="dock"
        data-tour="target-function"
        data-agent="target-function"
        class="target-card rounded-xs border border-base-content/10 bg-base-100/70 shadow-sm backdrop-blur-sm"
    >
        <div class="flex items-center gap-2 px-3 pt-2">
            <span class="truncate text-[17px] font-semibold text-base-content">{{ title }}</span>
            <div class="ml-auto flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    class="btn btn-xs btn-ghost btn-circle"
                    data-target-help
                    @click="panelRef?.openHelp()"
                >
                    <Icon icon="ri:question-line" class="size-4" />
                </button>
                <button
                    v-if="dock === 'left' || dock === 'right'"
                    type="button"
                    class="btn btn-xs btn-ghost btn-circle"
                    :title="$t('char-build.target_float')"
                    data-target-dock-action="float"
                    @click="requestDock('floating')"
                >
                    <Icon icon="ri:external-link-line" class="size-4" />
                </button>
                <button
                    v-if="dock === 'right'"
                    type="button"
                    class="btn btn-xs btn-ghost btn-circle"
                    :title="$t('char-build.target_recall')"
                    data-target-dock-action="recall"
                    @click="emit('recall')"
                >
                    <Icon icon="ri:arrow-left-line" class="size-4" />
                </button>
            </div>
        </div>
        <div class="target-card-body p-3 pt-1">
            <TranscendTargetPanel
                ref="panelRef"
                :sides="sides"
                :side-builds="sideBuilds"
                :loadout-side="initialSide"
                :show-header="false"
                @update-loadout="onLoadout"
            >
                <template #result>
                    <template v-if="!hideStaleResult">
                        <div v-if="resultError" class="flex items-center text-xs text-red-500" data-result-error>{{ resultError }}</div>
                        <div v-else class="flex items-center justify-between p-1" data-tour="damage-result" data-agent="damage-result">
                            <div class="text-sm text-base-content/80" data-result-label>{{ resultLabel }}</div>
                            <DamageShow v-if="snapshot.total !== null" :value="snapshot.total" />
                            <span v-else class="text-sm text-base-content/50">{{ $t(unavailableKey) }}</span>
                        </div>
                    </template>
                </template>
            </TranscendTargetPanel>
        </div>
    </div>
</template>
