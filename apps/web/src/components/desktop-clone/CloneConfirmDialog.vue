<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { ref, watch } from "vue"
import { watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 克隆窗口的通用确认弹层：关闭确认与重连确认共用。
 *
 * 原生 RDP 子窗口盖在网页上方，弹层打开期间必须让后端隐藏它；
 * `watchCloneOverlay` 按引用计数处理嵌套弹层，不会互相提前恢复。
 */
const props = defineProps<{
    open: boolean
    title: string
    message: string
    confirmText: string
    altText?: string
    cancelText?: string
    busy?: boolean
    danger?: boolean
}>()

const emit = defineEmits<{
    confirm: []
    alt: []
    cancel: []
}>()

const { t } = useTranslation()
const dialogRef = ref<HTMLDialogElement | null>(null)

watch(
    () => props.open,
    open => {
        const dialog = dialogRef.value
        if (!dialog) return
        if (open && !dialog.open) dialog.showModal()
        else if (!open && dialog.open) dialog.close()
    },
    { flush: "post" }
)

watchCloneOverlay(() => props.open)

function onCancel() {
    if (props.busy) return
    emit("cancel")
}

function onBackdrop(event: MouseEvent) {
    if (event.target === dialogRef.value) onCancel()
}
</script>

<template>
    <dialog ref="dialogRef" class="modal" @cancel.prevent="onCancel" @click="onBackdrop">
        <div class="modal-box max-w-md rounded-xs border border-base-content/10 bg-base-100">
            <h3 class="text-base font-semibold">{{ title }}</h3>
            <p class="mt-2 whitespace-pre-line text-sm text-base-content/70">{{ message }}</p>
            <div class="modal-action flex-wrap gap-2">
                <button class="btn btn-sm btn-ghost" :disabled="busy" @click="emit('cancel')">
                    {{ cancelText || t("desktop_clone.action.cancel") }}
                </button>
                <button v-if="altText" class="btn btn-sm btn-outline" :disabled="busy" @click="emit('alt')">{{ altText }}</button>
                <button
                    class="btn btn-sm"
                    :class="danger ? 'btn-error' : 'btn-primary'"
                    :disabled="busy"
                    @click="emit('confirm')"
                >
                    <span v-if="busy" class="loading loading-spinner loading-xs" />
                    {{ confirmText }}
                </button>
            </div>
        </div>
    </dialog>
</template>
