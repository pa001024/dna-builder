/**
 * @file 更新卡片 HTML 模板。内容来自 DeepSeek（或规则回退），这里只负责排版与转义。
 */

import type { CardContent, CardSection, Highlight } from "./types.ts"

export const CARD_WIDTH = 1080
export const CARD_MIN_HEIGHT = 1200

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char
    })
}

function statsHtml(content: CardContent): string {
    const totalItems = content.sections.reduce((sum, section) => sum + section.items.length, 0)
    return `<span><b style="color:#0284c7">${totalItems}</b>项更新</span><span><b style="color:#7c3aed">${content.sections.length}</b>个分组</span>`
}

function highlightsHtml(highlights: Highlight[]): string {
    if (highlights.length === 0) return ""
    const cards = highlights
        .map(
            highlight => `<div class="highlight">
                <div class="hi-icon">${escapeHtml(highlight.icon)}</div>
                <div class="hi-title">${escapeHtml(highlight.title)}</div>
                <div class="hi-desc">${escapeHtml(highlight.description)}</div>
            </div>`
        )
        .join("")
    return `<div class="highlights" style="--cols:${Math.min(highlights.length, 3)}">${cards}</div>`
}

function sectionHtml(section: CardSection): string {
    const items = section.items
        .map(
            item => `<li>
                <span class="bullet" style="background:${section.accent}"></span>
                <div class="item-text">
                    ${item.name ? `<div class="item-name">${escapeHtml(item.name)}</div>` : ""}
                    <div class="item-desc${item.name ? "" : " item-desc-only"}">${escapeHtml(item.description)}</div>
                </div>
            </li>`
        )
        .join("")
    return `<section class="section">
        <div class="section-head">
            <span class="group-bar" style="background:${section.accent}"></span>
            <span class="group-label">${escapeHtml(section.heading)}</span>
            <span class="group-count">${section.items.length}</span>
        </div>
        <ul class="items">${items}</ul>
    </section>`
}

