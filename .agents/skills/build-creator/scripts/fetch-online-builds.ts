/**
 * 拉线上构筑，两段式（上游口径：列表只给元数据，BD JSON（charSettings）只有单拉才有）：
 *
 *   bun .agents/skills/build-creator/scripts/fetch-online-builds.ts list <charId> [--limit 20] [--sort likes|views|latest]
 *     元数据列表（id / 标题 / 点赞 / 推荐 / 作者），全量落 .tmp/online-builds/list-<charId>.json（含 desc 里的 DPS 口径）。
 *     大多数情况到这就够了，挑中哪几份再 download。
 *
 *   bun .agents/skills/build-creator/scripts/fetch-online-builds.ts download <id> [id...]
 *     单拉配装，charSettings 落 .tmp/online-builds/<id>.json（文件内容就是 settings JSON，可直接 JSON.parse）。
 *
 * 公开查询无需登录。sortBy 只认 likes / views，其余值（含 createdAt）一律落回 updateAt 倒序。
 * 细节与后续口径（复现基线 / assist 轴 / required 候选）见 SKILL.md 第 2 步。
 */

const EP = "https://api.dna-builder.cn/graphql"
const OUT_DIR = ".tmp/online-builds"

const gql = (query: string, variables: Record<string, unknown>) =>
    fetch(EP, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) }).then(r => r.json())

function usage() {
    console.log("用法见文件头注释：list <charId> [--limit N] [--sort likes|views|latest] / download <id> [id...]")
    process.exit(0)
}

const [, , cmd, ...args] = process.argv

if (cmd === "list") {
    const charId = Number(args[0])
    if (!charId) usage()
    let limit = 20
    let sort = "likes"
    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--limit") limit = Number(args[++i])
        else if (args[i] === "--sort") sort = args[++i]
        else usage()
    }
    if (!["likes", "views", "latest"].includes(sort)) usage()
    const count = (await gql(`query($c:Int!){buildsCount(charId:$c)}`, { c: charId })).data.buildsCount
    const list = (
        await gql(
            `query($c:Int!,$n:Int!,$s:String){builds(charId:$c,limit:$n,sortBy:$s){id title desc views likes isRecommended isPinned updateAt user{name}}}`,
            { c: charId, n: limit, s: sort === "latest" ? null : sort },
        )
    ).data.builds
    for (const [i, b] of list.entries()) {
        console.log(`${String(i + 1).padStart(3)} ${b.isRecommended ? "★" : " "}${b.isPinned ? "置顶" : "  "} ${b.likes}赞 ${b.id} ${b.title}（${b.user?.name}）`)
    }
    await Bun.write(`${OUT_DIR}/list-${charId}.json`, JSON.stringify(list, null, 1))
    const more = list.length < count ? `（未拉全，--limit 可加）` : ""
    console.log(`\n${list.length}/${count} 份${more} → ${OUT_DIR}/list-${charId}.json；挑中后 download <id> 单拉配装`)
} else if (cmd === "download") {
    const ids = args.filter(a => !a.startsWith("--"))
    if (!ids.length) usage()
    for (const id of ids) {
        const d = (await gql(`query($id:String!){build(id:$id){id title charSettings}}`, { id })).data.build
        if (!d) {
            console.log(`${id}：不存在`)
            continue
        }
        await Bun.write(`${OUT_DIR}/${id}.json`, d.charSettings)
        console.log(`${id} ← ${d.title}`)
    }
    console.log(`${ids.length} 份 charSettings → ${OUT_DIR}/`)
} else {
    usage()
}
