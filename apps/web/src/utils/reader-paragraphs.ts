export interface SplitReaderParagraphsOptions {
    unwrapLines?: boolean
}

export function splitReaderParagraphs(input: string | null | undefined, options: SplitReaderParagraphsOptions = {}): string[] {
    if (!input) {
        return []
    }

    const blocks = input
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(block => block.length > 0)

    if (!options.unwrapLines) {
        return blocks
    }

    return blocks.flatMap(unwrapBlock)
}

const CJK_TAIL = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]$/
const CJK_CHAR = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/
const SENTENCE_END = /[。！？!?….]$/
const HEADING_MIN_LENGTH = 2
const HEADING_MAX_LENGTH = 12

export function joinWrappedLines(paragraph: string): string {
    return paragraph.replace(/\r?\n[ \t]*/g, (_match, offset: number, source: string) =>
        CJK_TAIL.test(source[offset - 1] ?? "") ? "" : " "
    )
}

function looksLikeHeading(line: string): boolean {
    if (line.length < HEADING_MIN_LENGTH || line.length > HEADING_MAX_LENGTH) return false
    if (/\s/.test(line)) return false
    if (SENTENCE_END.test(line)) return false
    return CJK_CHAR.test(line)
}

function unwrapBlock(block: string): string[] {
    const paragraphs: string[] = []
    let buffer: string[] = []

    function flush(): void {
        if (buffer.length === 0) {
            return
        }

        paragraphs.push(joinWrappedLines(buffer.join("\n")))
        buffer = []
    }

    for (const rawLine of block.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) {
            continue
        }

        if (looksLikeHeading(line)) {
            flush()
            paragraphs.push(line)
            continue
        }

        buffer.push(line)
    }

    flush()
    return paragraphs
}
