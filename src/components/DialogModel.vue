<script setup lang="ts">
const show = defineModel<boolean>()
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{
    submit: []
}>()
function submit() {
    show.value = false
    emit("submit")
}
</script>

<template>
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': show }">
            <div class="modal-box" v-bind="$attrs">
                <slot></slot>
                <div class="modal-action">
                    <form class="flex justify-end gap-2 w-full" method="dialog">
                        <slot name="action">
                            <button class="btn btn-primary" @click="submit">确定</button>
                        </slot>
                    </form>
                </div>
            </div>
            <div class="modal-backdrop" @click="show = false" />
        </dialog>
    </Teleport>
</template>
