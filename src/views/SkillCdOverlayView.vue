<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, onUnmounted, ref } from "vue"
import DragNumberInput from "@/components/DragNumberInput.vue"
import SkillCdPosPicker from "@/components/SkillCdPosPicker.vue"
import { useSkillCdOverlay } from "@/composables/useSkillCdOverlay"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"
import {
    clampAnchorPercent,
    clampCdSeconds,
    clampDiscAlpha,
    clampScale,
    type FloatWindowKeyBinding,
    SKILL_CD_MAX_KEYS,
} from "@/utils/skill-cd-overlay"
import { vkFromKeyboardEvent, vkLabel } from "@/utils/virtual-key"

/**
 * 技能 CD 倒计时浮窗的独立设置页。
 *
 * 与设置在设置页时的差别:
 * - 可配置任意多条按键绑定(键位捕获 + 任意 CD 秒数),每条一行;
 * - 位置用"游戏窗口客户区百分比"表达,并支持在客户区缩略盒里直接拖拽调整;
 * - 所有改动都会防抖下发到后端浮窗(实时生效),无需重启浮窗。
 */
const { t } = useTranslation()
const setting = useSettingStore()
const overlay = useSkillCdOverlay()
const { state, busy, error, gameFound, clientSize, overlaySize, setEnabled, scheduleApply, previewTrigger, addKey, removeKey, updateKey, assignKey } =
    overlay

/** 正在等待用户按键的绑定 id(为 null 表示未处于捕获状态)。 */
const capturingId = ref<string | null>(null)
/** 捕获/校验过程中的提示文案。 */
const captureHint = ref("")

/** 按键绑定列表(归一化后的持久化数据)。 */
const keys = computed(() => setting.skillCdOverlay.keys)
/** 参与绘制的按键标签(用于位置预览里的小方块)。 */
const markerLabels = computed(() =>
    keys.value.filter(key => key.enabled).map(key => key.label || vkLabel(key.vk) || "?")
)
/** 浮窗运行状态(后端实际状态优先,未连接时回落到持久化开关)。 */
const running = computed(() => setting.skillCdOverlayRunning)
/** 客户区尺寸(未检测到游戏时按 1920×1080 估算,仅用于预览比例)。 */
const previewClient = computed(() => ({
    width: clientSize.value.width || 1920,
    height: clientSize.value.height || 1080,
}))

/**
 * 估算浮窗尺寸(逻辑像素):后端还没渲染过(例如游戏未启动)时用于位置预览。
 * 单行约 48px 圆盘 + 上下 5px 内边距,行间距 8px,整体按缩放系数放大。
 * @returns 估算的浮窗宽高
 */
function estimateOverlaySize() {
    const rows = Math.max(markerLabels.value.length, 1)
    const scale = clampScale(setting.skillCdOverlay.scale)
    return {
        width: Math.round(105 * scale),
        height: Math.round((rows * 48 + (rows - 1) * 8 + 10) * scale),
    }
}

/** 浮窗在客户区中的尺寸占比(百分比),供位置预览绘制小方块。 */
const overlayPercent = computed(() => {
    const size = overlaySize.value.width > 0 && overlaySize.value.height > 0 ? overlaySize.value : estimateOverlaySize()
    return {
        width: (size.width / previewClient.value.width) * 100,
        height: (size.height / previewClient.value.height) * 100,
    }
})

/**
 * 写入横向锚点百分比并立即下发(拖拽过程中持续触发,靠防抖合并成一次调用)。
 * @param value 百分比
 */
function setAnchorX(value: number) {
    setting.skillCdOverlay.anchorXPercent = clampAnchorPercent(value)
    scheduleApply()
}

/**
 * 写入纵向锚点百分比并立即下发。
 * @param value 百分比
 */
function setAnchorY(value: number) {
    setting.skillCdOverlay.anchorYPercent = clampAnchorPercent(value)
    scheduleApply()
}

/**
 * 写入缩放系数并立即下发。
 * @param value 缩放系数
 */
function setScale(value: number) {
    setting.skillCdOverlay.scale = clampScale(value)
    scheduleApply()
}

/**
 * 写入圆盘不透明度并立即下发。
 * @param value 0 ~ 1
 */
function setDiscAlpha(value: number) {
    setting.skillCdOverlay.discAlpha = clampDiscAlpha(value)
    scheduleApply()
}

/**
 * 切换总开关。
 * @param checked 新开关值
 */
async function handleToggle(checked: boolean) {
    await setEnabled(checked)
}

