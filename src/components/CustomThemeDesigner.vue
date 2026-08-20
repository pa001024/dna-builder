<script lang="ts" setup>
/**
 * 自定义主题设计器（参考 daisyui.com/theme-generator）：
 * - 20 个语义色色板（含文字色对比度预览）
 * - 圆角 / 边框 / 深度 / 噪点滑杆
 * - 主题修改直接实时应用到整个页面（App.vue 全局注入 [data-theme] 样式）
 * 所有修改实时写入 setting.customTheme（localStorage 持久化）。
 */
import { t } from "i18next"
import { computed } from "vue"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import type { CustomThemeColorKey } from "@/utils/customTheme"
import { CUSTOM_THEME_COLOR_GROUPS, CUSTOM_THEME_ID, DEFAULT_CUSTOM_THEME, isValidHex } from "@/utils/customTheme"

const setting = useSettingStore()
const ui = useUIStore()

const theme = computed(() => setting.customTheme)

/**
 * 颜色键 -> 展示标签，如 "base-100" -> "Base 100"、"primary-content" -> "Primary Content"。
 * @param key 颜色键
 */
function colorLabel(key: CustomThemeColorKey) {
    return key
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
}

/** 是否为文字色（content 结尾），预览时以 Aa 文字展示对比度 */
function isContentKey(key: CustomThemeColorKey) {
    return key.endsWith("-content")
}

/**
 * 通过原生取色器更新颜色。
 * @param key 颜色键
 * @param hex 新颜色值
 */
function setColor(key: CustomThemeColorKey, hex: string) {
    theme.value.colors = { ...theme.value.colors, [key]: hex }
}

/**
 * 手动输入 hex 颜色，非法输入回退为原值。
 * @param key 颜色键
 * @param event 输入事件
 */
function onHexInput(key: CustomThemeColorKey, event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value.trim()
    if (isValidHex(value)) {
        setColor(key, value.toLowerCase())
    } else {
        input.value = theme.value.colors[key]
    }
}

/** 恢复默认自定义主题（带确认） */
async function resetTheme() {
    if (!(await ui.showDialog(t("setting.resetTheme"), t("setting.resetThemeConfirm")))) {
        return
    }
    setting.customTheme = structuredClone(DEFAULT_CUSTOM_THEME)
}
</script>

