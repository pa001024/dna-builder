<script lang="ts" setup></script>

<template>
    <ContextMenuRoot>
        <ContextMenuTrigger as-child>
            <div v-bind="$attrs">
                <slot />
            </div>
        </ContextMenuTrigger>
        <ContextMenuPortal>
            <ContextMenuContent
                class="min-w-[220px] z-30 bg-base-100/80 outline-none rounded-lg p-2 shadow-lg will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
            >
                <slot name="menu" />
            </ContextMenuContent>
        </ContextMenuPortal>
    </ContextMenuRoot>
</template>
