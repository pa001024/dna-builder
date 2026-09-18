<script setup lang="ts">
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
    captureHint.value = "请按下要绑定的按键(Esc 取消)"
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
        captureHint.value = "无法识别该按键,请换一个"
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
        captureHint.value = "已达到最大按键数量,请先删除不用的按键"
        return
    }
    captureHint.value = created.enabled ? "" : "候选键位已用尽,请点左侧按钮捕获新的按键后启用该行"
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
                浮窗依赖桌面端原生窗口能力,网页端只能查看与编辑配置,不会真正生效。
            </div>

            <!-- 总开关 -->
            <article>
                <SectionHeader no-animate compact kicker="GAME OVERLAY" :title="'技能CD指示器'" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                技能 CD 倒计时浮窗
                                <div class="text-xs text-base-content/50">
                                    原生 Win32 置顶浮窗(点击穿透、不抢焦点);按下绑定的按键即从完整 CD
                                    开始倒计时,就绪时整环变绿。下方的设置改动都会实时下发。
                                </div>
                                <div v-if="error" class="mt-0.5 text-xs text-error">{{ error }}</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <span v-if="busy" class="loading loading-spinner loading-xs" />
                                <span
                                    v-else
                                    class="text-xs"
                                    :class="running ? 'text-success' : 'text-base-content/40'"
                                    >{{ running ? "运行中" : "未运行" }}</span
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
                                游戏窗口
                                <div class="text-xs text-base-content/50">
                                    浮窗位置以该进程窗口的客户区为参照(默认 {{ setting.skillCdOverlay.processName }})
                                </div>
                            </span>
                            <span
                                class="font-orbitron text-[13px] font-semibold tabular-nums"
                                :class="gameFound ? 'text-success' : 'text-base-content/40'"
                            >
                                {{ gameFound ? `${clientSize.width} × ${clientSize.height}` : "未检测到" }}
                            </span>
                        </div>
                        <div
                            v-if="state?.timers?.length"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-xs text-base-content/60"
                        >
                            浮窗当前条目:
                            <span
                                v-for="timer in state.timers"
                                :key="timer.id"
                                class="ml-2 inline-flex items-center gap-1 font-orbitron tabular-nums"
                                :class="timer.remaining > 0 ? 'text-primary' : 'text-success'"
                                >{{ timer.label }} {{ timer.remaining > 0 ? timer.remaining.toFixed(1) : "就绪" }}</span
                            >
                        </div>
                    </div>
                </div>
            </article>

            <!-- 按键与冷却 -->
            <article>
                <SectionHeader no-animate compact kicker="KEYS" :title="'按键与冷却'" />
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
                                class="input input-bordered input-sm w-20"
                                placeholder="标签"
                                @input="updateKey(binding.id, { label: ($event.target as HTMLInputElement).value })"
                            />
                            <button
                                class="btn btn-sm font-orbitron"
                                :class="capturingId === binding.id ? 'btn-primary' : 'btn-outline'"
                                @click="beginCapture(binding)"
                            >
                                {{ capturingId === binding.id ? "按键…" : displayLabel(binding) }}
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
                                :aria-label="`${displayLabel(binding)} 冷却秒数`"
                                @update:model-value="value => updateKey(binding.id, { cdSeconds: clampCdSeconds(value) })"
                            />
                            <div class="ml-auto flex items-center gap-1">
                                <button
                                    class="btn btn-ghost btn-xs"
                                    :disabled="!setting.skillCdOverlay.enabled"
                                    :title="setting.skillCdOverlay.enabled ? '让浮窗立即开始一次倒计时' : '请先开启浮窗'"
                                    @click="handlePreview(binding)"
                                >
                                    试触发
                                </button>
                                <button class="btn btn-ghost btn-xs text-error" @click="removeKey(binding.id)">删除</button>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <button
                                class="btn btn-sm"
                                :disabled="keys.length >= SKILL_CD_MAX_KEYS"
                                @click="handleAddKey"
                            >
                                添加按键
                            </button>
                            <span class="text-xs text-base-content/50">
                                最多 {{ SKILL_CD_MAX_KEYS }} 个 · 冷却未结束时不重复触发,就绪后按键立刻重新计时
                            </span>
                        </div>
                        <div v-if="captureHint" class="text-xs text-warning">{{ captureHint }}</div>
                        <div
                            v-if="setting.skillCdOverlay.enabled && !gameFound && setting.skillCdOverlay.hideWhenGameMissing"
                            class="text-xs text-warning"
                        >
                            未检测到游戏窗口,浮窗暂不显示;若要立刻在桌面上核对配置,可在「高级」里关闭「未检测到游戏窗口时隐藏」。
                        </div>
                    </div>
                </div>
            </article>

            <!-- 位置 -->
            <article>
                <SectionHeader no-animate compact kicker="POSITION" :title="'浮窗位置(客户区百分比)'" />
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
                                锚点百分比
                                <div class="text-xs text-base-content/50">
                                    浮窗左上角在游戏客户区中的位置;上方缩略盒拖拽与这里拖拽数值等价
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
                                    aria-label="横向锚点百分比"
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
                                    aria-label="纵向锚点百分比"
                                    @update:model-value="setAnchorY"
                                />
                            </div>
                        </div>
                        <div v-if="state" class="text-[11px] text-base-content/50">
                            后端解析:屏幕坐标 X {{ state.resolvedX }} · Y {{ state.resolvedY }} · 浮窗尺寸
                            {{ state.windowWidth }} × {{ state.windowHeight }}
                            <span v-if="!state.visible">(当前未显示)</span>
                        </div>
                    </div>
                </div>
            </article>

            <!-- 外观 -->
            <article>
                <SectionHeader no-animate compact kicker="APPEARANCE" :title="'外观'" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                浮窗缩放
                                <div class="text-xs text-base-content/50">按屏幕分辨率缩放圆环与文字尺寸</div>
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
                                    class="w-10 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                                    >{{ setting.skillCdOverlay.scale.toFixed(1) }}</span
                                >
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                圆盘不透明度
                                <div class="text-xs text-base-content/50">数字衬底的通透度;调低可更清楚地透出游戏画面</div>
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
                                    class="w-10 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                                    >{{ Math.round(setting.skillCdOverlay.discAlpha * 100) }}%</span
                                >
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                就绪后隐藏
                                <div class="text-xs text-base-content/50">CD 归零立即隐藏该条目,只在使用期间显示</div>
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
                <SectionHeader no-animate compact kicker="ADVANCED" :title="'高级'" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                仅游戏窗口前台触发
                                <div class="text-xs text-base-content/50">
                                    开启后只在游戏进程获得焦点时响应按键,避免聊天输入误触发
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
                                未检测到游戏窗口时隐藏
                                <div class="text-xs text-base-content/50">
                                    关闭后在游戏未运行时也能看到浮窗(便于用「试触发」核对配置)
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
                                游戏进程名
                                <div class="text-xs text-base-content/50">客户区定位与前台判断所用的进程;多个用逗号分隔,留空用内置默认</div>
                            </span>
                            <input
                                v-model="setting.skillCdOverlay.processName"
                                type="text"
                                class="input input-bordered input-sm w-64"
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
