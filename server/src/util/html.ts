// 定义允许的标签
const allowedTags = new Set(["br", "b", "i", "s", "u", "em", "a", "img"])

// 定义允许的属性
const allowedAttributes = new Set(["href", "src"])

export const sanitizeHTML = (inputHTML: string) => {
    if (inputHTML.length > 80000) return "[消息过长]"
    // bun
    const rewriter = new HTMLRewriter()
    rewriter.on("*", {
        element(element) {
            const tagName = element.tagName.toLowerCase()
            if (!allowedTags.has(tagName)) {
                element.remove()
            } else {
                for (const [name] of element.attributes) {
                    if (!allowedAttributes.has(name.toLowerCase())) {
                        element.removeAttribute(name)
                    }
                }
            }
        },
    })
    return rewriter.transform(inputHTML)
}
