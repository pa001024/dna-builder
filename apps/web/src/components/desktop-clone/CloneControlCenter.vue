<script setup lang="ts">
import { open as openFileDialog } from "@tauri-apps/plugin-dialog"
import { useTranslation } from "i18next-vue"
import { nextTick, ref, watch } from "vue"
import {
    type CloneProgram,
    type CloneSendKeyAction,
    toCloneErrorMessage,
} from "@/api/desktop-clone"
import { useDesktopCloneStore, watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 控制中心：程序列表（增删/编辑/投送到子会话）与三个系统热键快捷动作。
 *
 * 程序列表来自 `options.programs`，所有修改都通过完整选项对象持久化；
 * 投送由后端 Task Scheduler 在 child session 内完成。
 */
const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const { t } = useTranslation()
const store = useDesktopCloneStore()
const error = ref("")
const launching = ref("")
const launchResults = ref<Record<string, { ok: boolean; text: string }>>({})
const actionBusy = ref<CloneSendKeyAction | "">("")
const actionMessage = ref("")
const actionOk = ref(true)

watchCloneOverlay(() => props.open)

const panelRef = ref<HTMLElement | null>(null)

// 键盘可达：打开后把焦点交给面板，Escape 关闭
watch(
    () => props.open,
    async open => {
        if (!open) return
        await nextTick()
        panelRef.value?.focus()
    },
    { flush: "post" }
)

const ACTIONS: CloneSendKeyAction[] = ["switch-window", "show-desktop", "task-manager"]

function newProgramId(): string {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function persist(programs: CloneProgram[]) {
    error.value = ""
    try {
        await store.setPrograms(programs)
    } catch (cause) {
        error.value = t("desktop_clone.control.save_failed", { message: toCloneErrorMessage(cause) })
    }
}

function updateProgram(id: string, patch: Partial<CloneProgram>) {
    void persist(store.options.programs.map(program => (program.id === id ? { ...program, ...patch } : program)))
}

function removeProgram(id: string) {
    void persist(store.options.programs.filter(program => program.id !== id))
}

async function addProgram() {
    error.value = ""
    try {
        const picked = await openFileDialog({
            multiple: false,
            directory: false,
            filters: [{ name: "Programs", extensions: ["exe"] }],
        })
        if (typeof picked !== "string") return
        const baseName = picked.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || picked
        const program: CloneProgram = {
            id: newProgramId(),
            name: baseName,
            path: picked,
            args: "",
            elevated: false,
        }
        await persist([...store.options.programs, program])
    } catch (cause) {
        error.value = toCloneErrorMessage(cause)
    }
}

async function launch(program: CloneProgram) {
    if (launching.value) return
    launching.value = program.id
    try {
        await store.launchProgram(program.id)
        launchResults.value = { ...launchResults.value, [program.id]: { ok: true, text: t("desktop_clone.control.launched") } }
    } catch (cause) {
        launchResults.value = {
            ...launchResults.value,
            [program.id]: {
                ok: false,
                text: t("desktop_clone.control.launch_failed", { message: toCloneErrorMessage(cause) }),
            },
        }
    } finally {
        launching.value = ""
    }
}

async function sendAction(action: CloneSendKeyAction) {
    actionBusy.value = action
    actionMessage.value = ""
    try {
        const channel = await store.sendKeys(action)
        actionOk.value = !channel.includes("send-input")
        actionMessage.value = actionOk.value ? t("desktop_clone.control.done") : t("desktop_clone.control.degraded")
    } catch (cause) {
        actionOk.value = false
        actionMessage.value = toCloneErrorMessage(cause)
    } finally {
        actionBusy.value = ""
    }
}
</script>

<template>
    <div v-if="open" class="fixed inset-0 z-30" @click="emit('close')" />
    <div
        v-if="open"
        ref="panelRef"
        role="dialog"
        aria-modal="false"
        :aria-label="t('desktop_clone.control.title')"
        tabindex="-1"
        class="animate-ef-rise motion-reduce:animate-none absolute right-2 top-12 bottom-2 z-40 flex w-[min(560px,calc(100%-1rem))] flex-col rounded-xs border border-base-content/15 bg-base-100 shadow-xl outline-none"
        @keydown.esc.stop.prevent="emit('close')"
    >
        <div class="flex items-center justify-between gap-2 border-b border-base-content/10 px-3 py-2">
            <span class="text-sm font-semibold">{{ t("desktop_clone.control.title") }}</span>
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :title="t('desktop_clone.action.cancel')"
                :aria-label="t('desktop_clone.action.cancel')"
                @click="emit('close')"
            >
                <Icon icon="codicon:chrome-close" bold />
            </button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.control.programs") }}</span>
                <button type="button" class="btn btn-xs btn-outline" @click="addProgram">
                    <Icon icon="ri:add-line" class="size-3.5" />
                    {{ t("desktop_clone.control.add_program") }}
                </button>
            </div>

            <p v-if="!store.options.programs.length" class="rounded-xs border border-dashed border-base-content/15 px-2 py-3 text-center text-xs text-base-content/45">
                {{ t("desktop_clone.control.empty") }}
            </p>

            <div
                v-for="program in store.options.programs"
                :key="program.id"
                class="flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2"
            >
                <div class="flex items-center gap-2">
                    <input
                        class="input input-xs min-w-0 flex-1"
                        type="text"
                        :value="program.name"
                        :placeholder="t('desktop_clone.control.name')"
                        :aria-label="t('desktop_clone.control.name')"
                        @change="updateProgram(program.id, { name: ($event.target as HTMLInputElement).value.trim() })"
                    />
                    <button
                        type="button"
                        class="btn btn-xs btn-primary shrink-0"
                        :disabled="!store.connected || launching === program.id"
                        :title="store.connected ? t('desktop_clone.control.launch') : t('desktop_clone.control.not_connected')"
                        @click="launch(program)"
                    >
                        <span v-if="launching === program.id" class="loading loading-spinner loading-xs" />
                        <Icon v-else icon="ri:play-line" class="size-3.5" />
                        {{ t("desktop_clone.control.launch") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-square shrink-0 text-error"
                        :title="t('desktop_clone.control.remove')"
                        :aria-label="t('desktop_clone.control.remove')"
                        @click="removeProgram(program.id)"
                    >
                        <Icon icon="ri:delete-bin-line" class="size-3.5" />
                    </button>
                </div>
                <p class="truncate text-[11px] text-base-content/45" :title="program.path">{{ program.path }}</p>
                <input
                    class="input input-xs w-full"
                    type="text"
                    :value="program.args"
                    :placeholder="t('desktop_clone.control.args')"
                    :aria-label="t('desktop_clone.control.args')"
                    @change="updateProgram(program.id, { args: ($event.target as HTMLInputElement).value })"
                />
                <label class="flex items-center justify-between gap-2">
                    <span class="text-[11px] text-base-content/60">{{ t("desktop_clone.control.elevated") }}</span>
                    <input
                        type="checkbox"
                        class="toggle toggle-xs toggle-secondary"
                        :checked="program.elevated"
                        @change="updateProgram(program.id, { elevated: ($event.target as HTMLInputElement).checked })"
                    />
                </label>
                <p
                    v-if="launchResults[program.id]"
                    class="rounded-xs px-2 py-1 text-[11px]"
                    :class="launchResults[program.id].ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"
                >
                    {{ launchResults[program.id].text }}
                </p>
            </div>

            <div class="mt-1 flex flex-col gap-2 border-t border-base-content/10 pt-3">
                <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.control.actions") }}</span>
                <div class="grid grid-cols-3 gap-1.5">
                    <button
                        v-for="action in ACTIONS"
                        :key="action"
                        type="button"
                        class="btn btn-xs btn-outline"
                        :disabled="actionBusy !== ''"
                        @click="sendAction(action)"
                    >
                        <span v-if="actionBusy === action" class="loading loading-spinner loading-xs" />
                        {{ t(`desktop_clone.control.${action.replace("-", "_")}`) }}
                    </button>
                </div>
                <p v-if="actionMessage" class="text-[11px]" :class="actionOk ? 'text-success' : 'text-warning'">{{ actionMessage }}</p>
            </div>

            <p v-if="error" class="rounded-xs border border-error/30 bg-error/10 px-2 py-1 text-[11px] text-error">{{ error }}</p>
        </div>
    </div>
</template>
