<script setup lang="ts">
import { watch } from "vue"

defineProps<{
    title?: string
    description?: string | string[]
    error?: string
}>()

const emit = defineEmits(["close", "submit"])
const model = defineModel<boolean>()
watch(model, (value) => {
    if (!value) {
        emit("close")
    }
})
</script>

<template>
    <DialogRoot v-model:open="model">
        <DialogTrigger v-bind="$attrs">
            <slot></slot>
        </DialogTrigger>
        <DialogPortal>
            <DialogOverlay class="bg-gray-900/50 data-[state=open]:animate-overlayShow fixed inset-0 z-30" />
            <DialogContent
                class="data-[state=open]:animate-contentShow fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[450px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-base-100 shadow-lg z-100"
            >
                <form class="p-6" @submit.prevent="$emit('submit')">
                    <div class="flex flex-col p-6 gap-2.5">
                        <DialogTitle v-if="title" class="text-lg text-base-content font-semibold">{{ title }}</DialogTitle>
                        <DialogDescription v-if="description" class="text-base-content/60 text-sm">
                            <ul v-if="Array.isArray(description)" class="list-disc list-inside">
                                <template v-for="item in description" :key="item">
                                    <li>{{ item }}</li>
                                </template>
                            </ul>
                            <p v-else>{{ description }}</p>
                        </DialogDescription>
                    </div>

                    <div class="space-y-4 p-6">
                        <div class="text-error text-sm animate-shake" v-if="error">{{ error }}</div>

                        <slot name="content"></slot>
                    </div>
                    <div class="flex justify-end p-6">
                        <slot name="actions">
                            <button class="btn btn-primary w-full" type="submit">
                                {{ $t("setting.confirm") }}
                            </button>
                        </slot>
                    </div>
                </form>
                <DialogClose class="btn btn-square btn-sm text-lg btn-ghost absolute top-2.5 right-2.5">
                    <Icon icon="radix-icons:cross2" />
                </DialogClose>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
