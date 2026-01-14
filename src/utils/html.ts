import { copyText } from "@/util"
import DOMPurify from "dompurify"
// 定义允许的标签
const allowedTags = new Set(["br", "b", "i", "s", "u", "em", "a", "img"])

// 定义允许的属性
const allowedAttributes = new Set(["href", "src"])

export const sanitizeHTML = (inputHTML: string) => {
    // 创建一个新的 DOMParser 实例
    const parser = new DOMParser()
    // 解析输入的 HTML 字符串
    const doc = parser.parseFromString(inputHTML, "text/html")

    // 遍历文档中的所有元素
    const elements = doc.body.querySelectorAll("*")
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        const tagName = el.tagName.toLowerCase()

        // 如果元素的标签不在允许的标签集合中，则移除该元素
        if (!allowedTags.has(tagName)) {
            el.parentNode?.removeChild(el)
        } else {
            // 如果元素在允许的标签集合中，移除所有不在允许列表中的属性
            Array.from(el.attributes).forEach(attr => {
                if (!allowedAttributes.has(attr.name.toLowerCase())) {
                    el.removeAttribute(attr.name)
                }
            })
        }
    }

    return DOMPurify.sanitize(doc.body.innerHTML)
}

export const htmlToText = (inputHTML: string) => {
    // 创建一个新的 DOMParser 实例
    const parser = new DOMParser()
    // 解析输入的 HTML 字符串
    const doc = parser.parseFromString(inputHTML, "text/html")

    // 替换img标签到[图片]
    const imgs = doc.body.querySelectorAll("img")
    for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i]
        img.parentNode?.replaceChild(doc.createTextNode("[图片]"), img)
    }

    return doc.body.textContent || ""
}

export const copyHtmlContent = async (text: string) => {
    await copyText(htmlToText(text))
}

export const isImage = (inputHTML: string) => {
    // 创建一个新的 DOMParser 实例
    const parser = new DOMParser()
    // 解析输入的 HTML 字符串
    const doc = parser.parseFromString(inputHTML, "text/html")

    return (
        doc.body.children.length === 1 &&
        doc.body.children[0].tagName.toLowerCase() === "img" &&
        doc.body.children[0].hasAttribute("src") &&
        doc.body.textContent?.trim() === ""
    )
}
