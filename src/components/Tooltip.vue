<script lang="ts" setup>
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "radix-vue"
defineProps<{
    tooltip: string
    side: "top" | "right" | "bottom" | "left"
}>()
</script>

<template>
    <TooltipProvider>
        <TooltipRoot>
            <TooltipTrigger asChild>
                <slot />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    class="z-1000 data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none rounded-sm bg-white px-[15px] py-2.5 text-[15px] leading-none shadow-[hsl(206_22%_7%/35%)_0px_10px_38px_-10px,hsl(206_22%_7%/20%)_0px_10px_20px_-15px] will-change-[transform,opacity]"
                    :side-offset="5"
                    :side="side"
                >
                    <div class="whitespace-pre-wrap">
                        {{ tooltip }}
                    </div>
                    <TooltipArrow class="fill-white" :width="8" />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
