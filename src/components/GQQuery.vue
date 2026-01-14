<script lang="ts" setup>
import { gql, useQuery } from "@urql/vue"
import { computed, watch } from "vue"
const props = defineProps<{
    query: string
    variables: any
    requestPolicy?: "cache-first" | "cache-only" | "network-only" | "cache-and-network"
    dataKey?: string
    limit?: number
    offset?: number
}>()

const variables = computed(() => {
    return Object.assign({}, props.variables, { limit: props.limit, offset: props.offset })
})

const { data, fetching, stale } = useQuery({
    query: gql(props.query),
    variables,
    requestPolicy: props.requestPolicy || "cache-and-network",
})
const emit = defineEmits(["load", "end"])

watch(data, newVal => {
    if (newVal) {
        emit("load")
    }
    if (props.dataKey && newVal?.[props.dataKey]?.length < (props.limit ?? 1)) {
        emit("end")
    }
})

defineSlots<{
    default: (props: { data: any; fetching: boolean; stale: boolean }) => any
}>()
</script>

<template>
    <slot :data="data" :fetching="fetching" :stale="stale"></slot>
</template>
