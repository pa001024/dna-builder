<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import { watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 子会话登录凭据对话框。
 *
 * 密码只存在于本组件的内存 ref 中：关闭、提交成功、组件卸载都会清空，
 * 不写 localStorage、不打印、不进入任何持久化结构。
 */
const props = defineProps<{
    open: boolean
    usernameHint: string
    busy?: boolean
    error?: string
}>()

const emit = defineEmits<{
    submit: [username: string, password: string]
    cancel: []
}>()

const { t } = useTranslation()
const dialogRef = ref<HTMLDialogElement | null>(null)
const username = ref("")
const password = ref("")
const usernameInput = ref<HTMLInputElement | null>(null)

function clearPassword() {
    password.value = ""
}

watch(
    () => props.open,
    async open => {
        const dialog = dialogRef.value
        if (!dialog) return
        if (open) {
            username.value = props.usernameHint
            clearPassword()
            if (!dialog.open) dialog.showModal()
            await nextTick()
            usernameInput.value?.focus()
            usernameInput.value?.select()
        } else {
            clearPassword()
            if (dialog.open) dialog.close()
        }
    },
    { flush: "post" }
)

watchCloneOverlay(() => props.open)

function submit() {
    if (props.busy) return
    emit("submit", username.value.trim(), password.value)
}

function cancel() {
    if (props.busy) return
    clearPassword()
    emit("cancel")
}

function onBackdrop(event: MouseEvent) {
    if (event.target === dialogRef.value) cancel()
}

onBeforeUnmount(clearPassword)
</script>

<template>
    <dialog ref="dialogRef" class="modal" @cancel.prevent="cancel" @click="onBackdrop">
        <form class="modal-box max-w-sm rounded-xs border border-base-content/10 bg-base-100" @submit.prevent="submit">
            <h3 class="text-base font-semibold">{{ t("desktop_clone.credentials.title") }}</h3>
            <p class="mt-1 text-xs text-base-content/60">{{ t("desktop_clone.credentials.description") }}</p>
            <label class="mt-4 flex flex-col gap-1">
                <span class="text-xs text-base-content/70">{{ t("desktop_clone.credentials.username") }}</span>
                <input
                    ref="usernameInput"
                    v-model="username"
                    class="input input-sm w-full"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="t('desktop_clone.credentials.username_hint')"
                />
            </label>
            <label class="mt-3 flex flex-col gap-1">
                <span class="text-xs text-base-content/70">{{ t("desktop_clone.credentials.password") }}</span>
                <input
                    v-model="password"
                    class="input input-sm w-full"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="t('desktop_clone.credentials.password_hint')"
                />
            </label>
            <p v-if="error" class="mt-3 rounded-xs border border-error/30 bg-error/10 px-2 py-1.5 text-xs text-error">
                {{ error }}
            </p>
            <div class="modal-action">
                <button type="button" class="btn btn-sm btn-ghost" :disabled="busy" @click="cancel">
                    {{ t("desktop_clone.action.cancel") }}
                </button>
                <button type="submit" class="btn btn-sm btn-primary" :disabled="busy">
                    <span v-if="busy" class="loading loading-spinner loading-xs" />
                    {{ t("desktop_clone.credentials.submit") }}
                </button>
            </div>
        </form>
    </dialog>
</template>
