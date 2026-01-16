import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "./schema"

// import { PrismaClient } from "@prisma/client/edge"
// export const db = new PrismaClient()

export const db = drizzle(new Database("data.db"), {
    schema,
})

export { schema }
export { yogaPlugin } from "./yoga"
