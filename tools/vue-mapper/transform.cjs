"use strict"

// Pure SFC -> virtual-TypeScript transform used by mapper.cjs.
// Uses the host project's `typescript` module and this package's
// `@vue/language-core`: the same codegen vue-tsc type-checks.

const VERBATIM = 0
const ATOM = 1

function toSpanTuples(mappings, virtualText, originalText) {
    const tuples = []
    if (!mappings) {
        return tuples
    }
    for (const m of mappings) {
        const sources = m.sourceOffsets
        const generated = m.generatedOffsets
        const lengths = m.lengths
        if (!sources || !generated || !lengths) {
            continue
        }
        const n = Math.min(sources.length, generated.length, lengths.length)
        for (let i = 0; i < n; i++) {
            const len = lengths[i]
            if (typeof len !== "number" || len <= 0) {
                continue
            }
            const s = sources[i]
            const g = generated[i]
            if (typeof s !== "number" || typeof g !== "number") {
                continue
            }
            let kind = VERBATIM
            if (typeof virtualText === "string" && typeof originalText === "string") {
                if (virtualText.slice(g, g + len) !== originalText.slice(s, s + len)) {
                    kind = ATOM
                }
            }
            tuples.push([g, len, s, len, kind])
        }
    }
    tuples.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    return tuples
}

function createProjectState(ts, core, compilerOptions, vueOptions) {
    const plugin = core.createVueLanguagePlugin(ts, compilerOptions, vueOptions, id => id)
    return { ts, plugin }
}

function transformFile(state, fileName, content) {
    const { ts, plugin } = state
    const snapshot = ts.ScriptSnapshot.fromString(content)
    const vcode = plugin.createVirtualCode(fileName, "vue", snapshot)
    if (!vcode) {
        return { text: content, extension: ".ts", mappings: [] }
    }
    const svc = plugin.typescript.getServiceScript(vcode)
    if (!svc?.code?.snapshot) {
        return { text: content, extension: ".ts", mappings: [] }
    }
    const snap = svc.code.snapshot
    const text = snap.getText(0, snap.getLength())
    return {
        text,
        extension: typeof svc.extension === "string" && svc.extension.startsWith(".") ? svc.extension : ".ts",
        mappings: toSpanTuples(svc.code.mappings, text, content),
    }
}

module.exports = { createProjectState, transformFile, toSpanTuples }