/**
 * 进入按键捕获状态。
 * @param binding 目标绑定
 */
function beginCapture(binding: FloatWindowKeyBinding) {
    capturingId.value = binding.id
    captureHint.value = t("skill-cd-overlay.capture_hint_start")
}

/**
 * 全局按键捕获(捕获阶段拦截,避免触发应用内快捷键)。
 * @param event 键盘事件
 */
function handleCaptureKeydown(event: KeyboardEvent) {
    const target = capturingId.value
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") {
        capturingId.value = null
        captureHint.value = ""
        return
    }
    const vk = vkFromKeyboardEvent(event)
    if (!vk) {
        captureHint.value = t("skill-cd-overlay.capture_hint_unknown")
        return
    }
    const reason = assignKey(target, vk)
    if (reason) {
        captureHint.value = reason
        return
    }
    capturingId.value = null
    captureHint.value = ""
}

/**
 * 新增按键绑定;到达上限或键位用尽时给出提示。
 */
function handleAddKey() {
    const created = addKey()
    if (!created) {
        captureHint.value = t("skill-cd-overlay.capture_hint_max")
        return
    }
    captureHint.value = created.enabled ? "" : t("skill-cd-overlay.capture_hint_exhausted")
}

/**
 * 试触发:让后端浮窗按该绑定开始一次倒计时(无需启动游戏即可预览)。
 * @param binding 目标绑定
 */
async function handlePreview(binding: FloatWindowKeyBinding) {
    await previewTrigger(binding)
}

/** 绑定在浮窗中实际显示的标签(空标签时用键位标签兜底)。 */
function displayLabel(binding: FloatWindowKeyBinding) {
    return binding.label || vkLabel(binding.vk) || "?"
}

onMounted(() => {
    window.addEventListener("keydown", handleCaptureKeydown, true)
})

onUnmounted(() => {
    window.removeEventListener("keydown", handleCaptureKeydown, true)
})
</script>

