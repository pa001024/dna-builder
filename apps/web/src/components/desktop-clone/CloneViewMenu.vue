<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { nextTick, ref, watch } from "vue"
import { type CloneOptions, type KeyboardHookMode, type SmallWindowMode, toCloneErrorMessage } from "@/api/desktop-clone"
import { useDesktopCloneStore, watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 克隆窗口的显示/输入选项菜单。
 *
 * 所有变更都走 `desktop_clone_set_options`（后端负责小窗尺寸、几何与控件属性）；
 * 前端不直接改窗口尺寸。热键路由/静音在已连接时变更会由后端发 reconnect-required。
 */
const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useTranslation()
const store = useDesktopCloneStore()
const error = ref("")

watchCloneOverlay(() => props.open)

const panelRef = ref<HTMLElement | null>(null)

// 键盘可达：打开后焦点进入菜单，Escape 关闭
watch(
    () => props.open,
    async open => {
        if (!open) return
        await nextTick()
        panelRef.value?.focus()
    },
    { flush: "post" }
)

const SMALL_WINDOW_MODES: SmallWindowMode[] = ["off", "500", "1280"]
const KEYBOARD_HOOK_MODES: KeyboardHookMode[] = ["local", "remote"]

const SMALL_WINDOW_LABELS: Record<SmallWindowMode, string> = {
    off: "desktop_clone.options.small_window_off",
    "500": "desktop_clone.options.small_window_500",
    "1280": "desktop_clone.options.small_window_1280",
}

async function update(patch: Partial<CloneOptions>) {
    error.value = ""
    try {
        await store.setOptions(patch)
    } catch (cause) {
        error.value = toCloneErrorMessage(cause)
    }
}

function onToggle(event: Event, apply: (checked: boolean) => void) {
    apply((event.target as HTMLInputElement).checked)
}
</script>

<template>
    <!-- 打开菜单时原生 RDP 子窗口已被隐藏，透明底可用于点击收起 -->
    <div v-if="open" class="fixed inset-0 z-30" @click="emit('close')" />
    <div
        v-if="open"
        ref="panelRef"
        role="dialog"
        aria-modal="false"
        :aria-label="t('desktop_clone.action.view_menu')"
        tabindex="-1"
        class="animate-ef-rise motion-reduce:animate-none absolute right-2 top-12 z-40 flex w-76 flex-col gap-3 rounded-xs border border-base-content/15 bg-base-100 p-3 shadow-xl outline-none"
        @keydown.esc.stop.prevent="emit('close')"
    >
        <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.options.small_window") }}</span>
            <div class="grid grid-cols-3 gap-1">
                <button
                    v-for="mode in SMALL_WINDOW_MODES"
                    :key="mode"
                    type="button"
                    class="btn btn-xs"
                    :class="store.options.smallWindow === mode ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                    @click="update({ smallWindow: mode })"
                >
                    {{ t(SMALL_WINDOW_LABELS[mode]) }}
                </button>
            </div>
        </div>

        <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.options.scaling") }}</span>
            <div class="grid grid-cols-2 gap-1">
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="store.options.smartSizing ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                    @click="update({ smartSizing: true })"
                >
                    {{ t("desktop_clone.options.scaling_fit") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="!store.options.smartSizing ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                    @click="update({ smartSizing: false })"
                >
                    {{ t("desktop_clone.options.scaling_1to1") }}
                </button>
            </div>
        </div>

        <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.options.keyboard_hook") }}</span>
            <div class="grid grid-cols-2 gap-1">
                <button
                    v-for="mode in KEYBOARD_HOOK_MODES"
                    :key="mode"
                    type="button"
                    class="btn btn-xs"
                    :class="store.options.keyboardHook === mode ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                    @click="update({ keyboardHook: mode })"
                >
                    {{ t(`desktop_clone.options.keyboard_hook_${mode}`) }}
                </button>
            </div>
            <span class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.options.keyboard_hook_desc") }}</span>
        </div>

        <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5">
            <span class="text-sm">
                {{ t("desktop_clone.options.aspect_lock") }}
                <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.aspect_lock_desc") }}</span>
            </span>
            <input
                type="checkbox"
                class="toggle toggle-sm toggle-secondary"
                :checked="store.options.aspectLock"
                @change="onToggle($event, checked => update({ aspectLock: checked }))"
            />
        </label>

        <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5">
            <span class="text-sm">
                {{ t("desktop_clone.options.mute") }}
                <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.mute_desc") }}</span>
            </span>
            <input
                type="checkbox"
                class="toggle toggle-sm toggle-secondary"
                :checked="store.options.muted"
                @change="onToggle($event, checked => update({ muted: checked }))"
            />
        </label>

        <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5">
            <span class="text-sm">{{ t("desktop_clone.options.always_on_top") }}</span>
            <input
                type="checkbox"
                class="toggle toggle-sm toggle-secondary"
                :checked="store.options.alwaysOnTop"
                @change="onToggle($event, checked => update({ alwaysOnTop: checked }))"
            />
        </label>

        <p class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.options.reconnect_hint") }}</p>
        <p v-if="error" class="rounded-xs border border-error/30 bg-error/10 px-2 py-1 text-[11px] text-error">{{ error }}</p>
    </div>
</template>
