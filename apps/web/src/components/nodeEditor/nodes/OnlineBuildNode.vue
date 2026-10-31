<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { buildsQuery } from "@/api/graphql"
import { charMap, LeveledCharHelper } from "@/data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const options = ref<{ id: string; title: string; desc: string; author: string; charId: number; charSettings: string }[]>([])
const loading = ref(false)
const loadError = ref("")

const selectedId = computed(() => (typeof props.data.buildId === "string" ? props.data.buildId : ""))

/** 读取连接到「角色过滤」端口的角色；未连接时返回 null */
const filterChar = computed(() => {
    const edge = store.edges.find(item => item.target === props.id && item.targetHandle === "char")
    if (!edge) return null
    const node = store.nodes.find(item => item.id === edge.source)
    const name = typeof node?.data.charName === "string" ? node.data.charName : ""
    const explicitId = Number(node?.data.charId)
    const char = explicitId > 0 ? charMap.get(explicitId) : charMap.get(name)
    if (char) return { id: char.id, name: char.名称 }
    return name ? { id: 0, name } : null
})

const filterIcon = computed(() => (filterChar.value?.id ? LeveledCharHelper.idToUrl(filterChar.value.id) : ""))

let requestId = 0

/** 拉取在线构筑列表；连接角色输入时只请求该角色的构筑 */
async function loadBuilds() {
    const current = ++requestId
    loading.value = true
    loadError.value = ""
    try {
        const charId = filterChar.value?.id && filterChar.value.id > 0 ? filterChar.value.id : undefined
        const result = await buildsQuery({ charId, limit: 200, offset: 0 }, { requestPolicy: "network-only" })
        if (current !== requestId) return
        options.value = (result || []).map(build => ({
            id: build.id,
            title: build.title,
            desc: build.desc ?? "",
            author: build.user?.name ?? "",
            charId: build.charId,
            charSettings: build.charSettings,
        }))
        // 角色过滤变化后，原选项可能已不在列表中：清空选择，避免输出其他角色的构筑
        if (selectedId.value && !options.value.some(build => build.id === selectedId.value)) {
            store.updateNodeData(props.id, {
                buildId: "",
                title: "",
                desc: "",
                author: "",
                charId: undefined,
                charSettings: undefined,
                error: undefined,
            })
        }
    } catch (error) {
        if (current !== requestId) return
        loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
        if (current === requestId) loading.value = false
    }
}

/** 选择构筑：保存标题/描述与原始配置，节点输出构筑由 store 计算 */
function selectBuild(id: string) {
    const build = options.value.find(item => item.id === id)
    if (!build) return
    store.updateNodeData(props.id, {
        buildId: build.id,
        title: build.title,
        desc: build.desc,
        author: build.author,
        charId: build.charId,
        charSettings: build.charSettings,
        error: undefined,
    })
}

watch(
    () => filterChar.value?.id,
    () => loadBuilds()
)

onMounted(loadBuilds)
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-80 max-w-full space-y-1.5">
            <!-- 角色过滤：由角色输入节点的 CHAR 端口提供 -->
            <div class="flex items-center gap-1.5 border border-base-content/10 bg-base-content/3 px-1.5 py-1">
                <Icon icon="ri:user-line" class="size-3.5 shrink-0 text-base-content/40" />
                <template v-if="filterChar">
                    <img v-if="filterIcon" :src="filterIcon" :alt="filterChar.name" class="size-4 shrink-0 object-cover object-top" />
                    <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/75">{{ filterChar.name }}</span>
                    <span class="shrink-0 text-[10px] text-primary">仅此角色</span>
                </template>
                <span v-else class="min-w-0 flex-1 truncate text-[11px] text-base-content/40">未连接角色输入，显示全部构筑</span>
            </div>

            <div class="flex items-center gap-1">
                <Select
                    :model-value="selectedId"
                    class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    placeholder="选择在线构筑"
                    :disabled="loading || options.length === 0"
                    @update:model-value="selectBuild"
                >
                    <SelectItem v-for="build in options" :key="build.id" :value="build.id">
                        {{ build.title }}
                    </SelectItem>
                </Select>
                <button
                    type="button"
                    class="grid size-6 shrink-0 cursor-pointer place-items-center border border-base-content/10 text-base-content/50 transition-colors duration-150 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="loading"
                    title="刷新列表"
                    @click="loadBuilds"
                >
                    <Icon icon="ri:refresh-line" class="size-3" :class="loading ? 'animate-spin' : ''" />
                </button>
            </div>

            <div v-if="loadError" class="break-all text-[11px] text-error">{{ loadError }}</div>
            <div v-else-if="loading && options.length === 0" class="px-1 py-2 text-center text-[11px] text-base-content/40">正在加载在线构筑…</div>
            <div v-else-if="options.length === 0" class="px-1 py-2 text-center text-[11px] text-base-content/40">
                {{ filterChar ? "该角色暂无可选构筑" : "暂无可选构筑" }}
            </div>

            <div v-if="data.title" class="border border-base-content/10 bg-base-100/60 p-1.5">
                <div class="truncate text-[12px] font-semibold text-base-content/85">{{ data.title }}</div>
                <div v-if="data.author" class="mt-0.5 text-[10px] text-base-content/40">{{ data.author }}</div>
                <div v-if="data.desc" class="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap wrap-break-word text-[11px] leading-4 text-base-content/55">
                    {{ data.desc }}
                </div>
            </div>
            <div v-else class="px-1 text-[11px] text-base-content/40">选择构筑后输出构筑并展示标题与描述</div>

            <div v-if="data.error" class="break-all text-[11px] text-error">{{ data.error }}</div>
            <div v-if="data.build" class="text-[10px] text-base-content/40">构筑已就绪，可连接到计算节点</div>
        </div>
    </BaseNode>
</template>
