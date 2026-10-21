#!/usr/bin/env node
/**
 * dob-ui 冒烟检查：用应用真实的 style.css 走一遍 Tailwind 编译，
 * 断言 db 覆写层与关键约定都在产物里。改动 db/ 或应用主题后运行：
 *   pnpm --filter dob-ui check
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { compile } from "@tailwindcss/node"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")
const webSrc = path.join(repoRoot, "apps/web/src")
const stylePath = path.join(webSrc, "style.css")

/** 触发编译的代表性候选类（组件规则按使用与否输出） */
const candidates = [
    "btn",
    "btn-primary",
    "btn-ghost",
    "btn-sm",
    "btn-square",
    "btn-outline",
    "badge",
    "badge-primary",
    "badge-error",
    "badge-ghost",
    "badge-outline",
    "card",
    "card-body",
    "card-title",
    "input",
    "input-sm",
    "select",
    "textarea",
    "modal",
    "modal-box",
    "modal-backdrop",
    "modal-action",
    "toggle",
    "toggle-primary",
    "checkbox",
    "checkbox-primary",
    "radio",
    "range",
    "range-primary",
    "progress",
    "progress-primary",
    "table",
    "table-sm",
    "table-zebra",
    "tab",
    "tabs",
    "tab-active",
    "alert",
    "alert-error",
    "tooltip",
    "tooltip-top",
    "kbd",
    "menu",
    "menu-title",
    "dropdown",
    "dropdown-content",
    "loading",
    "loading-spinner",
    "link",
    "link-primary",
    "divider",
    "avatar",
    "status",
    "otp",
    "otp-xs",
    "otp-joined",
    "aura",
    "aura-glow",
    "radial-progress",
]

/** 必须出现在产物中的约定 */
const required = [
    "@layer dob",
    "--dob-line-strong",
    "--radius-box: 0.125rem",
    "--depth: 0",
    "--noise: 0",
    ".btn:where(:not(.btn-primary):not(.btn-secondary)",
    "border-width: 0 0 var(--border, 1px) 0",
    "alert-border-color: color-mix",
    "backdrop-filter: blur(var(--dob-blur))",
    "--range-fill-pos",
    "overflow: visible",
    "background-color: var(--range-thumb)",
    "::picker(select)",
    "--dob-surface-popover",
    "@property --aura-angle",
    ".otp > input",
    "linear-gradient(to right, currentColor var(--range-fill-pos)",
]

const css = fs.readFileSync(stylePath, "utf8")
const result = await compile(css, { base: webSrc, from: stylePath, onDependency() {} })
const out = result.build(candidates)

const missing = required.filter(needle => !out.includes(needle))
if (missing.length) {
    console.error(`dob-ui 冒烟检查失败，缺少：\n${missing.map(m => `  - ${m}`).join("\n")}`)
    process.exit(1)
}
console.log(`dob-ui 冒烟检查通过（${out.length} 字节）`)
