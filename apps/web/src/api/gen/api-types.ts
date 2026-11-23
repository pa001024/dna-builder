export interface User {
    id: string
    name?: string
    email?: string
    qq?: string
    pic?: string
    uid?: string
    roles?: string
    experience: number
    points: number
    level: number
    selectedTitleAssetId?: string
    selectedNameCardAssetId?: string
    currentTitleText?: string
    currentTitleClass?: string
    nameEffectClass?: string
    dailyExperienceStatus?: UserDailyExperienceStatus
    abyssUsageUploadStatus?: UserAbyssUsageUploadStatus
    createdAt?: number
    updateAt?: number
}

export interface UserDailyExperienceStatus {
    todayAwardedExp: number
    totalAvailableExp: number
    dailyLaunchProgress: number
    dailyLaunchLimit: number
    dailyOnlineHourProgress: number
    dailyOnlineHourLimit: number
    dailyMessageProgress: number
    dailyMessageLimit: number
    dailyOnlineHourRetryAfterMs?: number
}

export interface UserAbyssUsageUploadStatus {
    uploadedThisSeason: boolean
}

export interface UserLoginResult {
    success: boolean
    message: string
    token?: string
    user?: User
}

export interface UserExperienceRewardResult {
    success: boolean
    message: string
    source: string
    awardedExp: number
    awardedPoints: number
    retryAfterMs?: number
    user?: User
}

export interface TinyUser {
    id: string
    name: string
    qq?: string
    roles?: string
}

export interface Todo {
    id: string
    title: string
    description?: string
    startTime?: number
    endTime?: number
    type: string
    userId: string
    createdAt: number
    updateAt: number
    user?: User
    isCompleted?: boolean
}

export interface Timeline {
    id: string
    title: string
    charId: number
    charName: string
    tracks: string
    items: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
}

export interface Subscription {
    newTask: Task
    updateTask: Task
    watchTask: Task
}

export interface Task {
    id: string
    name: string
    desc?: string
    maxUser: number
    maxAge?: number
    userList?: string[]
    startTime?: number
    endTime?: number
    roomId: string
    userId: string
    createdAt?: number
    updateAt?: number
    online?: boolean
    paused?: boolean
    user: User
}

export interface ShopAsset {
    id: string
    rewardType: string
    rewardKey: string
    rewardName: string
    displayClass?: string
    displayCss?: string
    createdAt?: number
    updateAt?: number
}

export interface ShopProduct {
    id: string
    name: string
    description?: string
    assetId: string
    rewardType: string
    rewardKey: string
    rewardName: string
    displayClass?: string
    displayCss?: string
    pointsCost: number
    sortOrder: number
    isActive: boolean
    startTime?: number
    endTime?: number
    createdAt?: number
    updateAt?: number
    asset: ShopAsset
}

export interface UserShopItem {
    id: string
    userId: string
    assetId: string
    createdAt?: number
    asset: ShopAsset
}

export interface UserShopSummary {
    points: number
    selectedTitleAssetId?: string
    selectedNameCardAssetId?: string
    selectedTitleAsset?: ShopAsset
    selectedNameCardAsset?: ShopAsset
    ownedAssetIds?: string[]
}

export interface ShopRedemption {
    id: string
    userId: string
    productId: string
    assetId: string
    pointsCost: number
    createdAt?: number
    user?: User
    product?: ShopProduct
    asset?: ShopAsset
}

export interface ShopRedeemResult {
    success: boolean
    message: string
    awardedAsset?: ShopAsset
    user?: User
}

export interface ShopEquipResult {
    success: boolean
    message: string
    user?: User
    selectedTitleAsset?: ShopAsset
    selectedNameCardAsset?: ShopAsset
}

export interface ScriptCategory {
    id: string
    name: string
    description?: string
    createdAt: number
    updateAt: number
}

export interface Script {
    id: string
    title: string
    description?: string
    content: string
    category: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
}

export interface RtcJoinResult {
    id: string
    end: boolean
    user: TinyUser
    clients?: RtcClient[]
}

export interface RtcClient {
    id: string
    end: boolean
    user: TinyUser
}

export interface RtcEvent {
    id: string
    type: string
    from: string
    to: string
    body: string
}

export interface RoomUserChange {
    id: string
    roomId: string
    userId: string
    end: boolean
    user: TinyUser
}

