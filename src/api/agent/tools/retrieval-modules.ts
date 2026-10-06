import type { DbRetrievalToolOptions } from "./db-retrieval"

export const BUILD_RETRIEVAL_MODULES = ["char", "weapon", "mod", "monster", "pet", "damage"] as const

export const DB_RETRIEVAL_PROFILES: Record<string, DbRetrievalToolOptions> = {
    db: { story: true, askUser: true },
    build: { modules: BUILD_RETRIEVAL_MODULES, story: false, askUser: true },
}
