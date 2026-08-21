<script setup lang="ts">
defineProps<{
    /** 板块在可见序列中的位置（从 1 开始），用于序号徽标 */
    num: number
    /** 板块英文标签（装饰性大写，如 MODULES） */
    label: string
    /** 板块标题的 i18n 键 */
    titleKey: string
    /** 是否处于编辑模式（显示排序/显隐控件） */
    editing?: boolean
    /** 是否为其所在列的可见板块中的第一个 */
    isFirst?: boolean
    /** 是否为其所在列的可见板块中的最后一个 */
    isLast?: boolean
    /** 标题行右侧的计数文本（非编辑模式，优先级低于 actionLabel） */
    count?: string
    /** 标题行右侧的操作按钮文本（非编辑模式，提供时替代 count） */
    actionLabel?: string
}>()

const emit = defineEmits<{
    "move-up": []
    "move-down": []
    hide: []
    action: []
}>()
</script>

<template>
    <!-- 板块头：序号 + 英文标签 + 标题 + 分隔线 + 计数/编辑控件 -->
    <div class="mb-4 flex items-center gap-3.5 animate-ef-rise motion-reduce:animate-none">
        <span
            class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
        >
            {{ String(num).padStart(2, "0") }}
        </span>
        <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">{{ label }}</span>
        <span class="text-[17px] font-semibold text-base-content">{{ $t(titleKey) }}</span>
        <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />

        <!-- 编辑模式：上移 / 下移 / 隐藏 -->
        <div v-if="editing" class="flex items-center gap-1.5">
            <button
                type="button"
                class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/15 text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                :disabled="isFirst"
                :title="$t('home.moveUp')"
                :aria-label="$t('home.moveUp')"
                @click="emit('move-up')"
            >
                <Icon icon="ri:arrow-up-line" class="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/15 text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                :disabled="isLast"
                :title="$t('home.moveDown')"
                :aria-label="$t('home.moveDown')"
                @click="emit('move-down')"
            >
                <Icon icon="ri:arrow-down-line" class="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/15 text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error"
                :title="$t('home.hideSection')"
                :aria-label="$t('home.hideSection')"
                @click="emit('hide')"
            >
                <Icon icon="ri:eye-off-line" class="h-3.5 w-3.5" />
            </button>
        </div>

        <!-- 非编辑模式：操作按钮（优先） -->
        <button
            v-else-if="actionLabel"
            type="button"
            class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2.5 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
            @click="emit('action')"
        >
            <Icon icon="ri:settings-3-line" class="h-3.5 w-3.5" />
            {{ actionLabel }}
        </button>
        <!-- 非编辑模式：计数文本 -->
        <span v-else-if="count" class="text-[11px] font-medium text-base-content/50">{{ count }}</span>
    </div>
</template>
