import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"

export function migrateDatabase() {
    const sqlite = new Database("data.db")
    const db = drizzle(sqlite)
    migrate(db, { migrationsFolder: "./drizzle" })
}
migrateDatabase()
