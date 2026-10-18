import contractSource from "@/utils/build-api.contract.d.ts?raw"

/**
 * 沙箱接口契约原文。
 *
 * `build-api.contract.d.ts` 同时是 TypeScript 的类型来源与给模型看的文档，
 * 这里按原文取出来拼进系统提示词，避免两边各写一份而渐渐对不上。
 */
export const BUILD_API_DTS: string = contractSource
