/**
 * @file 上一版本 tag 的解析与校验。
 * 工作流的「Get previous tag」按创建时间取第二个 tag，重跑旧 tag 时会指错版本，
 * 所以这里独立于 git 调用做校验，便于单测。
 */

export interface PreviousTagDeps {
    /** 执行只读 git 命令，失败返回空串 */
    tryGit(args: string[]): string
    /** tag 是否是 revision 的祖先（含同提交） */
    isAncestor(tag: string, revision: string): boolean
}

function commitOf(tag: string, deps: PreviousTagDeps): string {
    return deps.tryGit(["rev-parse", "--verify", `${tag}^{commit}`])
}

/** 找 revision 之前最近的 tag（用 describe 定位，而不是按创建时间取列表） */
export function findPreviousTag(revision: string, currentTag: string, deps: PreviousTagDeps): string {
    // 本地用 HEAD 预览时 currentTag 取自 package.json，不能与自身比较（区间会退化成 X..X 空集）
    const described = deps.tryGit(["describe", "--tags", "--abbrev=0", `${revision}^`])
    if (described) return described
    // 按提交而不是 tag 名过滤：--tag HEAD 时发布 tag 恰好指向当前提交，按名字比会把它当成上一版本；
    // 创建时间排序里也可能混进更晚的分支 tag，必须再要求它是祖先
    const currentCommit = commitOf(revision, deps)
    const tags = deps
        .tryGit(["tag", "--sort=-creatordate"])
        .split(/\r?\n/)
        .map(tag => tag.trim())
        .filter(tag => /^v\d/.test(tag) && tag !== revision && tag !== currentTag)
        .filter(tag => (currentCommit ? commitOf(tag, deps) !== currentCommit : true))
        .filter(tag => deps.isAncestor(tag, revision))
    return tags[0] ?? ""
}

/**
 * @description 校验传入的上一版本 tag，不合格时回退到自动查找。
 * 仅「是祖先」还不够：重跑 v1.4.0 时传入 v1.2.0 同样是祖先，区间会把 v1.3.0 的提交混进来，
 * 因此要求它必须与最近的上一个 tag 指向同一个提交。
 * @param candidate 工作流或命令行给出的 tag
 * @param revision 本次发布的 revision
 * @param currentTag 本次发布的 tag
 * @param deps git 调用
 * @returns 可安全用于 `previous..revision` 区间的 tag（可能为空）
 */
export function resolvePreviousTag(candidate: string, revision: string, currentTag: string, deps: PreviousTagDeps): string {
    const tag = candidate.trim()
    const nearest = findPreviousTag(revision, currentTag, deps)
    if (!tag) return nearest
    if (!commitOf(tag, deps)) {
        console.warn(`  上一版本 tag 不存在：${tag}，改为自动查找`)
        return nearest
    }
    if (!deps.isAncestor(tag, revision)) {
        console.warn(`  上一版本 tag ${tag} 不是 ${currentTag} 的祖先，改为自动查找`)
        return nearest
    }
    // 指向本次发布的提交时区间为空，等于没有上一版本
    if (commitOf(tag, deps) === commitOf(revision, deps)) {
        console.warn(`  上一版本 tag ${tag} 指向 ${currentTag} 自身，改为自动查找`)
        return nearest
    }
    // 更早的 tag 也是祖先，但它会把中间版本的提交算进本次区间
    if (nearest && commitOf(tag, deps) !== commitOf(nearest, deps)) {
        console.warn(`  上一版本 tag ${tag} 不是 ${currentTag} 最近的上一个版本（应为 ${nearest}），改用 ${nearest}`)
        return nearest
    }
    return tag
}