export interface Room {
    id: string
    name: string
    type?: string
    ownerId: string
    maxUsers?: number
    createdAt?: number
    updateAt?: number
    owner?: User
    msgCount: number
    lastMsg?: Msg
    onlineUsers?: TinyUser[]
}

export interface RankingList {
    id: string
    name: string
    desc?: string
    createdAt: number
    updateAt: number
    items?: RankingListItem[]
}

export interface RankingListItem {
    id: string
    rankingListId: string
    charId: number
    buildId: string
    sortOrder: number
    createdAt: number
    updateAt: number
    build?: Build
}

export interface MissionsIngame {
    id: number
    server: string
    missions?: string[][]
    createdAt?: number
}

export interface Msg {
    id: string
    roomId: string
    userId: string
    content: string
    edited?: number
    createdAt?: number
    updateAt?: number
    replyToMsgId?: string
    replyToUserId?: string
    user?: User
    replyTo?: Msg
    reactions?: Reaction[]
}

export interface Reaction {
    id: string
    msgId: string
    count?: number
    users?: User[]
    createdAt?: number
}

export interface Guide {
    id: string
    title: string
    type: string
    content: string
    images?: string[]
    charId?: number
    userId: string
    buildId?: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
}

export interface Graph {
    id: string
    title: string
    desc?: string
    graphData: string
    graphInfo: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
}

export interface GameModVersion {
    id: string
    version: string
    changelog?: string
    fileName: string
    fileSize: number
    downloads: number
    createdAt: number
}

export interface GameMod {
    id: string
    name: string
    description?: string
    category: string
    entity?: string
    fileName: string
    fileSize: number
    coverUrl?: string
    images?: string[]
    status: string
    modJson?: string
    requires?: string[]
    source?: string
    userId: string
    downloads: number
    views: number
    likes: number
    isActive: boolean
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    versions?: GameModVersion[]
    latestVersion?: GameModVersion
}

export interface GameDataModule {
    id: string
    label: string
    file: string
    baseId: string
    locale: string
    variants?: string[]
}

export interface GameDataSet {
    id: string
    module: string
    exportName: string
    file: string
    label: string
    baseId: string
    locale: string
    variants?: string[]
    kind: string
    count: number
}

export interface GameDataPage {
    dataset: string
    dataSet: GameDataSet
    total: number
    offset: number
    limit: number
    count: number
    items?: GameDataRecord[]
}

export interface GameDataRecord {
    key: string
    data: unknown
}

export interface GameDataFieldValue {
    value: unknown
    count: number
}

export interface DyePlan {
    id: string
    title: string
    desc?: string
    type: string
    skinId: number
    colorIds?: number[]
    hairCode?: string
    imageUrl?: string
    isOriginal: boolean
    source?: string
    userId: string
    views: number
    likes: number
    commentsCount: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
}

export interface DPS {
    id: string
    charId: number
    buildId?: string
    timelineId?: string
    dpsValue: number
    details?: string
    userId: string
    createdAt: number
    updateAt: number
    user?: User
    build?: Build
    timeline?: Timeline
}

export interface Comment {
    id: string
    targetId: string
    content: string
    createdAt: number
    user?: User
}

export interface BuildInfo {
    buildType: BuildType
}

export interface Build {
    id: string
    title: string
    desc?: string
    charId: number
    charSettings: string
    userId: string
    views: number
    likes: number
    isRecommended?: boolean
    isPinned?: boolean
    createdAt: number
    updateAt: number
    user?: User
    isLiked?: boolean
    targetValue?: number
    info: BuildInfo
}

export interface AdminBugResult {
    bug: Bug
    changed?: string[]
    version: number
}

export interface TagSyncResult {
    added?: string[]
    removed?: string[]
    tagVersion: number
    fixStage: string
    eventId?: string
}

export interface AdminBugJob {
    id: string
    kind: string
    state: string
    priority: string
    attempt: number
    inputRevision: number
    idempotencyKey: string
    inputHash?: string
    leaseOwner?: string
    leaseUntil?: number
    eligibleAt: number
    lastError?: string
    resultRef?: string
    createdAt: number
}

export interface AdminBugJobStateCount {
    state: string
    count: number
}

export interface AdminBugJobsResult {
    total: number
    items?: AdminBugJob[]
    counts?: AdminBugJobStateCount[]
}

