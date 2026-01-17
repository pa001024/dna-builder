<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { Guide, guidesQuery } from "@/api/graphql"
import { charData } from "../data"

const router = useRouter()

const searchKeyword = ref("")
const selectedType = ref<"all" | "text" | "image">("all")
const selectedCharId = ref<number | undefined>(undefined)
const loading = ref(false)
const guides = ref<Guide[]>([])

const typeOptions = [
    { value: "all", label: "全部" },
    { value: "text", label: "图文攻略" },
    { value: "image", label: "一图流攻略" },
]

const charOptions = computed(() => [
    { value: -1, label: "全部角色" },
    ...charData.map(char => ({
        value: char.id,
        label: char.名称,
    })),
])

async function fetchGuides(offset = 0) {
    loading.value = true
    try {
        const result = await guidesQuery({
            type: selectedType.value === "all" ? undefined : selectedType.value,
            charId: selectedCharId.value,
            limit: 20,
            offset,
        })

        if (result) {
            if (offset === 0) {
                guides.value = result
            } else {
                guides.value.push(...result)
            }
        }
    } finally {
        loading.value = false
    }
}

function handleSearch() {
    fetchGuides(0)
}

function loadMore() {
    fetchGuides(guides.value.length)
}

function goToDetail(id: string) {
    router.push({ name: "guide-detail", params: { id } })
}

function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString("zh-CN")
}

function getCharName(charId: number | null) {
    if (!charId) return ""
    const char = charData.find(c => c.id === charId)
    return char?.名称 || ""
}

onMounted(() => {
    fetchGuides()
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="bg-base-300/50 backdrop-blur-sm p-4 border-b border-base-200">
            <div class="flex gap-2">
                <input
                    v-model="searchKeyword"
                    type="text"
                    placeholder="搜索攻略标题..."
                    class="input input-bordered input-sm flex-1"
                    @keyup.enter="handleSearch"
                />
                <Select v-model="selectedType" class="input input-sm w-40" @change="handleSearch">
                    <SelectItem v-for="option in typeOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </SelectItem>
                </Select>
                <Select v-model="selectedCharId" class="input input-sm w-40" @change="handleSearch">
                    <SelectItem v-for="option in charOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </SelectItem>
                </Select>
                <RouterLink to="/guides/create" class="btn btn-primary btn-sm">
                    <Icon icon="ri:add-line" class="w-4 h-4" />
                    发布攻略
                </RouterLink>
            </div>
        </div>
        <ScrollArea class="flex-1">
            <div v-if="loading" class="flex justify-center items-center h-full m-4">
                <span class="loading loading-spinner" />
            </div>
            <div v-else-if="guides.length === 0" class="flex justify-center items-center h-full text-base-content/50 m-4">暂无攻略</div>
            <div v-else class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div
                    v-for="guide in guides"
                    :key="guide.id"
                    class="card bg-base-100 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                    @click="goToDetail(guide.id)"
                >
                    <div class="card-body p-4">
                        <div class="flex items-start justify-between mb-2">
                            <h3 class="card-title text-lg line-clamp-2">
                                {{ guide.title }}
                            </h3>
                            <div class="badge badge-sm" :class="guide.type === 'text' ? 'badge-primary' : 'badge-secondary'">
                                {{ guide.type === "text" ? "图文" : "一图流" }}
                            </div>
                        </div>
                        <p class="text-sm text-base-content/70 line-clamp-3 mb-3">
                            {{ guide.content }}
                        </p>
                        <div v-if="guide.charId" class="flex items-center gap-2 mb-3">
                            <span class="text-xs text-base-content/50">关联角色:</span>
                            <span class="text-sm font-medium">{{ getCharName(guide.charId) }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs text-base-content/50">
                            <div class="flex items-center gap-4">
                                <div class="flex items-center gap-1">
                                    <Icon icon="ri:eye-line" class="w-4 h-4" />
                                    <span>{{ guide.views }}</span>
                                </div>
                            </div>
                            <span>{{ formatDate(guide.createdAt) }}</span>
                        </div>
                        <div v-if="guide.user" class="flex items-center gap-2 mt-2">
                            <div class="avatar placeholder">
                                <div class="bg-neutral text-neutral-content rounded-full w-8 inline-flex justify-center items-center">
                                    <QQAvatar :qq="guide.user.qq" :name="guide.user.name" />
                                </div>
                            </div>
                            <span class="text-xs text-base-content/70">{{ guide.user.name }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex justify-center p-4">
                <button v-if="guides.length >= 20" class="btn btn-sm" @click="loadMore">加载更多</button>
            </div>
        </ScrollArea>
    </div>
</template>
