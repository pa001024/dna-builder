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
                    class="z-10000 bg-base-100 shadow-lg shadow-base-content/20 px-3.75 py-2.5 text-[15px] data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none rounded-sm leading-none will-change-[transform,opacity]"
                    :side-offset="5"
                    :side="side"
                >
                    <div class="whitespace-pre-wrap">
                        {{ tooltip }}
                    </div>
                    <TooltipArrow class="fill-base-100" :width="8" />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
