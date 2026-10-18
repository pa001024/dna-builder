import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"

export const REMOTE_BUILD_STORAGE_KEY = "buildRemote"

const readRemoteId = (map: Record<string, string>, charId: number) => map[String(charId)] ?? ""

export const useCharRemote = (charIdRef: Ref<number>) => {
    const store = useLocalStorage<Record<string, string>>(REMOTE_BUILD_STORAGE_KEY, {})

    return computed<string>({
        get: () => readRemoteId(store.value, charIdRef.value),
        set: value => {
            const key = String(charIdRef.value)
            const next = { ...store.value }
            if (value) {
                next[key] = value
            } else {
                delete next[key]
            }
            store.value = next
        },
    })
}
