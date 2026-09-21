<script setup lang="ts">
import { computed } from "vue"
import DragNumberInput from "@/components/DragNumberInput.vue"
import ScreenBarContent from "@/components/ScreenBarContent.vue"
import { useScreenBar } from "@/composables/useScreenBar"
import { useScreenBarContent } from "@/composables/useScreenBarContent"
import { env } from "@/env"
import { MIHAN_TYPES } from "@/store/mihan"
import { useSettingStore } from "@/store/setting"
import { MIHAN_MISSIONS } from "@/utils/mihan-meta"
import {
    createScreenBarItem,
    SCREEN_BAR_CLOCK_PRESETS,
    SCREEN_BAR_ITEM_TYPES,
    SCREEN_BAR_MAX_ITEMS,
    SCREEN_BAR_MAX_OFFSET_Y,
    SCREEN_BAR_MAX_OPACITY,
    SCREEN_BAR_MAX_SCALE,
    SCREEN_BAR_MIN_OFFSET_Y,
    SCREEN_BAR_MIN_OPACITY,
    SCREEN_BAR_MIN_SCALE,
    type ScreenBarCountdownItem,
    type ScreenBarItem,
    type ScreenBarItemType,
} from "@/utils/screen-bar"

/**
 * 屏幕信息条的设置编辑器。
 *
 * 条目是可编辑列表:每行对应浮窗里的一个组件,支持增删与上下移动;改完即时同步到浮窗
 * (浮窗窗口每秒比对 localStorage,不依赖 storage 事件)。预览用的是浮窗同一个渲染组件。
 */
const setting = useSettingStore()
const { busy, error, setEnabled } = useScreenBar()
const config = computed(() => setting.screenBar)
const { items: previewItems } = useScreenBarContent(config)

/** 条目上限已满时禁止继续添加。 */
const addDisabled = computed(() => config.value.items.length >= SCREEN_BAR_MAX_ITEMS)

/**
 * 条目类型在设置页的展示名 i18n key。
 * @param type 条目类型
 * @returns i18n key
 */
function itemTypeKey(type: ScreenBarItemType): string {
    return `screenBar.item${type[0].toUpperCase()}${type.slice(1)}`
}

/**
 * 追加一个条目。
 * @param type 条目类型
 */
function addItem(type: ScreenBarItemType) {
    if (addDisabled.value) return
    setting.screenBar.items = [...setting.screenBar.items, createScreenBarItem(type)]
}

/**
 * 删除一个条目。
 * @param id 条目 id
 */
function removeItem(id: string) {
    setting.screenBar.items = setting.screenBar.items.filter(item => item.id !== id)
}

/**
 * 上移或下移一个条目。
 * @param id 条目 id
 * @param delta -1 上移,1 下移
 */
function moveItem(id: string, delta: number) {
    const list = [...setting.screenBar.items]
    const index = list.findIndex(item => item.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= list.length) return
    const [moved] = list.splice(index, 1)
    list.splice(target, 0, moved)
    setting.screenBar.items = list
}

/**
 * 替换一个条目(保持类型收窄)。
 * @param id 条目 id
 * @param patch 覆盖字段
 */
function replaceItem(id: string, patch: Partial<ScreenBarItem>) {
    setting.screenBar.items = setting.screenBar.items.map(item => (item.id === id ? ({ ...item, ...patch } as ScreenBarItem) : item))
}

/**
 * 修改时钟条目的模板。
 * @param item 目标条目
 * @param format 新模板
 */
function setClockFormat(item: ScreenBarItem, format: string) {
    if (item.type !== "clock") return
    replaceItem(item.id, { format })
}

/**
 * 修改自定义倒计时的字段。
 * @param item 目标条目
 * @param patch 覆盖字段
 */
function setCountdown(item: ScreenBarItem, patch: Partial<Omit<ScreenBarCountdownItem, "id" | "type">>) {
    if (item.type !== "countdown") return
    replaceItem(item.id, patch)
}

/**
 * 开关委托条目里的一个密函类型。
 *
 * 允许一个都不选(空 = 该条目不展示任何类型)。这里绝不能做"至少留一个"的回退:
 * 回退会把绑定值还原成原值,Vue 判定无变化就不再写 DOM,而浏览器已经把勾去掉了,
 * 勾选态与存储就此脱钩——用户看到的就是"点了没反应 / 自己跳回未选中"。
 * @param item 目标条目
 * @param index 密函类型下标
 * @param checked 是否选中
 */
function toggleMihanType(item: ScreenBarItem, index: number, checked: boolean) {
    if (item.type !== "mihan") return
    replaceItem(item.id, { types: checked ? [...item.types, index] : item.types.filter(value => value !== index) })
}

/**
 * 开关委托条目里的一个关注任务。
 * @param item 目标条目
 * @param mission 任务名
 * @param checked 是否选中
 */
