<script lang="ts" setup>
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "radix-vue"
defineProps<{
    side: "top" | "right" | "bottom" | "left"
}>()
</script>

<template>
    <TooltipProvider>
        <TooltipRoot :delayDuration="100">
            <TooltipTrigger asChild>
                <slot />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    class="z-10000 bg-base-100 shadow-lg shadow-base-content/20 px-[15px] py-2.5 text-[15px] data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none rounded-sm leading-none will-change-[transform,opacity]"
                    :side-offset="5"
                    :side="side"
                >
                    <slot name="tooltip" />
                    <TooltipArrow class="fill-base-100" :width="8" />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
