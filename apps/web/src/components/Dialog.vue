<script setup lang="ts">
import { watch } from "vue"

defineProps<{
    title?: string
    description?: string | string[]
    error?: string
}>()

const emit = defineEmits(["close", "submit"])
const model = defineModel<boolean>()
watch(model, value => {
    if (!value) {
        emit("close")
    }
})
</script>

<template>
    <DialogRoot v-model:open="model">
        <DialogTrigger v-bind="$attrs">
            <slot />
        </DialogTrigger>
        <DialogPortal>
            <DialogOverlay class="bg-gray-900/50 data-[state=open]:animate-overlayShow fixed inset-0 z-30" />
            <DialogContent
                class="data-[state=open]:animate-contentShow fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[90vw] max-w-112.5 translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg bg-base-100 shadow-lg"
            >
                <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="$emit('submit')">
                    <div class="shrink-0 p-6 pb-3">
                        <DialogTitle v-if="title" class="text-lg text-base-content font-semibold">
                            {{ title }}
                        </DialogTitle>
                        <DialogDescription v-if="description" class="mt-2 text-base-content/60 text-sm">
                            <ul v-if="Array.isArray(description)" class="list-disc list-inside">
                                <template v-for="item in description" :key="item">
                                    <li>{{ item }}</li>
                                </template>
                            </ul>
                            <p v-else>
                                {{ description }}
                            </p>
                        </DialogDescription>
                    </div>

                    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                        <div v-if="error" class="text-error text-sm animate-shake">
                            {{ error }}
                        </div>

                        <slot name="content" />
                    </div>
                    <div class="shrink-0 border-t border-base-300 bg-base-100 px-6 py-4">
                        <slot name="actions">
                            <div class="flex justify-end gap-2">
                                <button class="btn btn-primary w-full" type="submit">
                                    {{ $t("setting.confirm") }}
                                </button>
                            </div>
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
