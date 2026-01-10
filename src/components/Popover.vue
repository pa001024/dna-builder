<script lang="ts" setup>
defineProps<{
    title?: string
    side?: "top" | "right" | "bottom" | "left"
    sideOffset?: number
    noconfirm?: boolean
}>()
const emit = defineEmits(["close", "confirm"])
const model = defineModel<boolean>()
</script>

<template>
    <PopoverRoot v-model:open="model">
        <PopoverTrigger v-bind="$attrs" :aria-label="title">
            <slot />
        </PopoverTrigger>

        <PopoverPortal>
            <PopoverContent
                :side="side ?? 'bottom'"
                :side-offset="sideOffset ?? 5"
                style="z-index: 20"
                class="rounded p-2 w-80 bg-base-100 shadow-lg will-change-[transform,opacity] data-[state=open]:data-[side=top]:animate-slideDownAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade"
            >
                <div class="flex flex-col justify-center">
                    <div v-if="title" class="flex justify-between items-center">
                        <p class="text-base-content/70 text-sm font-semibold m-2">
                            {{ title }}
                        </p>

                        <div class="controls">
                            <PopoverClose
                                v-if="!noconfirm"
                                class="btn btn-ghost btn-square btn-sm"
                                aria-label="Close"
                                @click="emit('confirm')"
                            >
                                <Icon icon="radix-icons:check" />
                            </PopoverClose>
                            <PopoverClose class="btn btn-ghost btn-square btn-sm" aria-label="Close" @click="emit('close')">
                                <Icon icon="radix-icons:cross2" />
                            </PopoverClose>
                        </div>
                    </div>
                    <slot name="content" />
                </div>
                <PopoverArrow class="fill-base-100" />
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
