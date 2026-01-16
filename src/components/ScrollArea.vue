<script lang="ts" setup>
import { onMounted, Ref, ref } from "vue"

defineProps({
    vertical: {
        type: Boolean,
        default: true,
    },
    horizontal: {
        type: Boolean,
        default: false,
    },
})

const rootRef = ref<{ viewportElement: Ref<HTMLDivElement> } | null>(null)
const emit = defineEmits(["loadref"])

onMounted(() => {
    emit("loadref", rootRef.value!.viewportElement)
})
</script>

<template>
    <ScrollAreaRoot class="overflow-hidden" style="--scrollbar-size: 10px">
        <ScrollAreaViewport ref="rootRef" class="w-full h-full focus-visible:outline-none">
            <slot />
        </ScrollAreaViewport>
        <ScrollAreaScrollbar
            v-if="vertical"
            class="flex select-none touch-none p-0.5 transition-colors duration-160 ease-out hover:bg-blackA1 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
            orientation="vertical"
        >
            <ScrollAreaThumb
                class="flex-1 bg-gray-500/30 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-11 before:min-h-11"
            />
        </ScrollAreaScrollbar>
        <ScrollAreaScrollbar
            v-if="horizontal"
            class="flex select-none touch-none p-0.5 transition-colors duration-160 ease-out hover:bg-blackA1 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
            orientation="horizontal"
        >
            <ScrollAreaThumb
                class="flex-1 bg-gray-500/30 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-11 before:min-h-11"
            />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>

<style lang="css">
[data-radix-scroll-area-viewport] > div {
    min-height: 100%;
}
</style>
