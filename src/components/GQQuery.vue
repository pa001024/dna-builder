<script
    lang="ts"
    setup
    generic="T extends { (...args: any[]): any; raw: string }, V extends T extends (variables: infer V) => any ? V : never"
>
import { gql, useQuery } from "@urql/vue"
import { computed, watch } from "vue"
import { extractType } from "@/api/query"

interface Props {
    query: T
    variables: V
    requestPolicy?: "cache-first" | "cache-only" | "network-only" | "cache-and-network"
    dataKey?: string
    limit?: number
    offset?: number
}

const props = defineProps<Props>()

const variables = computed(() => {
    return Object.assign({}, props.variables, { limit: props.limit, offset: props.offset })
})

const dataKey = computed(() => props.dataKey || extractType(props.query.raw))

const { data, fetching, stale } = useQuery({
    query: gql(props.query.raw),
    variables,
    requestPolicy: props.requestPolicy || "cache-and-network",
})
const emit = defineEmits(["load", "end"])

watch(data, newVal => {
    if (newVal) {
        emit("load")
    }
    if (dataKey.value && newVal?.[dataKey.value]?.length < (props.limit ?? 1)) {
        emit("end")
    }
})

defineSlots<{
    default: (props: { data: Awaited<ReturnType<T>>; fetching: boolean; stale: boolean }) => void
}>()
</script>

<template>
    <slot :data="data?.[dataKey]" :fetching="fetching" :stale="stale"></slot>
</template>
