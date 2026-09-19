#!/usr/bin/env node
/**
 * 解析 V8 `.cpuprofile`，按 **self-time**（函数自身耗时，不含被调用者）输出热点函数表。
 *
 * 为什么不用 total-time：调用链上游会把所有下游耗时算进自己头上，
 * 一个只负责「调别人」的包装函数会看起来最热，实际优化它没有任何收益。
 * self-time 才回答「时间到底烧在哪一行」。
 *
 * 用法：
 *   node profile-self-time.mjs <file.cpuprofile> [--top 20] [--filter src/] [--json]
 *
 *   --top <n>      只显示前 n 行（默认 25）
 *   --filter <str> 只保留 url 含该子串的节点（如 src/ 过滤掉 node 内部帧，可重复传多次取并集）
 *   --exclude <str> 排除 url 含该子串的节点（可重复）
 *   --json         输出 JSON（便于脚本消费）
 */

import { readFileSync } from "node:fs"

/**
 * 解析命令行参数。
 * @returns {{file: string, top: number, filters: string[], excludes: string[], json: boolean}}
 */
function parseArgs(argv) {
    /** @type {{file: string, top: number, filters: string[], excludes: string[], json: boolean}} */
    const out = { file: "", top: 25, filters: [], excludes: [], json: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === "--top") {
            out.top = Number.parseInt(argv[++i] ?? "", 10) || 25
        } else if (arg === "--filter") {
            out.filters.push(argv[++i] ?? "")
        } else if (arg === "--exclude") {
            out.excludes.push(argv[++i] ?? "")
        } else if (arg === "--json") {
            out.json = true
        } else if (!out.file) {
            out.file = arg
        }
    }
    return out
}

/**
 * 计算每个节点的 self-time（微秒）。
 * 优先用 samples + timeDeltas（精确到采样点）；缺失时回退到 hitCount × 平均采样间隔。
 * @param {any} profile 解析后的 cpuprofile 对象
 * @returns {Map<number, number>} nodeId → self-time(µs)
 */
function computeSelfTime(profile) {
    const self = new Map()
    const samples = Array.isArray(profile.samples) ? profile.samples : []
    const timeDeltas = Array.isArray(profile.timeDeltas) ? profile.timeDeltas : []

    if (samples.length > 0) {
        for (let i = 0; i < samples.length; i++) {
            // timeDeltas[i] 是「第 i 个采样点的耗时」，归属于 samples[i]
            const dt = timeDeltas[i] ?? 0
            const id = samples[i]
            self.set(id, (self.get(id) ?? 0) + dt)
        }
        return self
    }

    // 回退：没有采样点数组时，用 hitCount 平摊总时长
    const totalTime = (profile.endTime ?? 0) - (profile.startTime ?? 0)
    const totalHits = profile.nodes.reduce((acc, node) => acc + (node.hitCount ?? 0), 0) || 1
    const perHit = totalTime / totalHits
    for (const node of profile.nodes) {
        self.set(node.id, (node.hitCount ?? 0) * perHit)
    }
    return self
}

/**
 * 归一化文件路径，去掉 file:// 前缀方便阅读。
 * @param {string} url 原始 callFrame.url
 * @returns {string}
 */
function normalizeUrl(url) {
    return (url ?? "").replace(/^file:\/\/\//, "").replace(/^webpack:\/\/\//, "")
}

/**
 * 主流程：读取 profile、聚合 self-time、按条件过滤并排序输出。
 * @returns {void}
 */
function main() {
    const args = parseArgs(process.argv.slice(2))
    if (!args.file) {
        console.error("用法: node profile-self-time.mjs <file.cpuprofile> [--top 20] [--filter src/] [--json]")
        process.exit(1)
    }

    const raw = JSON.parse(readFileSync(args.file, "utf8"))
    const profile = raw.profile ?? raw // 兼容 {profile:{...}} 包装
    const nodes = Array.isArray(profile.nodes) ? profile.nodes : []
    const nodesById = new Map(nodes.map(node => [node.id, node]))
    const selfById = computeSelfTime(profile)
    const totalTime = (profile.endTime ?? 0) - (profile.startTime ?? 0)

    // 同一函数可能对应多个 node（不同调用点/内联），按 名称+位置 合并
    const merged = new Map()
    for (const [id, selfTime] of selfById) {
        if (selfTime <= 0) continue
        const frame = nodesById.get(id)?.callFrame ?? {}
        const url = normalizeUrl(frame.url)
        const name = frame.functionName || "(anonymous)"

        if (args.filters.length > 0 && !args.filters.some(f => url.includes(f))) continue
        if (args.excludes.length > 0 && args.excludes.some(e => url.includes(e))) continue

        // 位置用 行:列 粗粒度聚合，避免因内联产生大量同函数碎片
        const key = `${name}\u0000${url}\u0000${frame.lineNumber ?? -1}`
        const prev = merged.get(key)
        if (prev) {
            prev.self += selfTime
        } else {
            merged.set(key, {
                name,
                url,
                line: (frame.lineNumber ?? -1) + 1,
                self: selfTime,
            })
        }
    }

    const rows = [...merged.values()].sort((a, b) => b.self - a.self).slice(0, args.top)
    const accountedTotal = [...selfById.values()].reduce((acc, v) => acc + v, 0) || totalTime || 1

    if (args.json) {
        console.log(JSON.stringify({ totalTime, accountedTotal, rows }, null, 2))
        return
    }

    // 表格输出：self(ms) / 占比 / 函数名 / 位置
    const nameWidth = Math.max(12, ...rows.map(r => r.name.length))
    console.log(`profile: ${args.file}`)
    console.log(`总时长: ${(totalTime / 1000).toFixed(1)}ms  采样归属: ${(accountedTotal / 1000).toFixed(1)}ms`)
    console.log("")
    console.log(`${"self(ms)".padStart(9)}  ${"占比".padStart(6)}  ${"函数".padEnd(nameWidth)}  位置`)
    console.log("-".repeat(9 + 2 + 6 + 2 + nameWidth + 2 + 40))
    for (const row of rows) {
        const pct = ((row.self / accountedTotal) * 100).toFixed(2)
        const loc = row.url ? `${row.url}:${row.line}` : "(native)"
        console.log(`${(row.self / 1000).toFixed(2).padStart(9)}  ${`${pct}%`.padStart(6)}  ${row.name.padEnd(nameWidth)}  ${loc}`)
    }
}

main()
