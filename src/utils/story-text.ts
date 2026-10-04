/**
 * 剧情文本工具（转引）。
 *
 * 实现已下沉到数据层（`data/story-text.ts`）——剧情原文来自数据包，本文件是这些文本的读取规则，
 * RAG 切块与服务端索引同样要用；此处仅保留转引，供前端按 utils 路径引用。
 */
export * from "@/data/story-text"
