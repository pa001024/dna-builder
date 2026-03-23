import type { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { ChatOpenAIResponses } from "@langchain/openai"
import { z } from "zod"
import { logDob } from "./log.ts"

export type OpenAIResponsesConfig = {
    apiKey: string
    baseUrl: string
    model: string
    temperature: number
    maxOutputTokens: number
    debugLabel?: string
}

/**
 * 使用 LangChain 的 Responses API 流式获取结构化结果。
 * @template T
 * @param {OpenAIResponsesConfig} config
 * @param {SystemMessage} systemMessage
 * @param {HumanMessage} humanMessage
 * @param {z.ZodType<T>} schema
 * @param {string} schemaName
 * @returns {Promise<T>}
 */
export async function callStructuredResponses<T>(
    config: OpenAIResponsesConfig,
    systemMessage: SystemMessage,
    humanMessage: HumanMessage,
    schema: z.ZodType<T>,
    schemaName: string
): Promise<T> {
    if (!config.apiKey) throw new Error("缺少 DOB_BOT_LLM_API_KEY 或 OPENAI_API_KEY")
    logDob("llm.request", {
        label: config.debugLabel ?? schemaName,
        model: config.model,
        baseUrl: config.baseUrl,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        schemaName,
    })

    const model = new ChatOpenAIResponses({
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxOutputTokens,
        configuration: {
            baseURL: config.baseUrl,
        },
    })

    const stream = await model.stream([systemMessage, humanMessage], {
        text: {
            format: {
                type: "json_schema",
                name: schemaName,
                strict: true,
                schema: sanitizeJsonSchema(z.toJSONSchema(schema)),
            },
        },
        streaming: true,
    } as Parameters<ChatOpenAIResponses["stream"]>[1])

    let outputText = ""
    for await (const chunk of stream) {
        outputText += extractChunkText(chunk)
    }
    logDob("llm.raw_response", {
        label: config.debugLabel ?? schemaName,
        model: config.model,
        text: outputText.trim(),
    })

    const parsed = tryParseJson(stripJsonFence(outputText.trim()))
    const normalized = parsed ?? parseLooseYaml(stripJsonFence(outputText.trim()))
    if (!normalized) {
        logDob("llm.parse_error", {
            label: config.debugLabel ?? schemaName,
            model: config.model,
            text: outputText.trim(),
        })
        throw new Error(`Responses API 返回的内容不是有效 JSON: ${outputText.trim()}`)
    }
    const result = schema.parse(normalized)
    logDob("llm.parsed_response", {
        label: config.debugLabel ?? schemaName,
        model: config.model,
        parsed: result,
    })
    return result
}

/**
 * 从流式 chunk 里提取文本。
 * @param {unknown} chunk
 * @returns {string}
 */
function extractChunkText(chunk: unknown): string {
    if (!chunk || typeof chunk !== "object") return ""

    const obj = chunk as {
        content?: unknown
    }

    if (typeof obj.content === "string") return obj.content
    if (!Array.isArray(obj.content)) return ""

    const parts: string[] = []
    for (const part of obj.content) {
        if (!part || typeof part !== "object") continue
        const block = part as { type?: unknown; text?: unknown }
        if (block.type === "text" && typeof block.text === "string") {
            parts.push(block.text)
        }
    }
    return parts.join("")
}

/**
 * 清理 JSON Schema，去掉不必要字段。
 * @param {unknown} schema
 * @returns {unknown}
 */
function sanitizeJsonSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema
    const copy = { ...(schema as Record<string, unknown>) }
    delete copy.$schema
    return copy
}

/**
 * 去掉可能存在的 JSON 代码块包裹。
 * @param {string} text
 * @returns {string}
 */
function stripJsonFence(text: string): string {
    const trimmed = text.trim()
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    if (match) return match[1].trim()
    if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
        return trimmed.slice(1, -1).trim()
    }
    return trimmed
}

/**
 * 安全解析 JSON。
 * @param {string} text
 * @returns {unknown}
 */
function tryParseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

/**
 * 解析简化 YAML 风格输出。
 * @param {string} text
 * @returns {unknown}
 */
function parseLooseYaml(text: string): unknown {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean)

    const result: Record<string, unknown> = {}
    let currentKey: string | null = null

    for (const rawLine of lines) {
        const line = rawLine.trim()
        const keyMatch = parseLooseKeyLine(line)
        if (keyMatch) {
            currentKey = keyMatch.key
            const value = keyMatch.value.trim()
            if (!value) {
                result[currentKey] = []
                continue
            }
            result[currentKey] = parseScalar(value)
            continue
        }

        const listMatch = line.match(/^-\s*(.*)$/)
        if (listMatch && currentKey) {
            if (!Array.isArray(result[currentKey])) {
                result[currentKey] = []
            }
            ;(result[currentKey] as string[]).push(stripLooseComment(listMatch[1].trim()))
        }
    }

    return Object.keys(result).length > 0 ? result : null
}

/**
 * 解析标量值。
 * @param {string} value
 * @returns {string | number | boolean | null}
 */
function parseScalar(value: string): string | number | boolean | null {
    if (value === "null" || value === "NULL" || value === "~") return null
    if (value === "true") return true
    if (value === "false") return false
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1)
    }
    return stripLooseComment(value)
}

/**
 * 去掉列表项后的注释。
 * @param {string} value
 * @returns {string}
 */
function stripLooseComment(value: string): string {
    return value.split(" — ")[0].split(" - ")[0].trim()
}

/**
 * 解析松散格式的键行，兼容 YAML 和 markdown heading。
 * @param {string} line
 * @returns {{ key: string; value: string } | null}
 */
function parseLooseKeyLine(line: string): { key: string; value: string } | null {
    const yamlMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (yamlMatch) {
        return {
            key: yamlMatch[1],
            value: yamlMatch[2],
        }
    }

    const markdownMatch = line.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/) ?? line.match(/^#{1,6}\s*(.+?)\s*:?\s*(.*)$/)
    if (!markdownMatch) return null

    const key = normalizeLooseKey(markdownMatch[1])
    if (!key) return null
    return {
        key,
        value: markdownMatch[2] ?? "",
    }
}

/**
 * 规范松散 heading 到 schema key。
 * @param {string} value
 * @returns {string | null}
 */
function normalizeLooseKey(value: string): string | null {
    const normalized = value.trim().toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ")

    if (normalized === "read paths" || normalized === "read path") return "read_paths"
    if (normalized === "delete paths" || normalized === "delete path") return "delete_paths"
    if (normalized === "commit message") return "commit_message"
    if (normalized === "clarification question") return "clarification_question"
    if (normalized === "summary") return "summary"
    return null
}