export interface AdminBugMergeEvent {
    id: string
    sourceBugIds?: string[]
    targetBugId: string
    revertedAt?: number
    createdAt: number
}

export interface BugEnvironment {
    platform?: string
    region?: string
    gameVersion?: string
    frequency?: string
}

export interface GithubIssueSummary {
    linkId: string
    repositoryId: string
    issueId: string
    issueNumber: number
    htmlUrl: string
    role: string
    syncState: string
    remoteState?: string
    remoteStateReason?: string
    updatedAt?: number
}

export interface Bug {
    id: string
    displayKey: string
    gameId: string
    title: string
    summary: string
    expected?: string
    actual?: string
    steps?: string[]
    environment?: BugEnvironment
    primaryCategory: string
    tags?: string[]
    severity: Severity
    severitySource?: string
    status: BugStatus
    resolution?: string
    fixStage: string
    fixStageSource?: string
    fixEvidenceStatus?: string
    visibility: Visibility
    version: number
    tagVersion: number
    votes: number
    reporters: number
    occurrences: number
    duplicateOf?: string
    fixedVersion?: string
    createdAt: number
    lastActivityAt?: number
    githubIssue?: GithubIssueSummary
}

export interface BugPage {
    total: number
    offset: number
    limit: number
    items?: Bug[]
}

export interface BugEvidenceRef {
    type: string
    versionId?: string
    start?: number
    end?: number
    quote?: string
    assetId?: string
    region?: number[]
    observation?: string
}

export interface BugEvidence {
    occurrenceId: string
    submissionVersionId: string
    relation: string
    evidenceRefs?: BugEvidenceRef[]
    environment?: BugEnvironment
    createdAt: number
}

export interface BugEvent {
    eventId: string
    kind: string
    actorKind?: string
    actorId?: string
    payload?: unknown
    entityVersion?: number
    createdAt: number
}

export interface BugStats {
    votes: number
    reporters: number
    occurrences: number
    feedbacks: number
    comments: number
}

export interface PublicBugDetail {
    bug: Bug
    stats: BugStats
    evidence?: BugEvidence[]
    timeline?: BugEvent[]
    rawSubmissionCount: number
}

export interface RawSubmission {
    submissionId: string
    revision: number
    text: string
    createdAt?: number
}

export interface DiscussionEntry {
    id: string
    bugId: string
    source: DiscussionSource
    author?: string
    body: string
    revision: number
    visibility: Visibility
    deleted: boolean
    createdAt: number
}

export interface DiscussionPage {
    total: number
    offset: number
    limit: number
    items?: DiscussionEntry[]
}

export interface BugRelation {
    id: string
    sourceBugId: string
    targetBugId: string
    relationType: RelationType
    evidenceRefs?: string[]
    origin: string
    state: string
    revision: number
    createdAt: number
}

export interface TagDefinition {
    tagKey: string
    namespace: string
    exclusiveGroup?: string
    displayI18nKey: string
    semanticDescription: string
    allowedSources?: string[]
    evidencePolicy?: string
    canonicalLabel?: string
    githubLabel?: string
}

export interface TagExclusiveGroup {
    group: string
    tagKeys?: string[]
}

export interface TagRegistry {
    registryVersion: number
    tags?: TagDefinition[]
    exclusiveGroups?: TagExclusiveGroup[]
}

export interface SubmissionSummary {
    submissionId: string
    state: SubmissionState
    revision: number
    createdAt: number
    bugIds?: string[]
}

export interface MyBugPage {
    submissions?: SubmissionSummary[]
    votedBugIds?: string[]
    subscribedBugIds?: string[]
}

export interface SubmissionInfo {
    submissionId: string
    gameId: string
    state: SubmissionState
    currentRevision: number
    anonymous: boolean
    createdAt: number
    retentionUntil?: number
}

export interface SubmissionVersion {
    revision: number
    text?: string
    context?: BugEnvironment
    publicationPolicy: PublicationPolicy
    createdAt: number
}

export interface SubmissionAsset {
    assetId: string
    mime: string
    bytes: number
    width?: number
    height?: number
    scanState: string
    redactionState: string
    hasPublicDerivative: boolean
    createdAt: number
}

