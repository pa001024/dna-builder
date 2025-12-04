<script lang="ts" setup>
defineProps<{ id: string }>()
</script>

<template>
    <GQQuery
        :query="`query ($id: String!) {
    user(id: $id) {
        id, name, qq
    }
}`"
        :variables="{ id }"
        requestPolicy="cache-first"
        v-slot="{ data }"
    >
        <div v-if="data" class="flex group bg-primary items-center rounded-full px-1">
            <QQAvatar class="size-6 my-1" :name="data.user.name" :qq="data.user.qq" />
            <div
                class="flex text-sm text-base-100 max-w-0 group-hover:max-w-24 group-hover:mx-1 overflow-hidden transition-all duration-500 whitespace-nowrap"
            >
                {{ data.user.name }}
            </div>
        </div>
    </GQQuery>
</template>
