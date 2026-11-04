/** 动态发布与卡片渲染共用的类型。 */

export interface SummaryItem {
    scope: string
    description: string
    breaking: boolean
}

export interface SummaryGroup {
    key: string
    label: string
    accent: string
    total: number
    items: SummaryItem[]
}

export interface CommitSummary {
    groups: SummaryGroup[]
    counts: Record<string, number>
    totalCount: number
    selectedCount: number
    hiddenCount: number
    breaking: boolean
}

export interface Highlight {
    icon: string
    title: string
    description: string
}

export interface CardItem {
    /** 短标题；AI 生成时通常有，规则回退时可能为空 */
    name: string
    description: string
}

export interface CardSection {
    heading: string
    accent: string
    items: CardItem[]
}

/** DeepSeek 生成（或规则回退）的完整卡片内容 */
export interface CardContent {
    title: string
    subtitle: string
    highlights: Highlight[]
    sections: CardSection[]
    body: string
}

export interface BiliCredentials {
    sessdata: string
    csrf: string
    buvid3: string
    dedeUserId: string
}

export type CredentialState =
    | { status: "ok"; missing: string[]; credentials: BiliCredentials }
    | { status: "none"; missing: string[]; credentials: null }
    | { status: "partial"; missing: string[]; credentials: null }

export interface PublishResult {
    dynId: string
    url: string
    uname: string
}

export interface ScreenshotResult {
    width: number
    height: number
    bytes: number
    browser: string
}

export interface VersionMeta {
    version: string
    previousVersion: string
    tag: string
    previousTag: string
    date: string
    repo: string
    site: string
}
