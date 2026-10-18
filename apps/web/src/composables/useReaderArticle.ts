import { onBeforeUnmount, onMounted, watch } from "vue"

export interface ReaderArticleMeta {
    title: string
    description?: string
    url?: string
}

const READER_SITE_NAME = "Duet Night Abyss Builder"
const READER_MARK = "data-reader-article"

interface ManagedTag {
    node: Element
    created: boolean
    previous: string | null
}

export function useReaderArticle(resolve: () => ReaderArticleMeta | null): void {
    const tags: ManagedTag[] = []

    function setMeta(property: string, content: string): void {
        let managed = tags.find(item => item.node.tagName === "META" && item.node.getAttribute("property") === property)
        if (!managed) {
            const existing = document.head.querySelector(`meta[property="${property}"]`)
            if (existing) {
                managed = { node: existing, created: false, previous: existing.getAttribute("content") }
            } else {
                const created = document.createElement("meta")
                created.setAttribute("property", property)
                created.setAttribute(READER_MARK, "")
                document.head.appendChild(created)
                managed = { node: created, created: true, previous: null }
            }
            tags.push(managed)
        }

        managed.node.setAttribute("content", content)
    }

    function setJsonLd(payload: Record<string, unknown>): void {
        let managed = tags.find(item => item.node.tagName === "SCRIPT")
        if (!managed) {
            const created = document.createElement("script")
            created.setAttribute("type", "application/ld+json")
            created.setAttribute(READER_MARK, "")
            document.head.appendChild(created)
            managed = { node: created, created: true, previous: null }
            tags.push(managed)
        }

        managed.node.textContent = JSON.stringify(payload)
    }

    function apply(): void {
        const meta = resolve()
        if (!meta) {
            return
        }

        setMeta("og:type", "article")
        setMeta("og:title", meta.title)
        setMeta("og:site_name", READER_SITE_NAME)
        if (meta.description) {
            setMeta("og:description", meta.description)
        }
        if (meta.url) {
            setMeta("og:url", meta.url)
        }

        setJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: meta.title,
            description: meta.description,
            inLanguage: document.documentElement.lang || "zh-CN",
            isPartOf: { "@type": "WebSite", name: READER_SITE_NAME, url: meta.url },
            publisher: { "@type": "Organization", name: READER_SITE_NAME },
        })
    }

    function restore(): void {
        for (const managed of tags) {
            if (managed.created) {
                managed.node.remove()
            } else if (managed.previous === null) {
                managed.node.removeAttribute("content")
            } else {
                managed.node.setAttribute("content", managed.previous)
            }
        }

        tags.length = 0
    }

    onMounted(apply)
    onBeforeUnmount(restore)
    watch(resolve, apply)
}