export interface SubmissionDetail {
    submission: SubmissionInfo
    versions?: SubmissionVersion[]
    assets?: SubmissionAsset[]
    bugIds?: string[]
}

export interface SubmissionReceipt {
    submissionId: string
    revision: number
    state: SubmissionState
    processingMode: string
    receiptToken?: string
    suggestedPollAfterSeconds: number
}

export interface FeedbackReceipt {
    feedbackId: string
    submissionId: string
    bugId: string
    state: SubmissionState
    receiptToken?: string
    suggestedPollAfterSeconds: number
}

export interface CommentResult {
    ok: boolean
    comment?: DiscussionEntry
}

export interface VoteResult {
    bugId: string
    active: boolean
    votes: number
    reporters: number
}

export interface ReopenResult {
    ok: boolean
    bugId: string
    status: BugStatus
    eventId?: string
}

export interface AiQuota {
    day: string
    freeBalance: number
    permanentBalance: number
    totalBalance: number
    dailyLimit: number
}

export interface RechargeBatch {
    id: string
    amountMicros: number
    total: number
    redeemed: number
    revoked: number
    unused: number
    expiresAt?: number
    createdBy?: string
    createdAt?: number
}

export interface RechargeCode {
    code: string
    amountMicros: number
    batchId: string
    status: string
    expiresAt?: number
    redeemedBy?: string
    redeemedAt?: number
    createdAt?: number
}

export interface RechargeBatchResult {
    batch: RechargeBatch
    codes?: string[]
}

export interface RedeemResult {
    success: boolean
    message: string
    amountMicros: number
    quota: AiQuota
}

export interface AdminStats {
    totalUsers: number
    totalGuides: number
    totalRooms: number
    totalMessages: number
    totalBuilds: number
    totalTimelines: number
}

export interface RecentActivity {
    id: string
    user: string
    action: string
    target: string
    time: number
}

export interface Activity {
    id: number
    server: string
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
    createdAt?: number
    updateAt?: number
}

export interface AbyssUsageSubmission {
    id: string
    uidSha256: string
    seasonId: number
    level?: number
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    stars: number
    petId?: number
    createdAt?: number
    updateAt?: number
    roleParticipants?: AbyssUsageRoleParticipant[]
    weaponParticipants?: AbyssUsageWeaponParticipant[]
    reward?: UserExperienceRewardResult
}

export interface AbyssUsageRoleParticipant {
    submissionId: string
    roleType: string
    charId: number
    gradeLevel: number
    createdAt?: number
}

export interface AbyssUsageWeaponParticipant {
    submissionId: string
    roleType: string
    weaponId: number
    skillLevel: number
    createdAt?: number
}

export interface AbyssRoleUsageStat {
    charId: number
    submissionCount: number
    ownedCount: number
    gradeLevelDistribution?: number[]
}

export interface AbyssWeaponUsageStat {
    weaponId: number
    submissionCount: number
    ownedCount: number
    skillLevelDistribution?: number[]
}

export interface AbyssUsageLineupStat {
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    petId?: number
    submissionCount: number
}

export interface AbyssUsageSlotStat {
    id: number
    submissionCount: number
}

export interface AbyssUsageSlotStats {
    support?: AbyssUsageSlotStat[]
    meleeWeapon?: AbyssUsageSlotStat[]
    rangedWeapon?: AbyssUsageSlotStat[]
    pet?: AbyssUsageSlotStat[]
}

export interface AbyssUsageLevelStat {
    level: number
    submissionCount: number
}

export interface UsersUpdateInput {
    name?: string
    qq?: string
}

export interface TodoInput {
    title: string
    description?: string
    startTime?: number
    endTime?: number
}

export interface TimelineInput {
    title: string
    charId: number
    charName: string
    tracks: string
    items: string
}

export interface ShopProductInput {
    name: string
    description?: string
    rewardType: string
    pointsCost: number
    rewardKey: string
    rewardName: string
    displayClass?: string
    displayCss?: string
    sortOrder: number
    isActive: boolean
    startTime?: number
    endTime?: number
}

export interface ScriptCategoryInput {
    name: string
    description?: string
}

export interface ScriptInput {
    title: string
    description?: string
    content: string
    category: string
}

export interface RoomInput {
    name: string
    type?: string
    maxUsers?: number
}

export interface RankingListItemInput {
    charId: number
    buildId: string
    sortOrder?: number
}

