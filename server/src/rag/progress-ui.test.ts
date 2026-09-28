/**
 * 进度 UI 的启动守卫测试。
 *
 * 这块 UI 只在交互式终端出现；**非 TTY（管道、日志文件、PM2、容器、测试进程）必须完全不启动**，
 * 否则 ink 会把光标控制序列写进日志，把线上日志搞成乱码。
 */

import { describe, expect, test } from "bun:test"
import { startRagProgressUi, stopRagProgressUi } from "./progress-ui"

describe("RAG 进度 UI 启动守卫", () => {
    test("非交互终端下不启动，可安全重复调用", () => {
        // bun test 的 stdout 不是 TTY，这里正好覆盖「日志场景不应该有 UI」这条硬要求
        expect(process.stdout.isTTY).toBeFalsy()

        startRagProgressUi()
        startRagProgressUi()
        stopRagProgressUi()
        stopRagProgressUi()
    })

    test("RAG_PROGRESS_UI=0 时显式关闭", () => {
        process.env.RAG_PROGRESS_UI = "0"

        try {
            startRagProgressUi()
        } finally {
            delete process.env.RAG_PROGRESS_UI
        }
    })
})
