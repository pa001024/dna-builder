import { MiHomeError } from "./errors"

export interface TokenStore {
    load(): string | null
    save(raw: string): void
    clear(): void
}

export class InMemoryTokenStore implements TokenStore {
    private raw: string | null = null
    load(): string | null {
        return this.raw
    }
    save(raw: string): void {
        this.raw = raw
    }
    clear(): void {
        this.raw = null
    }
}

export class AuthStore {
    private data: Record<string, unknown> = {}

    constructor(private readonly store: TokenStore) {
        const raw = store.load()
        if (raw === null || raw === "") return
        try {
            const parsed: unknown = JSON.parse(raw)
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                this.data = parsed as Record<string, unknown>
                return
            }
        } catch {
            // fall through: treat as logged-out, keep old blob retrievable via clear()
        }
        this.data = {}
    }

    getStr(key: string): string | null {
        const v = this.data[key]
        return typeof v === "string" ? v : null
    }

    getI64(key: string): number | null {
        const v = this.data[key]
        return typeof v === "number" && Number.isInteger(v) ? v : null
    }

    set(key: string, value: unknown): void {
        this.data[key] = value
    }

    containsAll(keys: string[]): boolean {
        return keys.every(k => k in this.data)
    }

    save(): void {
        this.store.save(JSON.stringify(this.data, null, 2))
    }

    clear(): void {
        this.data = {}
        this.store.clear()
    }

    static saveTimeMs(): number {
        return Date.now()
    }
}

export function requireTokens(auth: AuthStore, keys: string[]): void {
    if (!auth.containsAll(keys)) throw MiHomeError.login(-1, "刷新Token失败，请重新登录")
}