export interface RankingListInput {
    name: string
    desc?: string
    items: RankingListItemInput[]
}

export interface GuideInput {
    title: string
    type: string
    content: string
    images: string[]
    charId?: number
    buildId?: string
}

export interface GraphInput {
    title: string
    desc?: string
    graphData: string
}

export interface GameModInput {
    name?: string
    description?: string
    category?: string
    entity?: string
    requires?: string[]
    source?: string
}

export interface GameDataQuery {
    dataset: string
    where?: GameDataFilter[]
    search?: string
    sort?: GameDataSort[]
    fields?: string[]
    offset?: number
    limit?: number
}

export interface GameDataFilter {
    field: string
    op?: GameDataFilterOp
    value?: unknown
}

export interface GameDataSort {
    field: string
    desc?: boolean
}

export interface DyePlanInput {
    title: string
    desc?: string
    type: string
    skinId: number
    colorIds: number[]
    hairCode?: string
    imageUrl?: string
    isOriginal: boolean
    source?: string
}

export interface DPSInput {
    charId: number
    buildId?: string
    timelineId?: string
    dpsValue: number
    details?: string
}

export interface BuildInput {
    title: string
    desc?: string
    charId: number
    charSettings: string
}

export interface AdminBugFields {
    title?: string
    summary?: string
    expected?: string
    actual?: string
    steps?: string[]
    primaryCategory?: string
    severity?: Severity
    status?: BugStatus
    visibility?: Visibility
    resolution?: string
    fixedVersion?: string
}

export interface AdminBugJobFilter {
    states?: string[]
    kinds?: string[]
    limit?: number
}

export interface BugFilter {
    q?: string
    category?: string[]
    tags?: string[]
    tagsMatch?: TagsMatch
    severity?: Severity[]
    status?: BugStatus[]
    fixStage?: string[]
    relationType?: RelationType[]
    platform?: string[]
    region?: string[]
    gameVersion?: string
    versionFrom?: string
    versionTo?: string
}

export interface BugContextInput {
    gameId: string
    platform?: string
    region?: string
    gameVersion?: string
    frequency?: string
}

export interface SubmitBugInput {
    text?: string
    assetIds?: string[]
    context?: BugContextInput
    publicationPolicy: PublicationPolicy
}

export interface FeedbackInput {
    text?: string
    assetIds?: string[]
    reproductionResult?: ReproductionResult
    gameVersion?: string
    environment?: BugContextInput
}

export interface ActivityInput {
    id: number
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
}

export interface ActivityUpdateInput {
    postId?: string
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
}

export interface AbyssOwnedCharInput {
    charId: number
    gradeLevel: number
}

export interface AbyssOwnedWeaponInput {
    weaponId: number
    skillLevel: number
}

export interface AbyssUsageSubmissionInput {
    uidSha256: string
    level?: number
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    stars: number
    petId?: number
    ownedChars?: AbyssOwnedCharInput[]
    ownedWeapons?: AbyssOwnedWeaponInput[]
}

export type GameDataFilterOp = "EQ" | "NE" | "CONTAINS" | "IN" | "GT" | "GTE" | "LT" | "LTE" | "EXISTS"

export type BuildType = "normal" | "transcend"

export type Severity = "S0" | "S1" | "S2" | "S3" | "S4" | "U"

export type BugStatus =
    | "untriaged"
    | "needs_info"
    | "confirmed"
    | "in_progress"
    | "resolved"
    | "closed"
    | "reopen_requested"
    | "duplicate"
    | "rejected"

export type BugSort = "priority" | "severity" | "votes" | "recent" | "created"

export type TagsMatch = "any" | "all"

export type RelationType = "possible_duplicate" | "related" | "regression_of" | "duplicate_of"

export type Visibility = "public" | "private"

export type PublicationPolicy = "INTERNAL_ONLY" | "CATALOG_SAFE" | "GITHUB_SAFE"

export type ReproductionResult = "reproduced" | "not_reproduced" | "unknown"

export type SubmissionState =
    | "received"
    | "queued"
    | "processing"
    | "processed"
    | "needs_info"
    | "privacy_blocked"
    | "filtered"
    | "retry_wait"
    | "failed"
    | "withdrawn"

export type DiscussionSource = "local" | "github" | "system"
