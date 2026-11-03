<script lang="ts" setup>
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui"
import { ref } from "vue"

withDefaults(
    defineProps<{
        tooltip: string
        side?: "top" | "right" | "bottom" | "left"
    }>(),
    {
        side: "top",
    }
)
const forceOpen = ref(false)
</script>

<template>
    <TooltipProvider>
        <TooltipRoot :delay-duration="100" :open="forceOpen ? true : undefined">
            <TooltipTrigger as-child @touchstart.passive="forceOpen = true" @touchend.passive="forceOpen = false">
                <slot />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    class="z-10000 max-w-80 rounded-xs border border-base-content/15 bg-base-100/85 px-3 py-2 text-[13px] leading-tight text-base-content shadow-lg backdrop-blur-md select-none will-change-[transform,opacity] data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade"
                    :side-offset="5"
                    :side="side"
                >
                    <div class="whitespace-pre-wrap">
                        {{ tooltip }}
                    </div>
                    <TooltipArrow class="fill-base-100/85" :width="8" />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
