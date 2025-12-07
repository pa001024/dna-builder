import { computed } from "vue"

export function useState<T, N extends keyof T>(obj: T, key: N) {
    return [computed(() => obj[key]), (val: T[N]) => (obj[key] = val)] as const
}
