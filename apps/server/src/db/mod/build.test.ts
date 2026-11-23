import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, mock } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { talents } from "dna-builder-data/d"
import { createTestDb, seedUser } from "../../bugs/test-helpers"
import { computeBuildType } from "../../build-info"
import * as realSchema from "../schema"

/**
 * U140b：构筑类型落库与过滤。
 * build.ts 使用模块级 db，这里在导入前把 `..` 换成内存库（与 api/bugs.test.ts 同一手法）。
 */

const { db: testDb } = createTestDb()

const dbProxy = new Proxy({} as typeof testDb, {
    get(_target, prop) {
        const value = (testDb as unknown as Record<string | symbol, unknown>)[prop]
        return typeof value === "function" ? value.bind(testDb) : value
    },
})

mock.module("..", () => ({ db: dbProxy, schema: realSchema }))

const { resolvers } = await import("./build")

const USER_ID = "build-user"
const CHAR_ID = 1101

const NORMAL_SETTINGS = "{}"
const TRANSCEND_SETTINGS = '{"transcend":{"enabled":true}}'
/** 关闭总开关但保留天赋 / 装备：按 enabled-only 口径仍是普通（U140-fix §156） */
const DISABLED_WITH_CONTENT = JSON.stringify({
    transcend: { enabled: false, talentLevels: [[talents[0]?.id ?? 1, 1]], gearVariants: [["A", [[1, {}]]]] },
})

/** 真实迁移文件：回填测试必须执行它，而不是测试内复制的 SQL 副本 */
const MIGRATION_0035 = readFileSync(resolve(import.meta.dir, "../../../drizzle/0035_tired_xorn.sql"), "utf8")

/**
 * 按 drizzle 的语句分隔符拆分迁移文件。
 * @param content 迁移 SQL 文本
 * @returns 去空后的语句列表
 */
function splitMigrationStatements(content: string): string[] {
    return content
        .split("--> statement-breakpoint")
        .map(statement => statement.trim())
        .filter(Boolean)
}

type Mutation = (parent: unknown, args: any, context: any, info: any) => Promise<any>
type Query = (parent: unknown, args: any, context: any, info: any) => Promise<any>

const createBuild = (resolvers.Mutation as unknown as { createBuild: Mutation }).createBuild
const updateBuild = (resolvers.Mutation as unknown as { updateBuild: Mutation }).updateBuild
const queryBuilds = (resolvers.Query as unknown as { builds: Query }).builds
const queryBuildsCount = (resolvers.Query as unknown as { buildsCount: Query }).buildsCount

/** 测试上下文：登录用户（build resolver 只读 context.user） */
function makeContext() {
    return { user: { id: USER_ID, name: USER_ID } } as any
}

/**
 * 通过 createBuild 落库一份构筑并返回结果。
 * @param charSettings 构筑配置原文
 * @param title 标题
 * @returns 新建构筑
 */
async function seedBuild(charSettings: string, title = "测试构筑") {
    return createBuild({}, { input: { title, charId: CHAR_ID, charSettings } }, makeContext(), {})
}

/**
 * 读取指定构筑的落库行。
 * @param id 构筑 id
 * @returns 落库行
 */
function readRow(id: string) {
    return testDb.select().from(realSchema.builds).where(eq(realSchema.builds.id, id)).get()
}

beforeEach(() => {
    testDb.delete(realSchema.builds).run()
    testDb.delete(realSchema.users).where(eq(realSchema.users.id, USER_ID)).run()
    seedUser(testDb, USER_ID)
})

describe("构筑类型入库", () => {
    it("createBuild 按 charSettings 写入 build_type", async () => {
        const normal = await seedBuild(NORMAL_SETTINGS, "普通")
        const ascend = await seedBuild(TRANSCEND_SETTINGS, "升华")
        const disabled = await seedBuild(DISABLED_WITH_CONTENT, "关闭升华但保留配置")

        expect(readRow(normal.id)?.buildType).toBe("normal")
        expect(readRow(ascend.id)?.buildType).toBe("transcend")
        expect(readRow(disabled.id)?.buildType).toBe("normal")
        // 列表返回的行同样带上入库值，供 Build.info 直接读取
        expect(ascend.buildType).toBe("transcend")
    })

    it("updateBuild 随配置重新计算 build_type", async () => {
        const build = await seedBuild(NORMAL_SETTINGS)
        expect(readRow(build.id)?.buildType).toBe("normal")

        await updateBuild({}, { id: build.id, input: { title: "升华版", charId: CHAR_ID, charSettings: TRANSCEND_SETTINGS } }, makeContext(), {})
        expect(readRow(build.id)?.buildType).toBe("transcend")

        await updateBuild(
            {},
            { id: build.id, input: { title: "关闭升华", charId: CHAR_ID, charSettings: DISABLED_WITH_CONTENT } },
            makeContext(),
            {}
        )
        expect(readRow(build.id)?.buildType).toBe("normal")
    })

    it("损坏配置写入普通", async () => {
        const build = await seedBuild("{ not json")

        expect(readRow(build.id)?.buildType).toBe("normal")
    })
})

