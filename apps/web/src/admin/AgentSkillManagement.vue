<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { type AgentSkillMeta, listAgentSkills } from "@/api/agentSkill"
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_ERROR,
    ADMIN_BADGE_SUCCESS,
    ADMIN_BTN,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_LABEL,
    ADMIN_MONO,
    ADMIN_NUM,
    ADMIN_NUM_UNIT,
    ADMIN_PROGRESS_TRACK,
    ADMIN_ROW,
    ADMIN_ROW_ACTION,
    ADMIN_ROW_TONE_NEUTRAL,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TABLE,
    ADMIN_TD,
    ADMIN_TH,
} from "./admin-ui"

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

/** 统计开本数据（全量口径，不受筛选影响） */
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
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader kicker="Skills" title="Agent 技能" description="技能库位于服务端，由 git 管理版本；本页只读展示清单">
            <template #actions>
                <button :class="ADMIN_BTN" :disabled="loading" @click="loadSkills">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', loading ? 'animate-spin' : '']" />
                    <span>{{ loading ? "刷新中" : "刷新" }}</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 技能库路径：数据放正文，不进副标题 -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-base-content/10 py-2">
            <span :class="ADMIN_LABEL">Skill Dir</span>
            <span :class="[ADMIN_MONO, 'text-base-content/70']">server/skills/&lt;技能名&gt;/</span>
            <span class="text-[10.5px] text-base-content/35">版本由 git 管理</span>
        </div>

        <!-- 统计开本：技能总数 / 文件总数 / 包总体积 -->
        <div class="flex border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Skills</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ stats.total }}</span>
                    <span :class="ADMIN_NUM_UNIT">个技能</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Files</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ stats.files }}</span>
                    <span :class="ADMIN_NUM_UNIT">个文件</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Package</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ formatSize(stats.size) }}</span>
                    <span :class="ADMIN_NUM_UNIT">下发时打包</span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ loading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <!-- 检索条：下划线输入 + 方章按钮 -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-content/10 py-2.5">
            <div class="relative w-full max-w-72">
                <Icon icon="ri:search-line" class="absolute top-1/2 left-0 h-3.5 w-3.5 -translate-y-1/2 text-base-content/35" />
                <input
                    v-model="filters.keyword"
                    type="text"
                    placeholder="关键词（名称 / 描述）"
                    :class="[ADMIN_INPUT, 'pr-10 pl-5']"
                    @input="page = 1"
                />
                <kbd
                    class="pointer-events-none absolute right-0 bottom-1.5 border border-base-content/15 px-1 text-[9px] tracking-[0.08em] text-base-content/30"
                >
                    FILTER
                </kbd>
            </div>
            <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="resetFilters">重置</button>
            <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">
                {{ filteredSkills.length }} / {{ stats.total }} 条
            </span>
        </div>

        <p v-if="queryError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>{{ queryError }}</span>
        </p>

        <div class="relative min-w-0 flex-1">
            <div v-if="loading" :class="ADMIN_PROGRESS_TRACK">
                <div class="h-full w-1/3 animate-pulse bg-primary" />
            </div>

            <ScrollArea horizontal>
                <table :class="ADMIN_TABLE">
                    <thead>
                        <tr class="bg-base-content/3">
                            <th :class="ADMIN_TH">技能名</th>
                            <th :class="[ADMIN_TH, 'w-135']">描述</th>
                            <th :class="[ADMIN_TH, 'w-24']">状态</th>
                            <th :class="ADMIN_TH">包（大小 / 文件 / sha）</th>
                            <th :class="ADMIN_TH">目录更新时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="skill in visibleSkills" :key="skill.name" :class="ADMIN_ROW">
                            <td :class="ADMIN_TD">
                                <div :class="[ADMIN_MONO, 'font-semibold text-base-content/85']">{{ skill.name }}</div>
                                <div v-if="skill.version" class="text-[10.5px] text-base-content/45">v{{ skill.version }}</div>
                            </td>
                            <td :class="ADMIN_TD">
                                <div class="max-w-130">
                                    <div class="text-base-content/85">{{ skill.description }}</div>
                                    <div v-if="skill.whenToUse" class="mt-0.5 text-[11px] text-base-content/45">
                                        时机：{{ skill.whenToUse }}
                                    </div>
                                </div>
                            </td>
                            <td :class="[ADMIN_TD, 'w-24 whitespace-nowrap']">
                                <span :class="[ADMIN_BADGE, skill.enabled ? ADMIN_BADGE_SUCCESS : ADMIN_BADGE_ERROR]">
                                    {{ skill.enabled ? "启用" : "停用" }}
                                </span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/85']">
                                <span class="tabular-nums">{{ formatSize(skill.packageSize) }}</span>
                                <span class="text-base-content/40"> / </span>
                                <span class="tabular-nums">{{ skill.fileCount }}</span>
                                <button
                                    :class="[ADMIN_MONO, 'ml-2 cursor-pointer text-base-content/55 transition-colors duration-150 hover:text-primary']"
                                    :title="`sha256: ${skill.packageSha}`"
                                    @click="copyText(skill.packageSha)"
                                >
                                    {{ shortSha(skill.packageSha) }}
                                </button>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">{{ formatTime(skill.updateAt) }}</td>
                        </tr>

                        <tr v-if="!loading && filteredSkills.length === 0">
                            <td colspan="5" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:magic-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">
                                        {{ queryError ? "加载失败" : "服务端 skills 目录下还没有技能，把技能目录放进去即可" }}
                                    </p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <PageFoot v-model:page="page" :pageSize="PAGE_SIZE" :totalPages="totalPages" :count="filteredSkills.length" />
        </div>
    </div>
</template>