<template>
    <div class="flex flex-col gap-4 rounded-lg border border-base-300 bg-base-200/40 p-3">
        <!-- 工具栏：配色模式 / 操作 -->
        <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
                <span class="text-xs text-base-content/70">{{ t("setting.colorScheme") }}</span>
                <div class="join">
                    <button
                        class="btn btn-sm join-item"
                        :class="{ 'btn-primary': theme.colorScheme === 'light' }"
                        @click="theme.colorScheme = 'light'"
                    >
                        ☀ {{ t("setting.lightMode") }}
                    </button>
                    <button
                        class="btn btn-sm join-item"
                        :class="{ 'btn-primary': theme.colorScheme === 'dark' }"
                        @click="theme.colorScheme = 'dark'"
                    >
                        ☾ {{ t("setting.darkMode") }}
                    </button>
                </div>
            </div>
            <div class="flex-1" />
            <button class="btn btn-sm btn-ghost" @click="resetTheme">{{ t("setting.resetTheme") }}</button>
        </div>

        <!-- 颜色色板（分组：基础色 / 品牌色 / 状态色） -->
        <div
            v-for="(group, groupIndex) in CUSTOM_THEME_COLOR_GROUPS"
            :key="groupIndex"
            class="flex flex-col gap-1.5"
        >
            <div class="text-xs font-semibold text-base-content/70">
                {{
                    groupIndex === 0
                        ? t("setting.baseColors")
                        : groupIndex === 1
                          ? t("setting.brandColors")
                          : t("setting.stateColors")
                }}
            </div>
            <div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
                <div v-for="{ key } in group" :key="key" class="flex min-w-0 flex-col gap-1">
                    <!-- 色块：点击打开原生取色器；文字色以 Aa 展示在 base-100 上便于检查对比度 -->
                    <label
                        class="relative block aspect-4/3 cursor-pointer overflow-hidden rounded-lg border border-base-content/20"
                        :class="isContentKey(key) ? 'bg-base-100' : ''"
                        :style="isContentKey(key) ? undefined : { backgroundColor: theme.colors[key] }"
                    >
                        <input
                            type="color"
                            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            :value="theme.colors[key]"
                            :title="t('setting.contrastHint')"
                            @input="setColor(key, ($event.target as HTMLInputElement).value)"
                        />
                        <span
                            v-if="isContentKey(key)"
                            class="absolute inset-0 flex items-center justify-center text-sm font-bold"
                            :style="{ color: theme.colors[key] }"
                            >Aa</span
                        >
                    </label>
                    <span class="truncate text-[10px] leading-tight text-base-content/70">{{ colorLabel(key) }}</span>
                    <input
                        :value="theme.colors[key]"
                        class="input input-xs input-bordered w-full px-1 font-mono text-[10px]"
                        spellcheck="false"
                        @change="onHexInput(key, $event)"
                    />
                </div>
            </div>
        </div>

        <!-- 圆角 / 边框 / 深度 / 噪点 -->
        <div class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.radiusSelector") }}</span>
                    <span class="font-mono">{{ theme.radiusSelector }}rem</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="3"
                    step="0.125"
                    :value="theme.radiusSelector"
                    @input="theme.radiusSelector = +($event.target as HTMLInputElement).value"
                />
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.radiusField") }}</span>
                    <span class="font-mono">{{ theme.radiusField }}rem</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="3"
                    step="0.125"
                    :value="theme.radiusField"
                    @input="theme.radiusField = +($event.target as HTMLInputElement).value"
                />
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.radiusBox") }}</span>
                    <span class="font-mono">{{ theme.radiusBox }}rem</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="3"
                    step="0.125"
                    :value="theme.radiusBox"
                    @input="theme.radiusBox = +($event.target as HTMLInputElement).value"
                />
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.borderWidth") }}</span>
                    <span class="font-mono">{{ theme.border }}px</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="3"
                    step="0.25"
                    :value="theme.border"
                    @input="theme.border = +($event.target as HTMLInputElement).value"
                />
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.depth") }}</span>
                    <span class="font-mono">{{ theme.depth }}</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="2"
                    step="1"
                    :value="theme.depth"
                    @input="theme.depth = +($event.target as HTMLInputElement).value"
                />
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex justify-between text-xs text-base-content/70">
                    <span>{{ t("setting.noise") }}</span>
                    <span class="font-mono">{{ theme.noise.toFixed(2) }}</span>
                </div>
                <input
                    type="range"
                    class="range range-primary range-xs"
                    min="0"
                    max="1"
                    step="0.05"
                    :value="theme.noise"
                    @input="theme.noise = +($event.target as HTMLInputElement).value"
                />
            </div>
        </div>

        <!-- 实时预览 -->
        <div class="flex flex-col gap-2">
            <div class="text-xs font-semibold text-base-content/70">{{ t("setting.preview") }}</div>
            <div :data-theme="CUSTOM_THEME_ID" class="flex flex-col gap-3 rounded-box bg-base-100 p-3">
                <div class="flex flex-wrap gap-2">
                    <button class="btn btn-primary btn-sm">Primary</button>
                    <button class="btn btn-secondary btn-sm">Secondary</button>
                    <button class="btn btn-accent btn-sm">Accent</button>
                    <button class="btn btn-neutral btn-sm">Neutral</button>
                    <button class="btn btn-ghost btn-sm">Ghost</button>
                    <button class="btn btn-outline btn-sm">Outline</button>
                    <button class="btn btn-info btn-sm">Info</button>
                    <button class="btn btn-success btn-sm">Success</button>
                    <button class="btn btn-warning btn-sm">Warning</button>
                    <button class="btn btn-error btn-sm">Error</button>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="form-control w-full">
                        <span class="label-text pb-1 text-xs">Input</span>
                        <input type="text" placeholder="Placeholder" class="input input-bordered input-sm w-full" />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text pb-1 text-xs">Select</span>
                        <select class="select select-bordered select-sm w-full">
                            <option>Option 1</option>
                            <option>Option 2</option>
                            <option>Option 3</option>
                        </select>
                    </label>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <label class="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked class="checkbox checkbox-primary checkbox-xs" />
                        Checkbox
                    </label>
                    <label class="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked class="toggle toggle-primary toggle-xs" />
                        Toggle
                    </label>
                    <label class="flex cursor-pointer items-center gap-2">
                        <input type="radio" checked class="radio radio-primary radio-xs" />
                        Radio
                    </label>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    <span class="badge badge-neutral badge-sm">Neutral</span>
                    <span class="badge badge-primary badge-sm">Primary</span>
                    <span class="badge badge-secondary badge-sm">Secondary</span>
                    <span class="badge badge-accent badge-sm">Accent</span>
                    <span class="badge badge-info badge-sm">Info</span>
                    <span class="badge badge-success badge-sm">Success</span>
                    <span class="badge badge-warning badge-sm">Warning</span>
                    <span class="badge badge-error badge-sm">Error</span>
                </div>
                <div class="flex flex-col gap-1.5 text-xs">
                    <div role="alert" class="alert alert-info py-2"><span>Info alert</span></div>
                    <div role="alert" class="alert alert-success py-2"><span>Success alert</span></div>
                    <div role="alert" class="alert alert-warning py-2"><span>Warning alert</span></div>
                    <div role="alert" class="alert alert-error py-2"><span>Error alert</span></div>
                </div>
                <div class="flex flex-col gap-1.5">
                    <progress class="progress progress-primary" value="65" max="100" />
                    <progress class="progress progress-secondary" value="45" max="100" />
                    <progress class="progress progress-accent" value="85" max="100" />
                </div>
                <div class="flex gap-2">
                    <div class="card flex-1 bg-base-200 p-3">
                        <div class="card-title text-sm">Card</div>
                        <div class="text-xs text-base-content/70">base-200</div>
                    </div>
                    <div class="card flex-1 bg-base-300 p-3">
                        <div class="card-title text-sm">Card</div>
                        <div class="text-xs text-base-content/70">base-300</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
