export interface UiFrameEntry {
    id: number
    widget: string
    key: string
    package: string
}

export function parseUiFrameEntries(source: string, kind: "title" | "head"): UiFrameEntry[] {
    const field = kind === "head" ? "DynamicPath" : "FramePath"
    const prefix = kind === "head" ? "WBP_DynamicFrame_" : "WBP_PersonalInfo_Title_"
    const entries: UiFrameEntry[] = []
    for (const match of source.matchAll(/\[(\d+)\]\s*=\s*\{([^}]*)\}/g)) {
        const resource = new RegExp(`${field}\\s*=\\s*"([^"]+)"`).exec(match[2])?.[1]
        const packagePath = resource?.match(/\/Game\/[^'.]+/)?.[0]
        const widget = packagePath?.split("/").pop()
        if (!packagePath || !widget?.startsWith(prefix)) continue
        entries.push({
            id: Number(match[1]),
            widget,
            key: widget.slice(prefix.length),
            package: packagePath.replace(/^\/Game\//, "EM/Content/"),
        })
    }
    return entries
}

export function normalizeFrameAnimationLabel(label: string): string {
    return label
        .replace(/_INST$/i, "")
        .replace(/^Auto_/i, "")
        .toLowerCase()
}
