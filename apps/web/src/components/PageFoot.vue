<script setup lang="ts">
defineProps<{
    page: number
    pageSize: number
    totalPages: number
    count: number
}>()

defineEmits<{
    "update:page": [page: number]
}>()
</script>
<template>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-base-content/10 px-1 py-2.5">
        <span class="text-[11px] text-base-content/45">
            显示
            <b class="font-orbitron font-semibold text-base-content/80 tabular-nums">{{ count === 0 ? 0 : (page - 1) * pageSize + 1 }}</b>
            –
            <b class="font-orbitron font-semibold text-base-content/80 tabular-nums">{{
                Math.min(page * pageSize, count)
            }}</b>
            条，共
            <b class="font-orbitron font-semibold text-base-content/80 tabular-nums">{{ count }}</b>
            条
        </span>
        <div class="ml-auto flex items-center gap-1">
            <button
                class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-base-content/10 disabled:text-base-content/20"
                :disabled="page <= 1"
                @click="$emit('update:page', page - 1)"
            >
                <Icon icon="ri:arrow-left-s-line" :size="14" />
            </button>
            <span class="flex items-center gap-1 px-1 text-[11px] text-base-content/40">
                <input
                    :value="page"
                    type="number"
                    min="1"
                    :max="totalPages"
                    class="w-10 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-center font-orbitron text-[11px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                    @blur="$emit('update:page', Number(($event.target as HTMLInputElement).value) || 1)"
                />
                <span class="tabular-nums">/ {{ totalPages }}</span>
            </span>
            <button
                class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:border-base-content/10 disabled:text-base-content/20"
                :disabled="page >= totalPages"
                @click="$emit('update:page', page + 1)"
            >
                <Icon icon="ri:arrow-right-s-line" :size="14" />
            </button>
        </div>
    </div>
</template>
