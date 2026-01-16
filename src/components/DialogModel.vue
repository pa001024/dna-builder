<script setup lang="ts">
const show = defineModel<boolean>()
const emit = defineEmits<{
    submit: []
}>()
function submit() {
    show.value = false
    emit("submit")
}
</script>

<template>
    <dialog class="modal" :class="{ 'modal-open': show }">
        <div class="modal-box">
            <slot></slot>
            <div class="modal-action">
                <form class="flex justify-end gap-2" method="dialog">
                    <slot name="action">
                        <button class="btn btn-primary" @click="submit">确定</button>
                    </slot>
                </form>
            </div>
        </div>
        <div class="modal-backdrop" @click="show = false" />
    </dialog>
</template>
