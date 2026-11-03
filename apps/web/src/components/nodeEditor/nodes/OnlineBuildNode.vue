<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { buildQuery, buildsQuery } from "@/api/graphql"
import { charMap, LeveledCharHelper } from "@/data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatDateTime } from "@/utils/time"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

interface OnlineBuildOption {
    id: string
    title: string
    desc: string
    author: string
    charId: number
    charSettings: string
    /** 在线构筑的更新时间（服务端时间戳） */
    updateAt: number
}

const options = ref<OnlineBuildOption[]>([])
const loading = ref(false)
/** 正在手动更新已选构筑的最新配置 */
const updating = ref(false)
const loadError = ref("")
/** 已拉取列表的角色过滤键：节点有缓存选择时首屏不请求，展开下拉 / 手动刷新才联网 */
let loadedKey: string | null = null

const selectedId = computed(() => (typeof props.data.buildId === "string" ? props.data.buildId : ""))

/** 读取连接到「角色过滤」端口的角色；未连接时返回 null */
const filterChar = computed(() => {
    const edge = store.edges.find(item => item.target === props.id && item.targetHandle === "char")
    if (!edge) return null
    const node = store.nodes.find(item => item.id === edge.source)
    const charId = Number(node?.data.charId)
    const char = Number.isFinite(charId) && charId > 0 ? charMap.get(charId) : undefined
    return char ? { id: char.id, name: char.名称 } : null
})

const filterIcon = computed(() => (filterChar.value?.id ? LeveledCharHelper.idToUrl(filterChar.value.id) : ""))

let requestId = 0

/** 当前角色过滤对应的缓存键 */
function currentFilterKey() {
    return filterChar.value?.id && filterChar.value.id > 0 ? String(filterChar.value.id) : "all"
}

/**
 * 用节点数据里已缓存的构筑播种选项：重开图时直接展示已选构筑，不重新请求列表。
 */
function seedOptionsFromCache() {
    const buildId = selectedId.value
    const charSettings = typeof props.data.charSettings === "string" ? props.data.charSettings : ""
    if (!buildId || !charSettings) return
    options.value = [
        {
            id: buildId,
            title: typeof props.data.title === "string" && props.data.title ? props.data.title : buildId,
            desc: typeof props.data.desc === "string" ? props.data.desc : "",
            author: typeof props.data.author === "string" ? props.data.author : "",
            charId: typeof props.data.charId === "number" ? props.data.charId : 0,
            charSettings,
            updateAt: typeof props.data.updateAt === "number" ? props.data.updateAt : 0,
        },
    ]
}

/**
 * 拉取在线构筑列表；连接角色输入时只请求该角色的构筑。
 * 仅首次拉取当前过滤 / 强制刷新时请求；已选构筑的配置取自节点缓存，由更新按钮单独刷新。
 * @param mode force 强制联网刷新
 */
async function loadBuilds(mode: { force?: boolean } = {}) {
    const key = currentFilterKey()
    if (!mode.force && loadedKey === key) return
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
            updateAt: build.updateAt,
        }))
        loadedKey = key
        const selected = options.value.find(build => build.id === selectedId.value)
        if (!selectedId.value) return
        // 角色过滤变化 / 构筑被删除后原选项可能已不在列表中：清空选择，避免输出其他角色的构筑
        if (!selected) {
            store.updateNodeData(props.id, {
                buildId: "",
                title: "",
                desc: "",
                author: "",
                charId: undefined,
                charSettings: undefined,
                error: undefined,
            })
            return
        }
        // 旧图缺配置缓存：用列表数据补齐，作为后续计算与展示的缓存
        const cachedSettings = typeof props.data.charSettings === "string" ? props.data.charSettings : ""
        if (!cachedSettings) {
            store.updateNodeData(props.id, {
                title: selected.title,
                desc: selected.desc,
                author: selected.author,
                charId: selected.charId,
                charSettings: selected.charSettings,
                updateAt: selected.updateAt,
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

/** 选择构筑：把构筑配置缓存进节点数据，节点输出构筑由 store 直接读取缓存计算 */
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
        updateAt: build.updateAt,
        error: undefined,
    })
}

let updateRequestId = 0

/**
 * 手动更新已选构筑：从服务器拉取该构筑的最新配置与更新时间，写回节点缓存。
 */
async function updateSelectedBuild() {
    const buildId = selectedId.value
    if (!buildId) return
    const current = ++updateRequestId
    updating.value = true
    loadError.value = ""
    try {
        const build = await buildQuery({ id: buildId }, { requestPolicy: "network-only" })
        if (current !== updateRequestId || buildId !== selectedId.value) return
        if (!build) {
            loadError.value = "在线构筑不存在或已被删除"
            return
        }
        store.updateNodeData(props.id, {
            title: build.title,
            desc: build.desc ?? "",
            author: build.user?.name ?? "",
            charId: build.charId,
            charSettings: build.charSettings,
            updateAt: build.updateAt,
            error: undefined,
        })
        // 下拉中的同一构筑同步为最新信息，避免选项与节点展示不一致
        const index = options.value.findIndex(item => item.id === build.id)
        if (index >= 0) {
            options.value[index] = {
                id: build.id,
                title: build.title,
                desc: build.desc ?? "",
                author: build.user?.name ?? "",
                charId: build.charId,
                charSettings: build.charSettings,
                updateAt: build.updateAt,
            }
        }
    } catch (error) {
        if (current !== updateRequestId) return
        loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
        if (current === updateRequestId) updating.value = false
    }
}

/** 已选构筑的更新时间文案 */
const updatedAtText = computed(() => {
    const updateAt = props.data.updateAt
    return typeof updateAt === "number" && updateAt > 0 ? formatDateTime(updateAt) : ""
})

/** 展开下拉时按需拉取列表；节点已有缓存时不请求 */
function handleOpenChange(open: boolean) {
    if (open) void loadBuilds()
}

// 过滤变化必须重新拉取对应角色的列表
watch(
    () => filterChar.value?.id,
    () => {
        loadedKey = null
        void loadBuilds({ force: true })
    }
)

onMounted(() => {
    seedOptionsFromCache()
    // 已有缓存选择的节点不再自动请求列表；新节点 / 旧图缺配置时补拉
    if (!options.value.length) void loadBuilds()
})
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
                    @update:open="handleOpenChange"
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
                    @click="loadBuilds({ force: true })"
                >
                    <Icon icon="ri:refresh-line" class="size-3" :class="loading ? 'animate-spin' : ''" />
                </button>
                <button
                    type="button"
                    class="grid size-6 shrink-0 cursor-pointer place-items-center border border-base-content/10 text-base-content/50 transition-colors duration-150 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!selectedId || updating"
                    title="更新已选构筑"
                    @click="updateSelectedBuild"
                >
                    <Icon icon="ri:download-line" class="size-3" :class="updating ? 'animate-pulse' : ''" />
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
                <div v-if="updatedAtText" class="mt-1 text-[10px] text-base-content/40">更新于 {{ updatedAtText }}</div>
            </div>
            <div v-else class="px-1 text-[11px] text-base-content/40">选择构筑后输出构筑并展示标题与描述</div>

            <div v-if="data.error" class="break-all text-[11px] text-error">{{ data.error }}</div>
            <div v-if="data.build" class="text-[10px] text-base-content/40">构筑已就绪，可连接到计算节点</div>
        </div>
    </BaseNode>
</template>
