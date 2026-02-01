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
            <button class="btn btn-sm btn-outline" :disabled="page <= 1" @click="$emit('update:page', page - 1)">上一页</button>
            <input
                :value="page"
                type="number"
                min="1"
                :max="totalPages"
                @blur="$emit('update:page', page)"
                class="input input-bordered input-sm w-20"
            />
            <button class="btn btn-sm btn-outline" :disabled="page >= totalPages" @click="$emit('update:page', page + 1)">下一页</button>
        </div>
    </div>
</template>
