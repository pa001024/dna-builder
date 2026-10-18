<script lang="ts" setup>
// 来源详情弹窗：统一 db 设计语言的模态容器（半透明毛玻璃 + 直角细边框）
// 不内置标题头：由插槽内容的档案头自行承担标题展示，避免重复
const open = defineModel<boolean>({ default: false })
</script>

<template>
    <DialogRoot :open="open" @update:open="open = $event">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow" />
            <DialogContent
                class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[90vw] max-w-3xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-100/70 shadow-lg backdrop-blur-md data-[state=open]:animate-contentShow"
            >
                <!-- 内容区（半透明，透出底图/桌面） -->
                <div class="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    <slot />
                </div>
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