function toggleMihanMission(item: ScreenBarItem, mission: string, checked: boolean) {
    if (item.type !== "mihan") return
    replaceItem(item.id, {
        missions: checked ? [...item.missions, mission] : item.missions.filter(value => value !== mission),
    })
}

/**
 * 切换委托条目"只看关注"。
 * @param item 目标条目
 * @param checked 是否只看关注
 */
function setOnlyMatched(item: ScreenBarItem, checked: boolean) {
    if (item.type !== "mihan") return
    replaceItem(item.id, { onlyMatched: checked })
}

/**
 * 读取条目上可直接绑定的标量参数(模板里无法对联合类型做字段访问)。
 * @param item 条目
 * @returns 各类型的标量参数,不适用时给空值
 */
function itemParams(item: ScreenBarItem) {
    return {
        format: item.type === "clock" ? item.format : "",
        title: item.type === "countdown" ? item.title : "",
        target: item.type === "countdown" ? item.target : "",
        types: item.type === "mihan" ? item.types : ([] as number[]),
        missions: item.type === "mihan" ? item.missions : ([] as string[]),
        onlyMatched: item.type === "mihan" ? item.onlyMatched : false,
    }
}
</script>

<template>
    <div
        class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        :style="{ animationDelay: '0.03s' }"
    >
        <div class="flex flex-col gap-2">
            <!-- 总开关 -->
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("screenBar.enable") }}
                    <div v-if="error" class="mt-0.5 text-xs text-error">{{ error }}</div>
                    <div v-if="!env.isApp" class="mt-0.5 text-xs text-warning">{{ $t("screenBar.appOnly") }}</div>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                    <span v-if="busy" class="loading loading-spinner loading-xs" />
                    <input
                        type="checkbox"
                        class="toggle toggle-secondary"
                        :checked="config.enabled"
                        :disabled="busy || !env.isApp"
                        @change="setEnabled(($event.target as HTMLInputElement).checked)"
                    />
                </div>
            </div>

            <!-- 实时预览 -->
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 text-[11px] font-medium text-base-content/55">{{ $t("screenBar.preview") }}</div>
                <div class="flex min-h-8 items-center overflow-hidden">
                    <ScreenBarContent :items="previewItems" :opacity="config.opacity" :scale="config.scale" />
                </div>
            </div>

            <!-- 条目列表 -->
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 flex items-center gap-2">
                    <span class="text-[11px] font-medium text-base-content/55">{{ $t("screenBar.items") }}</span>
                    <span class="text-[10px] text-base-content/40">{{ config.items.length }} / {{ SCREEN_BAR_MAX_ITEMS }}</span>
                </div>

                <div v-if="config.items.length === 0" class="py-2 text-center text-xs text-base-content/45">
                    {{ $t("screenBar.empty") }}
                </div>

                <div v-else class="flex flex-col gap-1.5">
                    <div
                        v-for="item in config.items"
                        :key="item.id"
                        class="rounded-xs border border-base-content/10 bg-base-100/60 px-2 py-1.5"
                    >
                        <!-- 条目头部:类型 + 排序 + 删除 -->
                        <div class="flex items-center gap-2">
                            <span class="inline-flex h-5 items-center rounded-xs bg-secondary/15 px-1.5 text-[10px] font-semibold text-secondary">
                                {{ $t(itemTypeKey(item.type)) }}
                            </span>
                            <div class="ml-auto flex items-center gap-0.5">
                                <button
                                    type="button"
                                    class="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content disabled:pointer-events-none disabled:opacity-30"
                                    :disabled="config.items.indexOf(item) === 0"
                                    :title="$t('screenBar.moveUp')"
                                    @click="moveItem(item.id, -1)"
                                >
                                    <Icon icon="ri:arrow-up-line" class="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content disabled:pointer-events-none disabled:opacity-30"
                                    :disabled="config.items.indexOf(item) === config.items.length - 1"
                                    :title="$t('screenBar.moveDown')"
                                    @click="moveItem(item.id, 1)"
                                >
                                    <Icon icon="ri:arrow-down-line" class="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                                    :title="$t('screenBar.remove')"
                                    @click="removeItem(item.id)"
                                >
                                    <Icon icon="ri:close-line" class="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        <!-- 时钟参数 -->
                        <div v-if="item.type === 'clock'" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <input
                                :value="itemParams(item).format"
                                type="text"
                                class="input input-bordered input-xs w-36 font-orbitron"
                                placeholder="HH:mm:ss"
                                @input="setClockFormat(item, ($event.target as HTMLInputElement).value)"
                            />
                            <button
                                v-for="preset in SCREEN_BAR_CLOCK_PRESETS"
                                :key="preset"
                                type="button"
                                class="inline-flex h-5 cursor-pointer items-center rounded-xs border px-1.5 text-[10px] transition-colors"
                                :class="
                                    itemParams(item).format === preset
                                        ? 'border-primary/50 bg-primary/10 text-primary'
                                        : 'border-base-content/15 text-base-content/60 hover:border-primary/40 hover:text-primary'
                                "
                                @click="setClockFormat(item, preset)"
                            >
                                {{ preset }}
                            </button>
                        </div>

                        <!-- 自定义倒计时参数 -->
                        <div v-else-if="item.type === 'countdown'" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <input
                                :value="itemParams(item).title"
                                type="text"
                                class="input input-bordered input-xs w-28"
                                :placeholder="$t('screenBar.countdownTitlePlaceholder')"
                                @input="setCountdown(item, { title: ($event.target as HTMLInputElement).value })"
                            />
                            <input
                                :value="itemParams(item).target"
                                type="datetime-local"
                                class="input input-bordered input-xs w-48 font-orbitron"
                                @input="setCountdown(item, { target: ($event.target as HTMLInputElement).value })"
                            />
                        </div>

                        <!-- 委托条目参数 -->
                        <div v-else-if="item.type === 'mihan'" class="mt-1.5 flex flex-col gap-1.5">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <label
                                    v-for="(type, index) in MIHAN_TYPES"
                                    :key="type"
                                    class="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/75 transition-colors has-checked:border-secondary/40 has-checked:bg-secondary/10 has-checked:text-secondary"
                                >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs rounded-xs"
                                        :checked="itemParams(item).types.includes(index)"
                                        @change="toggleMihanType(item, index, ($event.target as HTMLInputElement).checked)"
                                    />
                                    {{ $t(type) }}
                                </label>
                                <label class="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-base-content/75">
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-xs toggle-secondary"
                                        :checked="itemParams(item).onlyMatched"
                                        @change="setOnlyMatched(item, ($event.target as HTMLInputElement).checked)"
                                    />
                                    {{ $t("screenBar.onlyMatched") }}
                                </label>
                            </div>

                            <!-- 关注任务:开启"只看关注"后才需要挑,平时不占地方 -->
                            <div v-if="itemParams(item).onlyMatched" class="flex flex-wrap items-center gap-1">
                                <label
                                    v-for="mission in MIHAN_MISSIONS"
                                    :key="mission"
                                    class="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/75 transition-colors has-checked:border-secondary/40 has-checked:bg-secondary/10 has-checked:text-secondary"
                                >
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs rounded-xs"
                                        :checked="itemParams(item).missions.includes(mission)"
                                        @change="toggleMihanMission(item, mission, ($event.target as HTMLInputElement).checked)"
                                    />
                                    {{ $t(mission) }}
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 添加条目 -->
                <div class="mt-2 flex flex-wrap items-center gap-1.5 border-t border-base-content/10 pt-2">
                    <span class="text-[10px] text-base-content/40">{{ $t("screenBar.add") }}</span>
                    <button
                        v-for="type in SCREEN_BAR_ITEM_TYPES"
                        :key="type"
                        type="button"
                        class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/70 transition-colors hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                        :disabled="addDisabled"
                        @click="addItem(type)"
                    >
                        <Icon icon="ri:add-line" class="h-3 w-3" />
                        {{ $t(itemTypeKey(type)) }}
                    </button>
                </div>
            </div>

            <!-- 外观:数值统一用可拖拽数字框,滑块太短没法精调 -->
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 text-[11px] font-medium text-base-content/55">{{ $t("screenBar.appearance") }}</div>
                <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div class="flex items-center gap-2 text-xs text-base-content/75">
                        {{ $t("screenBar.opacity") }}
                        <DragNumberInput
                            v-model="setting.screenBar.opacity"
                            :min="SCREEN_BAR_MIN_OPACITY"
                            :max="SCREEN_BAR_MAX_OPACITY"
                            :step="0.02"
                            :drag-step="0.005"
                            :precision="2"
                            :aria-label="$t('screenBar.opacity')"
                        />
                    </div>
                    <div class="flex items-center gap-2 text-xs text-base-content/75">
                        {{ $t("screenBar.scale") }}
                        <DragNumberInput
                            v-model="setting.screenBar.scale"
                            :min="SCREEN_BAR_MIN_SCALE"
                            :max="SCREEN_BAR_MAX_SCALE"
                            :step="0.05"
                            :drag-step="0.01"
                            :precision="2"
                            suffix="×"
                            :aria-label="$t('screenBar.scale')"
                        />
                    </div>
                    <div class="flex items-center gap-2 text-xs text-base-content/75">
                        {{ $t("screenBar.offsetY") }}
                        <DragNumberInput
                            v-model="setting.screenBar.offsetY"
                            :min="SCREEN_BAR_MIN_OFFSET_Y"
                            :max="SCREEN_BAR_MAX_OFFSET_Y"
                            :step="1"
                            :precision="0"
                            suffix="px"
                            :aria-label="$t('screenBar.offsetY')"
                        />
                    </div>
                    <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/75">
                        <input v-model="setting.screenBar.ignoreCursorEvents" type="checkbox" class="toggle toggle-xs toggle-secondary" />
                        {{ $t("screenBar.clickThrough") }}
                    </label>
                </div>
            </div>
        </div>
    </div>
</template>
