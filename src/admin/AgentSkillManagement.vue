<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { type AgentSkillMeta, listAgentSkills } from "@/api/agentSkill"

/**
 * Agent 技能浏览页：技能库是服务端 `server/skills/<技能名>/` 下的普通目录，由 git 管理版本。
 * 本页只读展示清单（元数据来自各目录 SKILL.md 的 frontmatter），不做任何写操作。
 */

const loading = ref(false)
const queryError = ref("")

/** 全量技能列表（服务端已按排序权重与名称升序） */
const skills = ref<AgentSkillMeta[]>([])

const filters = reactive({ keyword: "" })

const PAGE_SIZE = 20
const page = ref(1)

const filteredSkills = computed(() =>
    skills.value.filter(skill => {
        const keyword = filters.keyword.trim().toLowerCase()
        if (keyword && !`${skill.name} ${skill.description}`.toLowerCase().includes(keyword)) {
            return false
        }

        return true
    })
)

const totalPages = computed(() => Math.max(1, Math.ceil(filteredSkills.value.length / PAGE_SIZE)))
const visibleSkills = computed(() => filteredSkills.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

/** 统计卡数据（全量口径，不受筛选影响） */
const stats = computed(() => ({
    total: skills.value.length,
    files: skills.value.reduce((sum, skill) => sum + skill.fileCount, 0),
    size: skills.value.reduce((sum, skill) => sum + skill.packageSize, 0),
}))

async function loadSkills() {
    loading.value = true
    queryError.value = ""

    try {
        const result = await listAgentSkills()
        skills.value = result.skills
    } catch (e) {
        skills.value = []
        queryError.value = e instanceof Error ? e.message : "加载技能列表失败"
    } finally {
        loading.value = false
    }
}

function resetFilters() {
    filters.keyword = ""
    page.value = 1
}

/** 包大小 → 可读文本（如 "12.3 KB"）。 */
function formatSize(size: number): string {
    return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 102.4) / 10)} KB`
}

function shortSha(sha: string): string {
    return sha ? `${sha.slice(0, 10)}…` : "-"
}

function formatTime(value: number | null): string {
    return value ? new Date(value).toLocaleString() : "-"
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        // 剪贴板不可用时静默失败，sha 可手动选中复制
    }
}

onMounted(loadSkills)
</script>

<template>
    <div class="animate-fadeIn relative min-h-screen bg-base-200/50 p-6">
        <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
                <h2 class="text-2xl font-semibold text-base-content">Agent 技能</h2>
                <p class="mt-1 text-sm text-base-content/70">
                    技能库位于服务端 <span class="font-mono">server/skills/&lt;技能名&gt;/</span>，由 git 管理版本；本页只读展示清单
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-sm btn-ghost" :disabled="loading" @click="loadSkills">
                    <span v-if="loading" class="loading loading-spinner loading-xs"></span>
                    <Icon v-else icon="ri:refresh-line" />
                    <span>刷新</span>
                </button>
            </div>
        </div>

        <!-- 统计 -->
        <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">技能总数</p>
                <p class="mt-1 font-mono text-lg font-semibold text-base-content">{{ stats.total }}</p>
            </div>
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">技能文件总数</p>
                <p class="mt-1 font-mono text-lg font-semibold text-base-content">{{ stats.files }}</p>
            </div>
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">包总体积（下发时打包）</p>
                <p class="mt-1 font-mono text-lg font-semibold text-base-content">{{ formatSize(stats.size) }}</p>
            </div>
        </div>

        <!-- 筛选 -->
        <div class="card mb-6 border border-base-300 bg-base-100 p-6 shadow-sm">
            <div class="flex flex-col gap-4 md:flex-row md:items-end md:flex-wrap">
                <div class="w-full md:w-64">
                    <label class="mb-1 block text-xs text-base-content/60">关键词（名称 / 描述）</label>
                    <input v-model="filters.keyword" type="text" placeholder="如 build / 伤害" class="input input-bordered w-full" @input="page = 1" />
                </div>
                <button class="btn btn-ghost" @click="resetFilters">重置</button>
            </div>
        </div>

        <div v-if="queryError" class="alert alert-error mb-6 text-sm">
            <Icon icon="ri:error-warning-line" class="text-lg" />
            <span>{{ queryError }}</span>
        </div>

        <!-- 列表 -->
        <div class="card overflow-hidden border border-base-300 bg-base-100 shadow-sm">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">技能名</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">描述</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">状态</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">包（大小 / 文件 / sha）</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">目录更新时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(skill, index) in visibleSkills"
                            :key="skill.name"
                            class="transition-colors duration-200 hover:bg-base-200/50"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <div class="font-mono font-semibold text-base-content/85">{{ skill.name }}</div>
                                <div v-if="skill.version" class="text-base-content/50">v{{ skill.version }}</div>
                            </td>
                            <td class="max-w-72 px-4 py-4 text-xs">
                                <div class="text-base-content/85">{{ skill.description }}</div>
                                <div v-if="skill.whenToUse" class="mt-0.5 text-base-content/50">时机：{{ skill.whenToUse }}</div>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <span class="badge badge-sm" :class="skill.enabled ? 'badge-success' : 'badge-error'">
                                    {{ skill.enabled ? "启用" : "停用" }}
                                </span>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap font-mono text-base-content/85">
                                {{ formatSize(skill.packageSize) }} / {{ skill.fileCount }}
                                <button
                                    class="ml-1 text-base-content/75 hover:text-primary hover:underline"
                                    :title="`sha256: ${skill.packageSha}`"
                                    @click="copyText(skill.packageSha)"
                                >
                                    {{ shortSha(skill.packageSha) }}
                                </button>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap text-base-content/85">{{ formatTime(skill.updateAt) }}</td>
                        </tr>

                        <tr v-if="!loading && filteredSkills.length === 0">
                            <td colspan="5" class="px-8 py-10 text-center text-sm text-base-content/70">
                                {{ queryError ? "加载失败" : "服务端 skills 目录下还没有技能，把技能目录放进去即可" }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <PageFoot v-model:page="page" :pageSize="PAGE_SIZE" :totalPages="totalPages" :count="filteredSkills.length" />
        </div>

        <div v-if="loading" class="absolute inset-0 z-50 flex items-center justify-center bg-base-200/60">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
    </div>
</template>
