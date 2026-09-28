/**
 * 服务端主进程的 RAG 索引构建进度 UI（ink / React 渲染的**固定区域**）。
 */

import { Box, type Instance, render, Text } from "ink"
import { useRef, useSyncExternalStore } from "react"
import { getBuildSnapshot, type RagBuildResult, subscribeBuildState } from "./build"

/** 已启动的 UI 实例（重复调用只启动一次） */
let instance: Instance | null = null

/** 进度采样（估算速率与剩余时间；服务端只报 done/total） */
interface Sample {
    done: number
    at: number
}

/**
 * 画一条文本进度条。
 * @param ratio 0~1 的比例
 * @param width 进度条宽度（字符数）
 * @returns 形如 `████░░░░` 的文本
 */
function bar(ratio: number, width = 30): string {
    const filled = Math.max(0, Math.min(width, Math.round(ratio * width)))

    return `${"█".repeat(filled)}${"░".repeat(width - filled)}`
}

/**
 * 把秒数写成便于阅读的时长。
 * @param seconds 秒数
 * @returns 时长文本
 */
function duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "0 秒"
    }

    if (seconds < 60) {
        return `${Math.ceil(seconds)} 秒`
    }

    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`
    }

    return `${(seconds / 3600).toFixed(1)} 小时`
}

/** 构建方式的中文名 */
const MODE_LABEL: Record<RagBuildResult["mode"], string> = {
    "up-to-date": "内容已是最新",
    incremental: "增量构建",
    full: "全量构建",
}

/**
 * 进度区域组件。
 *
 * 只在有事可报时渲染（构建中 / 有排队任务 / 上次失败）；空闲时整块返回 `null`，
 * 不在终端底部留「空闲」占位（构建结果另有 `build.ts` 的日志行）。
 */
function RagProgress() {
    const state = useSyncExternalStore(subscribeBuildState, getBuildSnapshot)
    const samples = useRef<Sample[]>([])

    const progress = state.progress
    const running = state.running

    // 进度采样：只保留最近 5 分钟，避免长时间构建把数组撑大
    if (running && progress) {
        const last = samples.current[samples.current.length - 1]

        if (!last || last.done !== progress.done) {
            const now = Date.now()
            samples.current = [...samples.current.filter(item => now - item.at < 300_000), { done: progress.done, at: now }]
        }
    } else if (!running && samples.current.length) {
        samples.current = []
    }

    if (!running && !state.pendingLangs.length && !state.lastError) {
        return null
    }

    const first = samples.current[0]
    const last = samples.current[samples.current.length - 1]
    const span = first && last ? (last.at - first.at) / 1000 : 0
    const speed = span > 0 && first && last ? (last.done - first.done) / span : 0
    const ratio = progress?.total ? progress.done / progress.total : 0
    const eta = progress && speed > 0 ? (progress.total - progress.done) / speed : 0

    return (
        <Box flexDirection="column" borderStyle="round" borderColor={running ? "cyan" : "gray"} paddingX={1}>
            <Box>
                <Text bold color="cyan">
                    RAG 索引
                </Text>
                {running ? (
                    <Text>
                        {" "}
                        构建中 <Text bold>{state.lang ?? "…"}</Text>
                    </Text>
                ) : null}
            </Box>

            {running ? (
                <>
                    <Box>
                        <Text color={ratio >= 1 ? "green" : "cyan"}>{bar(ratio)}</Text>
                        <Text> {String(Math.round(ratio * 100)).padStart(3)}%</Text>
                    </Box>
                    <Text dimColor>
                        {progress ? `${progress.done} / ${progress.total} 条` : "装配语料与差异比对中…"}
                        {speed > 0 ? ` · ${speed.toFixed(1)} 条/秒 · 剩余约 ${duration(eta)}` : ""}
                    </Text>
                </>
            ) : null}

            {state.pendingLangs.length ? <Text dimColor>排队中 {state.pendingLangs.join(" / ")}</Text> : null}

            {state.lastResult ? (
                <>
                    <Text dimColor>
                        上次 {state.lastResult.lang} · {MODE_LABEL[state.lastResult.mode]} · 耗时{" "}
                        {duration(state.lastResult.elapsedMs / 1000)}
                    </Text>
                    <Text dimColor>
                        {" "}
                        语料 {state.lastResult.chunkCount} 条 · 新增 {state.lastResult.added} · 变更 {state.lastResult.changed} · 删除{" "}
                        {state.lastResult.removed} · 复用 {state.lastResult.reused} · 向量化 {state.lastResult.embedded}
                    </Text>
                </>
            ) : null}

            {state.lastError ? <Text color="red">上次失败 {state.lastError}</Text> : null}
        </Box>
    )
}

/**
 * 启动进度 UI。
 *
 * `patchConsole: true`：把服务端其它 `console.log` 转写到固定区域上方，
 * 这样进度区域不会被日志冲掉，日志也不会被区域覆盖。
 * `exitOnCtrlC: false`：Ctrl+C 仍按服务端的默认行为终止进程，而不是只关掉这块 UI。
 */
export function startRagProgressUi(): void {
    if (instance) {
        return
    }

    const flag = process.env.RAG_PROGRESS_UI?.trim()

    if (flag === "0") {
        return
    }

    // =1 强制开启（管道/CI 里也能复现与排查），不设时按 TTY 自动判断
    if (flag !== "1" && !process.stdout.isTTY) {
        return
    }

    instance = render(<RagProgress />, { patchConsole: true, exitOnCtrlC: false })
}

/**
 * 停止进度 UI（进程退出前清理）。
 */
export function stopRagProgressUi(): void {
    instance?.unmount()
    instance = null
}
