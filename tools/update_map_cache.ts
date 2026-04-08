#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import * as ts from "typescript"
import { DNAAPI } from "../externals/dna-api/src/index.ts"

const TARGET_FILE = resolve(process.cwd(), "src/data/d/map.data.ts")

/**
 * 将任意 JSON 值序列化为 TypeScript 友好的格式。
 * @param value 任意 JSON 值
 * @param indent 缩进层级
 * @returns TypeScript 字面量文本
 */
function formatTsValue(value: unknown, indent = 0): string {
    const pad = "    ".repeat(indent)
    const nextPad = "    ".repeat(indent + 1)

    if (value === null) return "null"
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]"
        return `[\n${value.map(item => `${nextPad}${formatTsValue(item, indent + 1)}`).join(",\n")}\n${pad}]`
    }

    switch (typeof value) {
        case "string":
            return JSON.stringify(value)
        case "number":
        case "boolean":
            return String(value)
        case "object": {
            const entries = Object.entries(value as Record<string, unknown>)
            if (entries.length === 0) return "{}"
            return `{\n${entries
                .map(([key, entryValue]) => `${nextPad}${JSON.stringify(key)}: ${formatTsValue(entryValue, indent + 1)}`)
                .join(",\n")}\n${pad}}`
        }
        default:
            throw new Error(`不支持的 JSON 值类型: ${String(value)}`)
    }
}

/**
 * 在源码中定位指定变量初始化的对象字面量范围。
 * @param sourceFile TS 源文件
 * @param targetVar 目标变量名
 * @returns 需要替换的对象范围
 */
function findObjectSpan(sourceFile: ts.SourceFile, targetVar: string): { start: number; end: number } {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== targetVar || !declaration.initializer) continue

            if (!ts.isObjectLiteralExpression(declaration.initializer)) {
                throw new Error(`变量 ${targetVar} 不是对象字面量`)
            }

            return {
                start: declaration.initializer.getStart(sourceFile),
                end: declaration.initializer.getEnd(),
            }
        }
    }

    throw new Error(`在 ${sourceFile.fileName} 中找不到变量 ${targetVar}`)
}

/**
 * 使用线上接口刷新地图分类与地图详情缓存。
 */
async function main() {
    const api = new DNAAPI({ fetchFn: fetch })

    const categorizeRes = await api.getMapCategorizeList()
    if (!categorizeRes.is_success || !categorizeRes.data?.list) {
        throw new Error(`获取地图分类失败: ${categorizeRes.msg || categorizeRes.code}`)
    }

    const mapIds: number[] = []
    for (const category of categorizeRes.data.list) {
        for (const map of category.maps) {
            mapIds.push(map.id)
        }
    }

    const mapCache: Record<number, unknown> = {}
    for (const mapId of mapIds) {
        const res = await api.getMapDetail(mapId)
        if (!res.is_success || !res.data) {
            throw new Error(`获取地图详情失败: mapId=${mapId}, msg=${res.msg || res.code}`)
        }
        mapCache[mapId] = {
            floors: res.data.floors ?? [],
            matterCategorizes: res.data.matterCategorizes ?? [],
            map: res.data.map,
            userSites: res.data.userSites ?? [],
        }
    }

    const fileText = await readFile(TARGET_FILE, "utf-8")
    const sourceFile = ts.createSourceFile(TARGET_FILE, fileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const { start, end } = findObjectSpan(sourceFile, "mapCache")
    const replacement = formatTsValue(mapCache, 0)
    const newText = `${fileText.slice(0, start)}${replacement}${fileText.slice(end)}`

    await writeFile(TARGET_FILE, newText, "utf-8")
    console.log(`[update_map_cache] updated: ${TARGET_FILE}`)
}

main().catch(error => {
    console.error("[update_map_cache] failed:", error)
    process.exit(1)
})