export function renderCardHtml(data: {
    content: CardContent
    version: string
    previousVersion: string
    date: string
    iconDataUrl: string
    repo: string
    site: string
}): string {
    const { content, version, previousVersion, date, iconDataUrl, repo, site } = data
    const versionLine = previousVersion ? `v${escapeHtml(previousVersion)} → v${escapeHtml(version)}` : `v${escapeHtml(version)}`
    const icon = iconDataUrl ? `<img class="icon" src="${iconDataUrl}" alt="">` : `<div class="icon icon-fallback"><span>DOB</span></div>`

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DNA Builder v${escapeHtml(version)} ${escapeHtml(content.title)}</title>
<style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    html { background: #f6fbff; }
    body {
        position: relative;
        width: ${CARD_WIDTH}px;
        min-height: 100vh;
        color: #0f172a;
        background:
            radial-gradient(760px 520px at 6% -10%, rgba(56, 189, 248, 0.38), transparent 62%),
            radial-gradient(680px 480px at 104% 12%, rgba(167, 139, 250, 0.30), transparent 60%),
            radial-gradient(820px 620px at 48% 112%, rgba(45, 212, 191, 0.20), transparent 64%),
            #f6fbff;
        font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
    }
    .bg-grid {
        position: absolute;
        inset: 0;
        background-image:
            linear-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15, 23, 42, 0.035) 1px, transparent 1px);
        background-size: 52px 52px;
        mask-image: radial-gradient(circle at 50% 40%, #000 30%, transparent 82%);
    }
    .card {
        position: relative;
        min-height: 100vh;
        padding: 76px 78px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    .topline {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 9px;
        background: linear-gradient(90deg, #38bdf8, #6366f1 55%, #2dd4bf);
    }
    .head { display: flex; align-items: center; justify-content: space-between; }
    .brand { display: flex; align-items: center; gap: 20px; }
    .icon {
        width: 84px;
        height: 84px;
        border-radius: 22px;
        object-fit: cover;
        background: #fff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: 0 10px 28px rgba(14, 165, 233, 0.18);
    }
    .icon-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Bahnschrift", "Segoe UI", sans-serif;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 2px;
        color: #0284c7;
    }
    .wordmark { font-size: 30px; font-weight: 800; letter-spacing: 5px; line-height: 1; color: #0f172a; }
    .tagline { margin-top: 10px; font-size: 18px; color: #64748b; letter-spacing: 0.5px; }
    .version-pill {
        font-family: "Bahnschrift", "Segoe UI", sans-serif;
        font-size: 24px;
        font-weight: 700;
        color: #fff;
        background: #0f172a;
        padding: 10px 22px;
        border-radius: 999px;
        letter-spacing: 1px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
    }
    .hero { margin-top: 58px; }
    .eyebrow {
        font-family: "Bahnschrift", "Segoe UI", sans-serif;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 6px;
        color: #0284c7;
    }
    .hero h1 { margin: 12px 0 0; max-width: 930px; font-size: 58px; line-height: 1.18; letter-spacing: 1px; font-weight: 800; }
    .subtitle { margin: 16px 0 0; max-width: 880px; font-size: 23px; line-height: 36px; color: #475569; }
    .meta { margin-top: 20px; display: flex; align-items: center; gap: 14px; font-size: 21px; color: #475569; }
    .meta .ver { font-family: "Bahnschrift", "Segoe UI", sans-serif; font-weight: 600; color: #0f172a; }
    .meta .dot { width: 5px; height: 5px; border-radius: 50%; background: #94a3b8; }
    .stats { margin-top: 16px; display: flex; gap: 26px; font-size: 18px; color: #64748b; }
    .stats b { font-family: "Bahnschrift", "Segoe UI", sans-serif; font-size: 25px; margin-right: 4px; }
    .highlights {
        margin-top: 38px;
        display: grid;
        grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
        gap: 16px;
    }
    .highlight {
        padding: 22px 22px 20px;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 18px;
        box-shadow: 0 10px 26px rgba(15, 23, 42, 0.05);
    }
    .hi-icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        line-height: 1;
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(99, 102, 241, 0.10));
        border-radius: 14px;
    }
    .hi-title { margin-top: 14px; font-size: 21px; font-weight: 700; line-height: 30px; }
    .hi-desc { margin-top: 8px; font-size: 17px; line-height: 27px; color: #475569; }
    .divider { margin: 38px 0 32px; height: 1px; background: linear-gradient(90deg, rgba(14, 165, 233, 0.55), rgba(99, 102, 241, 0.25) 45%, transparent); }
    .section { margin-bottom: 28px; }
    .section:last-of-type { margin-bottom: 0; }
    .section-head { display: flex; align-items: center; gap: 12px; }
    .group-bar { width: 6px; height: 26px; border-radius: 3px; }
    .group-label { font-size: 24px; font-weight: 700; letter-spacing: 1px; }
    .group-count {
        margin-left: 2px;
        padding: 1px 10px;
        font-family: "Bahnschrift", "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 24px;
        color: #64748b;
        background: rgba(15, 23, 42, 0.05);
        border-radius: 999px;
    }
    .items { list-style: none; margin: 14px 0 0; padding: 0 0 0 18px; }
    .items li { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .items li:last-child { margin-bottom: 0; }
    .bullet { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 2px; margin-top: 15px; }
    .item-text { flex: 1; min-width: 0; }
    .item-name { font-size: 24px; font-weight: 700; line-height: 34px; color: #0f172a; }
    .item-desc { margin-top: 2px; font-size: 19px; line-height: 30px; color: #475569; }
    .item-desc-only { margin-top: 0; font-size: 23px; line-height: 34px; color: #1e293b; }
    footer {
        margin-top: 34px;
        padding-top: 26px;
        border-top: 1px solid rgba(15, 23, 42, 0.10);
        display: flex;
        justify-content: space-between;
        font-size: 18px;
        color: #64748b;
        letter-spacing: 0.5px;
    }
    footer .url { font-family: "Bahnschrift", "Consolas", monospace; }
</style>
</head>
<body>
    <div class="bg-grid"></div>
    <main class="card">
        <div class="topline"></div>
        <header class="head">
            <div class="brand">
                ${icon}
                <div>
                    <div class="wordmark">DNA BUILDER</div>
                    <div class="tagline">二重螺旋 · 配装与伤害计算工具</div>
                </div>
            </div>
            <div class="version-pill">v${escapeHtml(version)}</div>
        </header>
        <section class="hero">
            <div class="eyebrow">RELEASE NOTES</div>
            <h1>${escapeHtml(content.title)}</h1>
            ${content.subtitle ? `<p class="subtitle">${escapeHtml(content.subtitle)}</p>` : ""}
            <div class="meta"><span class="ver">${versionLine}</span><span class="dot"></span><span>${escapeHtml(date)}</span></div>
            <div class="stats">${statsHtml(content)}</div>
        </section>
        ${highlightsHtml(content.highlights)}
        <div class="divider"></div>
        ${content.sections.map(sectionHtml).join("")}
        <footer>
            <span class="url">github.com/${escapeHtml(repo)}</span>
            <span>${escapeHtml(site)}</span>
        </footer>
    </main>
</body>
</html>`
}
