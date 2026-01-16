import { Database } from "bun:sqlite"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"

export function migrateDatabase() {
    const sqlite = new Database("data.db")
    const db = drizzle(sqlite)
    migrate(db, { migrationsFolder: "./drizzle" })
}
migrateDatabase()
