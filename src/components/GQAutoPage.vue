<script
    lang="ts"
    setup
    generic="T extends { (...args: any[]): any; raw: string }, V extends T extends (variables: infer V) => any ? V : never"
>
import { until, useInfiniteScroll } from "@vueuse/core"
import { computed, nextTick, onMounted, Ref, ref, watch } from "vue"

const props = defineProps<{
    distance?: number
    direction?: "top" | "bottom"
    limit?: number
    offset?: number
    innerClass?: string
    query: T
    variables: V
    dataKey?: string
    requestPolicy?: "cache-first" | "cache-only" | "network-only" | "cache-and-network"
}>()

defineSlots<{
    default: (props: { data: Awaited<ReturnType<T>>; fetching: boolean; stale: boolean }) => void
}>()

const el = ref<HTMLElement | null>(null)
useInfiniteScroll(el, getNextPage, { distance: props.distance ?? 20, direction: props.direction ?? "bottom" })

const pages: Ref<{ limit: number; offset: number; loaded: boolean }[]> = ref([])
const end = ref(true)
const loading = ref(true)
const fixedOffset = computed(() => {
    const limit = props.limit ?? 10
    const offset = props.offset ?? 0
    const isTop = props.direction === "top"
    // 返回一个能被整除的数
    if (isTop) return offset - (offset % limit || limit)
    return offset - (offset % limit)
})

if (props.direction === "top")
    watch(fixedOffset, offset => {
        const limit = props.limit ?? 10
        console.debug("fixedOffset", offset - limit)
        pages.value.push({
            limit,
            offset: offset,
            loaded: false,
        })
    })

async function getNextPage() {
    if (loading.value) return
    const limit = props.limit ?? 10
    const isTop = props.direction === "top"
    if (isTop) {
        if (fixedOffset.value - pages.value.length * limit < 0) return
    } else if (end.value) return
    loading.value = true
    const oriHeight = el.value?.scrollHeight
    const offset = isTop ? fixedOffset.value - pages.value.length * limit : fixedOffset.value + pages.value.length * limit
    pages.value[isTop ? "unshift" : "push"]({
        limit,
        offset,
        loaded: false,
    })
    console.debug(`[GQAutoPage] getNextPage(${props.dataKey}) page=${pages.value.length} offset=${offset}`)
    await until(() => pages.value[pages.value.length - 1].loaded).toBe(true)
    loading.value = false
    if (isTop && oriHeight) {
        await nextTick()
        el.value!.scrollTop = el.value!.scrollHeight - oriHeight
        await nextTick()
    }
}

async function ready() {
    await nextTick()
    if (props.direction === "top") {
        el.value?.scrollTo({
            top: el.value.scrollHeight,
            left: 0,
            // behavior: "smooth",
        })
    }
}

reload()
async function reload() {
    pages.value = []
    loading.value = false
    end.value = false
    await nextTick()
    while (!end.value) {
        await getNextPage()
        if (props.direction === "top") {
            if (pages.value[0].offset === 0) break
        }
        if (el.value!.scrollHeight >= el.value!.offsetHeight) break
    }
    ready()
}

const emit = defineEmits(["load", "loadref"])
onMounted(() => {
    emit("load", reload)
})
watch(el, newVal => {
    emit("loadref", newVal)
})
</script>

<template>
    <ScrollArea @loadref="r => (el = r)">
        <div :class="innerClass">
            <div v-if="loading && direction === 'top'" class="flex justify-center items-center p-2">
                <span class="loading loading-spinner loading-md"></span>
            </div>
            <GQQuery
                v-for="(page, index) in pages"
                :key="index"
                v-slot="{ data, fetching, stale }"
                :query="query"
                :variables="variables"
                :limit="page.limit"
                :offset="page.offset"
                :data-key="dataKey"
                @load="pages[index].loaded = true"
                @end="end = direction === 'top' ? pages.length > 1 : true"
            >
                <slot :data="data" :fetching="fetching" :stale="stale"></slot>
            </GQQuery>
            <div v-if="loading && direction !== 'top'" class="flex justify-center items-center p-2">
                <span class="loading loading-spinner loading-md"></span>
            </div>
        </div>
    </ScrollArea>
</template>
