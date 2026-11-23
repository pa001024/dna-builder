<script setup lang="ts">
import { ref } from "vue"
import { adminRetryJobMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BTN,
    ADMIN_CHIP,
    ADMIN_CHIP_OFF,
    ADMIN_CHIP_ON,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_LABEL,
    ADMIN_NUM,
    ADMIN_NUM_UNIT,
    ADMIN_ROW,
    ADMIN_ROW_ACTION,
    ADMIN_ROW_TONE_NEUTRAL,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TABLE,
    ADMIN_TH,
} from "./admin-ui"

/**
 * BUG 任务页（管理员）：按任务 ID 重试失败 / 卡住的队列任务。
 *
 * 服务端只提供了 `adminRetryJob` / `adminReconcile` 两个运维 mutation，没有任务列表查询
 * （`bug_jobs` 未出现在 GraphQL schema 里），因此本页暂不渲染队列明细与状态统计，
 * 只保留可用的重试入口；接入列表查询后在此补齐表格即可。
 */

const ui = useUIStore()

const JOB_KINDS = [
    { value: "process_submission", label: "处理提交" },
    { value: "sync_issue", label: "同步 Issue" },
    { value: "rebuild_dedup_index", label: "重建判重索引" },
]

const JOB_STATE_LABELS = ["排队", "运行中", "等待重试", "失败"]

const jobId = ref("")
const kind = ref("process_submission")
const retrying = ref(false)
const error = ref("")

/**
 * @description 按任务 ID 重新入队；`step` 必须是任务自身的 kind。
 */
async function retryJob() {
    const id = jobId.value.trim()
    if (!id) {
        error.value = "请填写任务 ID"
        return
    }

    retrying.value = true
    error.value = ""
    try {
        const ok = await adminRetryJobMutation({ jobId: id, step: kind.value })
        if (!ok) return
        ui.showSuccessMessage(`任务 ${id} 已重新入队`)
        jobId.value = ""
    } finally {
        retrying.value = false
    }
}
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader
            kicker="Bug Jobs"
            title="BUG 任务队列"
            description="重试卡在失败 / 等待状态的队列任务；队列明细与租约信息等待服务端补列表查询"
        />

        <p class="flex items-center gap-1.5 border-l-2 border-warning py-1.5 pl-2.5 text-[11.5px] text-warning">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>后端当前只有 adminRetryJob / adminReconcile 两个运维 mutation，没有任务列表查询，因此这里不展示队列明细。</span>
        </p>

        <!-- 队列状态：待服务端提供聚合查询 -->
        <div class="flex flex-wrap border-b border-base-content/10">
            <div v-for="(label, index) in JOB_STATE_LABELS" :key="label" :class="[ADMIN_STAT_CELL, index === 0 ? 'pl-0' : '']">
                <p :class="ADMIN_STAT_LABEL">{{ label }}</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">—</span>
                    <span :class="ADMIN_NUM_UNIT">待接入</span>
                </p>
            </div>
        </div>

        <!-- 按任务 ID 重试 -->
        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-3">
            <label class="block w-72">
                <span :class="ADMIN_LABEL">任务 ID</span>
                <input v-model="jobId" type="text" placeholder="bug_jobs.id" :class="[ADMIN_INPUT, 'mt-1 font-mono']" @keyup.enter="retryJob" />
            </label>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">任务类型 · step</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="option in JOB_KINDS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, kind === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="kind = option.value"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <div class="flex items-center gap-3 pb-0.5">
                <button :class="ADMIN_BTN" :disabled="retrying" @click="retryJob">
                    <Icon icon="ri:play-line" class="h-3.25 w-3.25" />
                    <span>{{ retrying ? "提交中…" : "重新入队" }}</span>
                </button>
                <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="jobId = ''; error = ''">清空</button>
            </div>
            <span class="ml-auto text-[11px] text-base-content/45">step 必须与任务自身的 kind 一致，否则服务端会拒绝</span>
        </div>

        <p v-if="error" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>{{ error }}</span>
        </p>

        <!-- 列表骨架：等列表查询接入后填数据 -->
        <div class="relative min-w-0 flex-1 py-3">
            <ScrollArea horizontal>
                <table :class="ADMIN_TABLE">
                    <thead>
                        <tr class="bg-base-content/3">
                            <th :class="ADMIN_TH">Job</th>
                            <th :class="ADMIN_TH">Kind</th>
                            <th :class="ADMIN_TH">State</th>
                            <th :class="ADMIN_TH">Priority</th>
                            <th :class="[ADMIN_TH, 'text-right']">Attempt</th>
                            <th :class="ADMIN_TH">Lease Owner</th>
                            <th :class="ADMIN_TH">Lease Until</th>
                            <th :class="ADMIN_TH">Last Error</th>
                            <th :class="ADMIN_TH">Created</th>
                            <th :class="[ADMIN_TH, 'text-right']">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr :class="ADMIN_ROW">
                            <td colspan="10" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:inbox-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">等待服务端提供任务列表查询（adminBugJobs）</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>
        </div>
    </div>
</template>
