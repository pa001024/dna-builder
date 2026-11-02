<script setup lang="ts">
import { watch } from "vue"

defineProps<{
    title?: string
    description?: string | string[]
    error?: string
    /** 宽版弹窗（规则编辑器这类内容多的表单用，默认窄版）。 */
    wide?: boolean
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
            <DialogOverlay class="bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow fixed inset-0 z-30" />
            <DialogContent
                class="data-[state=open]:animate-contentShow fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-100/70 shadow-lg backdrop-blur-md"
                :class="wide ? 'w-[90vw] max-w-3xl' : 'w-[90vw] max-w-112.5'"
            >
                <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="$emit('submit')">
                    <div class="shrink-0 border-b border-base-content/10 px-3 pt-3 pb-2 sm:px-4">
                        <DialogTitle v-if="title" class="text-base font-semibold text-base-content">
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

                    <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3 sm:px-4">
                        <div v-if="error" class="text-error text-sm animate-shake">
                            {{ error }}
                        </div>

                        <slot name="content" />
                    </div>
                    <div class="shrink-0 border-t border-base-content/10 px-3 py-3 sm:px-4">
                        <slot name="actions">
                            <div class="flex justify-end gap-2">
                                <button class="btn btn-primary w-full" type="submit">
                                    {{ $t("setting.confirm") }}
                                </button>
                            </div>
                        </slot>
                    </div>
                </form>
                <DialogClose
                    class="absolute top-2.5 right-2.5 z-10 cursor-pointer rounded-xs border border-base-content/20 bg-base-100/80 p-1 text-base-content/60 backdrop-blur transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                    aria-label="close"
                >
                    <Icon icon="radix-icons:cross2" class="block size-3.5" />
                </DialogClose>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