describe("构筑类型过滤", () => {
    it("builds 按 buildType 过滤，buildsCount 同口径", async () => {
        const normal = await seedBuild(NORMAL_SETTINGS, "普通")
        const ascend = await seedBuild(TRANSCEND_SETTINGS, "升华")

        const ascendList = await queryBuilds({}, { charId: CHAR_ID, buildType: "transcend" }, makeContext(), {})
        expect(ascendList.map((item: { id: string }) => item.id)).toEqual([ascend.id])

        const normalList = await queryBuilds({}, { charId: CHAR_ID, buildType: "normal" }, makeContext(), {})
        expect(normalList.map((item: { id: string }) => item.id)).toEqual([normal.id])

        const allList = await queryBuilds({}, { charId: CHAR_ID }, makeContext(), {})
        expect(allList.map((item: { id: string }) => item.id).sort()).toEqual([normal.id, ascend.id].sort())

        expect(await queryBuildsCount({}, { charId: CHAR_ID, buildType: "transcend" }, makeContext(), {})).toBe(1)
        expect(await queryBuildsCount({}, { charId: CHAR_ID, buildType: "normal" }, makeContext(), {})).toBe(1)
        expect(await queryBuildsCount({}, { charId: CHAR_ID }, makeContext(), {})).toBe(2)
    })

    it("旧数据回填执行真实 0035 迁移 SQL，结果与运行时判定一致", () => {
        const statements = splitMigrationStatements(MIGRATION_0035)
        // 结构语句真实存在；内存库由 createTestDb 全量迁移，列 / 索引已建好，故只执行回填段
        expect(statements.some(statement => statement.startsWith("ALTER TABLE `builds`"))).toBe(true)
        expect(statements.some(statement => statement.startsWith("CREATE INDEX `builds_build_type_idx`"))).toBe(true)

        const configs = [
            '{"transcend":{"enabled":1}}',
            '{"transcend":{"enabled":0}}',
            '{"transcend":{"enabled":true}}',
            '{"transcend":{"enabled":"true"}}',
            '{"transcend":{"enabled":2}}',
            '{"transcend":[]}',
            '{"transcend":null}',
            '{"transcend":"x"}',
            DISABLED_WITH_CONTENT,
            "null",
            "5",
            "[]",
            "{}",
            "{ not json",
        ]
        configs.forEach((charSettings, index) => {
            // 不写 build_type：模拟迁移前的落库行（列默认 normal）
            testDb
                .insert(realSchema.builds)
                .values({ id: `legacy-${index}`, title: "旧构筑", charId: CHAR_ID, charSettings, userId: USER_ID })
                .run()
        })

        const updates = statements.filter(statement => /^UPDATE/i.test(statement))
        expect(updates.length).toBeGreaterThan(0)
        for (const statement of updates) testDb.run(sql.raw(statement))

        configs.forEach((charSettings, index) => {
            expect(readRow(`legacy-${index}`)?.buildType).toBe(computeBuildType(charSettings))
        })
    })

    it("info 读取入库值，不按 charSettings 二次解析", async () => {
        const build = await seedBuild(TRANSCEND_SETTINGS)
        // 模拟迁移前数据 / 手工改写：入库值与配置不一致时以入库值为准
        testDb.update(realSchema.builds).set({ buildType: "normal" }).where(eq(realSchema.builds.id, build.id)).run()

        const [row] = await queryBuilds({}, { charId: CHAR_ID }, makeContext(), {})
        const info = (resolvers.Build as unknown as { info: (parent: unknown) => { buildType: string } }).info(row)
        expect(info.buildType).toBe("normal")
    })
})
