const allowedTags = new Set(["p", "br", "b", "i", "s", "u", "em", "strong", "a", "img", "div", "span"])

const allowedAttributes = new Set(["href", "src"])

function isSafeURL(value: string): boolean {
    if (!value || typeof value !== "string") return false

    const valueLower = value.toLowerCase().trim()

    if (valueLower.startsWith("javascript:")) return false
    if (valueLower.startsWith("vbscript:")) return false
    if (
        valueLower.startsWith("data:") &&
        !valueLower.startsWith("data:image/png;base64,") &&
        !valueLower.startsWith("data:image/gif;base64,") &&
        !valueLower.startsWith("data:image/jpeg;base64,") &&
        !valueLower.startsWith("data:image/webp;base64,")
    )
        return false
    if (valueLower.startsWith("file:")) return false
    if (valueLower.startsWith("about:")) return false

    return true
}

export const sanitizeHTML = (inputHTML: string) => {
    if (inputHTML.length > 80000) return "[消息过长]"

    const rewriter = new HTMLRewriter()
    rewriter.on("*", {
        element(element) {
            const tagName = element.tagName.toLowerCase()
            if (!allowedTags.has(tagName)) {
                element.remove()
                return
            }

            const attributes = element.attributes
            const attributesToRemove: string[] = []

            for (const [name, value] of attributes) {
                const attrLower = name.toLowerCase()

                if (!allowedAttributes.has(attrLower)) {
                    attributesToRemove.push(name)
                    continue
                }

                if ((attrLower === "href" || attrLower === "src") && !isSafeURL(value)) {
                    attributesToRemove.push(name)
                }
            }

            for (const attr of attributesToRemove) {
                element.removeAttribute(attr)
            }
        },
    })

    return rewriter.transform(inputHTML)
}
