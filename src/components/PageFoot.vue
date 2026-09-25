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
    <div class="flex justify-between items-center p-4 border-t border-base-300">
        <div class="text-sm text-base-content/70">
            显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, count) }} 条，共 {{ count }} 条记录
        </div>
        <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" :disabled="page <= 1" @click="$emit('update:page', page - 1)">{{ $t('page-foot.prev_page') }}</button>
            <input
                :value="page"
                type="number"
                min="1"
                :max="totalPages"
                @blur="$emit('update:page', page)"
                class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
            />
            <button class="btn btn-sm btn-outline" :disabled="page >= totalPages" @click="$emit('update:page', page + 1)">{{ $t('page-foot.next_page') }}</button>
        </div>
    </div>
</template>