<template>
    <div class="w-full h-full overflow-y-auto">
        <div class="p-4 flex flex-col gap-4 max-w-2xl m-auto">
            <div
                v-if="!env.isApp"
                class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
                {{ $t('skill-cd-overlay.web_only_notice') }}
            </div>

            <!-- 总开关 -->
            <article>
                <SectionHeader no-animate compact kicker="GAME OVERLAY" :title="$t('skill-cd-overlay.section_title')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.entry_title') }}
                                <div class="text-xs text-base-content/50">
                                    {{ $t('skill-cd-overlay.entry_desc') }}
                                </div>
                                <div v-if="error" class="mt-0.5 text-xs text-error">{{ error }}</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <span v-if="busy" class="loading loading-spinner loading-xs" />
                                <span
                                    v-else
                                    class="text-xs"
                                    :class="running ? 'text-success' : 'text-base-content/40'"
                                    >{{ running ? $t('skill-cd-overlay.running') : $t('skill-cd-overlay.not_running') }}</span
                                >
                                <input
                                    type="checkbox"
                                    class="toggle toggle-secondary"
                                    :checked="setting.skillCdOverlay.enabled"
                                    :disabled="busy"
                                    @change="handleToggle(($event.target as HTMLInputElement).checked)"
                                />
                            </div>
                        </div>
                        <div
                            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.game_window') }}
                                <div class="text-xs text-base-content/50">
                                    {{ $t('skill-cd-overlay.game_window_tip', { name: setting.skillCdOverlay.processName }) }}
                                </div>
                            </span>
                            <span
                                class="font-orbitron text-[13px] font-semibold"
                                :class="gameFound ? 'text-success' : 'text-base-content/40'"
                            >
                                {{ gameFound ? `${clientSize.width} × ${clientSize.height}` : $t('skill-cd-overlay.not_detected') }}
                            </span>
                        </div>
                        <div
                            v-if="state?.timers?.length"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-xs text-base-content/60"
                        >
                            {{ $t('skill-cd-overlay.current_timers') }}
                            <span
                                v-for="timer in state.timers"
                                :key="timer.id"
                                class="ml-2 inline-flex items-center gap-1 font-orbitron tabular-nums"
                                :class="timer.remaining > 0 ? 'text-primary' : 'text-success'"
                                >{{ timer.label }} {{ timer.remaining > 0 ? timer.remaining.toFixed(1) : $t('skill-cd-overlay.ready') }}</span
                            >
                        </div>
                    </div>
                </div>
            </article>

            <!-- 按键与冷却 -->
            <article>
                <SectionHeader no-animate compact kicker="KEYS" :title="$t('skill-cd-overlay.keys_section')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            v-for="binding in keys"
                            :key="binding.id"
                            class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <input
                                type="checkbox"
                                class="toggle toggle-xs toggle-secondary"
                                :checked="binding.enabled"
                                @change="updateKey(binding.id, { enabled: ($event.target as HTMLInputElement).checked })"
                            />
                            <input
                                :value="binding.label"
                                type="text"
                                class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                :placeholder="$t('skill-cd-overlay.label_placeholder')"
                                @input="updateKey(binding.id, { label: ($event.target as HTMLInputElement).value })"
                            />
                            <button
                                class="btn btn-sm font-orbitron"
                                :class="capturingId === binding.id ? 'btn-primary' : 'btn-outline'"
                                @click="beginCapture(binding)"
                            >
                                {{ capturingId === binding.id ? $t('skill-cd-overlay.key_capturing') : displayLabel(binding) }}
                            </button>
                            <DragNumberInput
                                :model-value="binding.cdSeconds"
                                :min="0.5"
                                :max="600"
                                :step="0.5"
                                :drag-step="0.1"
                                :precision="1"
                                suffix="s"
                                width-class="w-24"
                                :aria-label="$t('skill-cd-overlay.cd_seconds_label', { name: displayLabel(binding) })"
                                @update:model-value="value => updateKey(binding.id, { cdSeconds: clampCdSeconds(value) })"
                            />
                            <label
                                class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60"
                                :title="
                                    binding.noCooldown
                                        ? $t('skill-cd-overlay.retrigger_tip')
                                        : $t('skill-cd-overlay.cooldown_only_tip')
                                "
                            >
                                <input
                                    type="checkbox"
                                    class="toggle toggle-xs toggle-secondary"
                                    :checked="binding.noCooldown"
                                    @change="updateKey(binding.id, { noCooldown: ($event.target as HTMLInputElement).checked })"
                                />
                                {{ $t('skill-cd-overlay.no_cooldown') }}
                            </label>
                            <div class="ml-auto flex items-center gap-1">
                                <button
                                    class="btn btn-ghost btn-xs"
                                    :disabled="!setting.skillCdOverlay.enabled"
                                    :title="setting.skillCdOverlay.enabled ? $t('skill-cd-overlay.trigger_tip_on') : $t('skill-cd-overlay.trigger_tip_off')"
                                    @click="handlePreview(binding)"
                                >
                                    {{ $t('skill-cd-overlay.test_trigger') }}
                                </button>
                                <button class="btn btn-ghost btn-xs text-error" @click="removeKey(binding.id)">{{ $t('skill-cd-overlay.delete') }}</button>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <button
                                class="btn btn-sm"
                                :disabled="keys.length >= SKILL_CD_MAX_KEYS"
                                @click="handleAddKey"
                            >
                                {{ $t('skill-cd-overlay.add_key') }}
                            </button>
                            <span class="text-xs text-base-content/50">
                                {{ $t('skill-cd-overlay.max_keys_tip', { count: SKILL_CD_MAX_KEYS }) }}
                            </span>
                        </div>
                        <div v-if="captureHint" class="text-xs text-warning">{{ captureHint }}</div>
                        <div
                            v-if="setting.skillCdOverlay.enabled && !gameFound && setting.skillCdOverlay.hideWhenGameMissing"
                            class="text-xs text-warning"
                        >
                            {{ $t('skill-cd-overlay.no_game_warning') }}
                        </div>
                    </div>
                </div>
            </article>

            <!-- 位置 -->
            <article>
                <SectionHeader no-animate compact kicker="POSITION" :title="$t('skill-cd-overlay.position_section')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-3">
                        <SkillCdPosPicker
                            :anchor-x="setting.skillCdOverlay.anchorXPercent"
                            :anchor-y="setting.skillCdOverlay.anchorYPercent"
                            :overlay-width-percent="overlayPercent.width"
                            :overlay-height-percent="overlayPercent.height"
                            :client-width="previewClient.width"
                            :client-height="previewClient.height"
                            :labels="markerLabels"
                            :game-found="gameFound"
                            @update:anchor-x="setAnchorX"
                            @update:anchor-y="setAnchorY"
                        />
                        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.anchor_percent') }}
                                <div class="text-xs text-base-content/50">
                                    {{ $t('skill-cd-overlay.anchor_percent_tip') }}
                                </div>
                            </span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-base-content/60">X</span>
                                <DragNumberInput
                                    :model-value="setting.skillCdOverlay.anchorXPercent"
                                    :min="0"
                                    :max="100"
                                    :step="1"
                                    :drag-step="0.4"
                                    :precision="1"
                                    suffix="%"
                                    :aria-label="$t('skill-cd-overlay.anchor_x_percent')"
                                    @update:model-value="setAnchorX"
                                />
                                <span class="text-xs text-base-content/60">Y</span>
                                <DragNumberInput
                                    :model-value="setting.skillCdOverlay.anchorYPercent"
                                    :min="0"
                                    :max="100"
                                    :step="1"
                                    :drag-step="0.4"
                                    :precision="1"
                                    suffix="%"
                                    :aria-label="$t('skill-cd-overlay.anchor_y_percent')"
                                    @update:model-value="setAnchorY"
                                />
                            </div>
                        </div>
                        <div v-if="state" class="text-[11px] text-base-content/50">
                            {{
                                $t('skill-cd-overlay.resolved_info', {
                                    x: state.resolvedX,
                                    y: state.resolvedY,
                                    w: state.windowWidth,
                                    h: state.windowHeight,
                                })
                            }}
                            <span v-if="!state.visible">{{ $t('skill-cd-overlay.not_shown') }}</span>
                        </div>
                    </div>
                </div>
            </article>

            <!-- 外观 -->
            <article>
                <SectionHeader no-animate compact kicker="APPEARANCE" :title="$t('skill-cd-overlay.appearance_section')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.scale') }}
                                <div class="text-xs text-base-content/50">{{ $t('skill-cd-overlay.scale_tip') }}</div>
                            </span>
                            <div class="flex min-w-52 items-center gap-2">
                                <input
                                    :value="setting.skillCdOverlay.scale"
                                    type="range"
                                    class="range range-secondary w-full"
                                    min="0.5"
                                    max="3"
                                    step="0.1"
                                    @input="setScale(+($event.target as HTMLInputElement).value)"
                                />
                                <span
                                    class="w-10 text-right font-orbitron text-[13px] font-semibold text-primary"
                                    >{{ setting.skillCdOverlay.scale.toFixed(1) }}</span
                                >
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.disc_alpha') }}
                                <div class="text-xs text-base-content/50">{{ $t('skill-cd-overlay.disc_alpha_tip') }}</div>
                            </span>
                            <div class="flex min-w-52 items-center gap-2">
                                <input
                                    :value="setting.skillCdOverlay.discAlpha"
                                    type="range"
                                    class="range range-secondary w-full"
                                    min="0"
                                    max="1"
                                    step="0.02"
                                    @input="setDiscAlpha(+($event.target as HTMLInputElement).value)"
                                />
                                <span
                                    class="w-10 text-right font-orbitron text-[13px] font-semibold text-primary"
                                    >{{ Math.round(setting.skillCdOverlay.discAlpha * 100) }}%</span
                                >
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.hide_when_ready') }}
                                <div class="text-xs text-base-content/50">{{ $t('skill-cd-overlay.hide_when_ready_tip') }}</div>
                            </span>
                            <input
                                v-model="setting.skillCdOverlay.hideWhenReady"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @change="scheduleApply()"
                            />
                        </div>
                    </div>
                </div>
            </article>

            <!-- 高级 -->
            <article>
                <SectionHeader no-animate compact kicker="ADVANCED" :title="$t('skill-cd-overlay.advanced_section')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.foreground_only') }}
                                <div class="text-xs text-base-content/50">
                                    {{ $t('skill-cd-overlay.foreground_only_tip') }}
                                </div>
                            </span>
                            <input
                                v-model="setting.skillCdOverlay.gameOnlyTrigger"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @change="scheduleApply()"
                            />
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.hide_without_game') }}
                                <div class="text-xs text-base-content/50">
                                    {{ $t('skill-cd-overlay.hide_without_game_tip') }}
                                </div>
                            </span>
                            <input
                                v-model="setting.skillCdOverlay.hideWhenGameMissing"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @change="scheduleApply()"
                            />
                        </div>
                        <div
                            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t('skill-cd-overlay.process_name') }}
                                <div class="text-xs text-base-content/50">{{ $t('skill-cd-overlay.process_name_tip') }}</div>
                            </span>
                            <input
                                v-model="setting.skillCdOverlay.processName"
                                type="text"
                                class="w-64 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                placeholder="EM-Win64-Shipping.exe"
                                @input="scheduleApply()"
                            />
                        </div>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>
